/*
  Warnings:

  - The `address` column on the `Complaint` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Complaint" DROP COLUMN "address",
ADD COLUMN     "address" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPasswordSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupToken" TEXT,
ADD COLUMN     "setupTokenExpiry" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';
