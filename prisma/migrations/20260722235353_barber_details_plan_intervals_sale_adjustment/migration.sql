-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."PlanInterval" ADD VALUE 'QUARTERLY';
ALTER TYPE "public"."PlanInterval" ADD VALUE 'SEMIANNUAL';

-- AlterTable
ALTER TABLE "public"."barbers" ADD COLUMN     "address" JSONB,
ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "document" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "public"."sales" ADD COLUMN     "adjustment_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "adjustment_mode" TEXT,
ADD COLUMN     "adjustment_value" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal_cents" INTEGER NOT NULL DEFAULT 0;
