-- StundTransfer: additive migration (new nullable column only)
-- AlterTable
ALTER TABLE "StundDepositFile" ADD COLUMN "targetName" TEXT;

