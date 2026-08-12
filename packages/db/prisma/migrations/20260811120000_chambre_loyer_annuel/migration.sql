-- Rent tariff carried by the room.
--
-- Rent used to be a single figure typed on the invoice and applied to the whole
-- residence, which no residence actually charges: a room's annual rent depends
-- on the room, and it is restated every year as rents follow inflation. The
-- tariff therefore lives on the room, and a rent invoice reads it to fill each
-- tenant's line. Amounts already frozen on published invoices are untouched by
-- a later change of tariff — they stay on their lines.
--
-- Default 0 means "not priced yet", which is what every existing room is: the
-- invoice asks the Admin for the amount rather than billing a room at nothing.

ALTER TABLE "chambres" ADD COLUMN "loyer_annuel" BIGINT NOT NULL DEFAULT 0;
