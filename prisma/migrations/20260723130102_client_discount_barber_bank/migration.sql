-- AlterTable
ALTER TABLE "public"."barbers" ADD COLUMN     "bank_data" JSONB,
ADD COLUMN     "pix_key" TEXT;

-- AlterTable
ALTER TABLE "public"."clients" ADD COLUMN     "discount_balance_cents" INTEGER NOT NULL DEFAULT 0;
