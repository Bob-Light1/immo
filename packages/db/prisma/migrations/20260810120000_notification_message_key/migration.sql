-- Localizable notifications.
--
-- Notifications were stored as finished French sentences, so a resident who
-- switched to English or German kept an inbox they could not read: only the
-- messages sent afterwards would have been translated. Rows now carry the
-- catalogue key and its parameters, and are rendered in the reader's current
-- language at read time.
--
-- Both columns are nullable on purpose. Announcements and community posts are
-- free text written by a human and can never be keyed, and existing rows have
-- no key either: `title`/`body` remain the fallback in both cases.

ALTER TABLE "notifications" ADD COLUMN "message_key" VARCHAR(60);
ALTER TABLE "notifications" ADD COLUMN "params" JSONB;
