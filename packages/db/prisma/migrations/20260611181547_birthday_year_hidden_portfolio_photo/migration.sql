-- AlterTable
ALTER TABLE "portfolios" ADD COLUMN     "photo_url" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birthday_year_hidden" BOOLEAN NOT NULL DEFAULT false;
