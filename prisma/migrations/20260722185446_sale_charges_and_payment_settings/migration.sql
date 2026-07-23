-- CreateEnum
CREATE TYPE "public"."ChargeStatus" AS ENUM ('PENDING', 'APPROVED', 'EXPIRED', 'CANCELED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."tenant_settings" ADD COLUMN     "mp_access_token" TEXT,
ADD COLUMN     "mp_webhook_secret" TEXT,
ADD COLUMN     "payment_provider" TEXT;

-- CreateTable
CREATE TABLE "public"."sale_charges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT,
    "method" "public"."PaymentMethod" NOT NULL DEFAULT 'PIX',
    "amount_cents" INTEGER NOT NULL,
    "status" "public"."ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "qr_code" TEXT,
    "qr_code_base64" TEXT,
    "ticket_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_charges_tenant_id_idx" ON "public"."sale_charges"("tenant_id");

-- CreateIndex
CREATE INDEX "sale_charges_sale_id_idx" ON "public"."sale_charges"("sale_id");

-- CreateIndex
CREATE INDEX "sale_charges_external_id_idx" ON "public"."sale_charges"("external_id");

-- AddForeignKey
ALTER TABLE "public"."sale_charges" ADD CONSTRAINT "sale_charges_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
