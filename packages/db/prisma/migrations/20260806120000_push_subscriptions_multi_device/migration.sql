-- Abonnements Web Push : un enregistrement par appareil.
-- Avant : colonne scalaire users.push_subscription — s'abonner sur un second
-- téléphone écrasait le premier, qui cessait silencieusement de recevoir.

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- L'endpoint identifie l'abonnement côté navigateur : deux comptes ne peuvent
-- pas revendiquer le même (le second upsert réattribue la ligne).
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise des abonnements déjà enregistrés : les appareils actuels continuent
-- de recevoir sans avoir à se réabonner.
INSERT INTO "push_subscriptions" ("id", "user_id", "endpoint", "p256dh", "auth")
SELECT
    gen_random_uuid(),
    "id",
    "push_subscription" ->> 'endpoint',
    "push_subscription" -> 'keys' ->> 'p256dh',
    "push_subscription" -> 'keys' ->> 'auth'
FROM "users"
WHERE "push_subscription" IS NOT NULL
  AND "push_subscription" ->> 'endpoint' IS NOT NULL
  AND "push_subscription" -> 'keys' ->> 'p256dh' IS NOT NULL
  AND "push_subscription" -> 'keys' ->> 'auth' IS NOT NULL
ON CONFLICT ("endpoint") DO NOTHING;

-- users.push_subscription est conservée (lecture seule) le temps de vérifier la
-- reprise ; elle n'est plus jamais écrite par l'application.
