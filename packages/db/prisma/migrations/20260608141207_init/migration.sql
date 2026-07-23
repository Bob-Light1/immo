-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'bailleur', 'locataire');

-- CreateEnum
CREATE TYPE "CompteurType" AS ENUM ('eau', 'electricite');

-- CreateEnum
CREATE TYPE "CompteurScope" AS ENUM ('cite', 'bloc', 'chambre');

-- CreateEnum
CREATE TYPE "FacturePubStatut" AS ENUM ('brouillon', 'publiee');

-- CreateEnum
CREATE TYPE "LigneStatut" AS ENUM ('en_attente', 'partiel', 'paye', 'retard');

-- CreateEnum
CREATE TYPE "PaiementMode" AS ENUM ('especes', 'orange_money', 'mtn_momo', 'virement');

-- CreateEnum
CREATE TYPE "EvenementStatut" AS ENUM ('en_attente', 'approuve', 'rejete');

-- CreateEnum
CREATE TYPE "TicketCategorie" AS ENUM ('plomberie', 'electricite', 'mobilier', 'autre');

-- CreateEnum
CREATE TYPE "TicketStatut" AS ENUM ('ouvert', 'en_cours', 'resolu');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('annonce', 'alerte_facture', 'anniversaire', 'detresse', 'lecture', 'evenement', 'prediction', 'maintenance', 'sondage', 'systeme');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150),
    "phone" VARCHAR(20),
    "room_id" UUID,
    "language" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "first_login" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "distress_disabled" BOOLEAN NOT NULL DEFAULT false,
    "distress_review" BOOLEAN NOT NULL DEFAULT false,
    "birthday" DATE,
    "birthday_public" BOOLEAN NOT NULL DEFAULT false,
    "notif_prefs" JSONB,
    "push_subscription" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chambres" (
    "id" UUID NOT NULL,
    "bloc" VARCHAR(20) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "compteur_elec_id" UUID,
    "capacite" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chambres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteurs" (
    "id" UUID NOT NULL,
    "type" "CompteurType" NOT NULL,
    "libelle" VARCHAR(60) NOT NULL,
    "dernier_index" BIGINT NOT NULL DEFAULT 0,
    "scope" "CompteurScope" NOT NULL DEFAULT 'cite',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compteurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "montant_total" BIGINT NOT NULL,
    "somme_coeff" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "base_unitaire" BIGINT NOT NULL DEFAULT 0,
    "compteur_id" UUID,
    "mois" VARCHAR(7) NOT NULL,
    "date_limite" DATE NOT NULL,
    "statut_pub" "FacturePubStatut" NOT NULL DEFAULT 'brouillon',
    "is_reconducted" BOOLEAN NOT NULL DEFAULT false,
    "reconduction_streak" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture_locataire" (
    "id" UUID NOT NULL,
    "facture_id" UUID NOT NULL,
    "locataire_id" UUID NOT NULL,
    "coefficient" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "montant_du" BIGINT NOT NULL,
    "montant_paye" BIGINT NOT NULL DEFAULT 0,
    "statut" "LigneStatut" NOT NULL DEFAULT 'en_attente',
    "date_paiement" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facture_locataire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" UUID NOT NULL,
    "facture_locataire_id" UUID NOT NULL,
    "montant" BIGINT NOT NULL,
    "mode" "PaiementMode" NOT NULL,
    "reference" VARCHAR(80),
    "justificatif_url" TEXT,
    "recorded_by" UUID NOT NULL,
    "recu_pdf_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "sender_id" UUID,
    "target_role" VARCHAR(20),
    "target_user" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "channels" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "contenu" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "is_read_admin" BOOLEAN NOT NULL DEFAULT false,
    "bailleur_visible" BOOLEAN NOT NULL DEFAULT true,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenements" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "titre" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "date_event" DATE NOT NULL,
    "heure" VARCHAR(5) NOT NULL,
    "statut" "EvenementStatut" NOT NULL DEFAULT 'en_attente',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "competences" JSONB,
    "diplomes" JSONB,
    "realisations" JSONB,
    "contact" VARCHAR(150),
    "email_pro" VARCHAR(150),
    "dispo_recommandation" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distress_signals" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geo_consent" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" UUID,

    CONSTRAINT "distress_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts_info" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "titre" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "image_url" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projets_communs" (
    "id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "titre" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "objectifs" JSONB,
    "vision" TEXT,
    "besoins_financiers" BIGINT,
    "montant_contribution" BIGINT,
    "image_url" TEXT,
    "visible_roles" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projets_communs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projet_contributions" (
    "id" UUID NOT NULL,
    "projet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "montant" BIGINT NOT NULL,
    "paiement_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projet_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions_facture" (
    "id" UUID NOT NULL,
    "mois" VARCHAR(7) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "indice_diff" BIGINT,
    "prix_unit" BIGINT,
    "tva" BIGINT,
    "loc_compteur" BIGINT,
    "transport" BIGINT,
    "montant_calcule" BIGINT NOT NULL,
    "montant_reel" BIGINT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "room_id" UUID,
    "categorie" "TicketCategorie" NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "statut" "TicketStatut" NOT NULL DEFAULT 'ouvert',
    "priorite" INTEGER NOT NULL DEFAULT 0,
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sondages" (
    "id" UUID NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "options" JSONB NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sondages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sondage_votes" (
    "id" UUID NOT NULL,
    "sondage_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "choix" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sondage_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "titre" VARCHAR(200) NOT NULL,
    "fichier_url" TEXT NOT NULL,
    "categorie" VARCHAR(40) NOT NULL,
    "visible_roles" JSONB,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "chambres_bloc_numero_key" ON "chambres"("bloc", "numero");

-- CreateIndex
CREATE INDEX "factures_mois_idx" ON "factures"("mois");

-- CreateIndex
CREATE INDEX "factures_type_mois_idx" ON "factures"("type", "mois");

-- CreateIndex
CREATE INDEX "facture_locataire_locataire_id_idx" ON "facture_locataire"("locataire_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_locataire_facture_id_locataire_id_key" ON "facture_locataire"("facture_id", "locataire_id");

-- CreateIndex
CREATE INDEX "paiements_facture_locataire_id_idx" ON "paiements"("facture_locataire_id");

-- CreateIndex
CREATE INDEX "notifications_target_user_is_read_idx" ON "notifications"("target_user", "is_read");

-- CreateIndex
CREATE INDEX "notifications_target_role_idx" ON "notifications"("target_role");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_user_id_key" ON "portfolios"("user_id");

-- CreateIndex
CREATE INDEX "distress_signals_sender_id_sent_at_idx" ON "distress_signals"("sender_id", "sent_at");

-- CreateIndex
CREATE INDEX "posts_info_created_at_idx" ON "posts_info"("created_at");

-- CreateIndex
CREATE INDEX "maintenance_tickets_statut_idx" ON "maintenance_tickets"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "sondage_votes_sondage_id_user_id_key" ON "sondage_votes"("sondage_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chambres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chambres" ADD CONSTRAINT "chambres_compteur_elec_id_fkey" FOREIGN KEY ("compteur_elec_id") REFERENCES "compteurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_compteur_id_fkey" FOREIGN KEY ("compteur_id") REFERENCES "compteurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_locataire" ADD CONSTRAINT "facture_locataire_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_locataire" ADD CONSTRAINT "facture_locataire_locataire_id_fkey" FOREIGN KEY ("locataire_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_facture_locataire_id_fkey" FOREIGN KEY ("facture_locataire_id") REFERENCES "facture_locataire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_fkey" FOREIGN KEY ("target_user") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenements" ADD CONSTRAINT "evenements_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distress_signals" ADD CONSTRAINT "distress_signals_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts_info" ADD CONSTRAINT "posts_info_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projets_communs" ADD CONSTRAINT "projets_communs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projet_contributions" ADD CONSTRAINT "projet_contributions_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets_communs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projet_contributions" ADD CONSTRAINT "projet_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions_facture" ADD CONSTRAINT "predictions_facture_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sondage_votes" ADD CONSTRAINT "sondage_votes_sondage_id_fkey" FOREIGN KEY ("sondage_id") REFERENCES "sondages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sondage_votes" ADD CONSTRAINT "sondage_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
