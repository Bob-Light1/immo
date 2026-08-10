-- Invoice type normalization + duplicate prevention.
--
-- `factures.type` is free text. Every comparison outside `isLoyer()` used the
-- raw label, so "Eau", "eau" and " Eau" behaved as three distinct types for the
-- list filter, the roll-over dedup and (absent) duplicate detection. A folded
-- `type_key` column now backs all of them.
--
-- NOTE: the two unique indexes below will fail on a database that already holds
-- duplicates. That is deliberate — silently dropping an invoice would destroy
-- financial history. Find them first, then merge or delete by hand:
--   SELECT type_key, mois, count(*) FROM factures
--   GROUP BY 1, 2 HAVING count(*) > 1;
--   SELECT left(mois, 4), count(*) FROM factures
--   WHERE type_key = 'loyer' GROUP BY 1 HAVING count(*) > 1;

ALTER TABLE "factures" ADD COLUMN "type_key" VARCHAR(60);

-- Mirrors `normalizeFactureType`: strip diacritics, trim, lowercase.
-- `translate()` is used rather than `unaccent()` so the migration needs no
-- extension (and therefore no superuser) on the production instance.
UPDATE "factures"
SET "type_key" = lower(btrim(translate(
  "type",
  'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýŸÿ',
  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyYy'
)));

ALTER TABLE "factures" ALTER COLUMN "type_key" SET NOT NULL;

DROP INDEX IF EXISTS "factures_type_mois_idx";
CREATE INDEX "factures_type_key_mois_idx" ON "factures"("type_key", "mois");

-- One invoice per type and per month.
CREATE UNIQUE INDEX "factures_type_key_mois_key" ON "factures"("type_key", "mois");

-- Rent is a flat *annual* amount: two rent invoices filed under two different
-- months of the same year would bill each tenant twice for that year. The
-- (type_key, mois) rule above cannot express this, hence a partial index on the
-- year part of the month key.
CREATE UNIQUE INDEX "factures_loyer_annee_key"
  ON "factures" (left("mois", 4)) WHERE "type_key" = 'loyer';

-- Never written since the schema was introduced: receipts are rendered on the
-- fly by `paiementRecuPdf`, never stored.
ALTER TABLE "paiements" DROP COLUMN "recu_pdf_url";
