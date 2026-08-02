/*
  Warnings:

  - The values [PEDNGING] on the enum `VideoStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[type,username]` on the table `Account` will be added. If there are existing duplicate values, this will fail.
  - Made the column `username` on table `Account` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `type` to the `BrowserSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VideoStatus_new" AS ENUM ('PEDNING', 'UPLOADING', 'FAILED', 'SCHEDULED', 'POSTED');
ALTER TABLE "Video" ALTER COLUMN "status" TYPE "VideoStatus_new" USING ("status"::text::"VideoStatus_new");
ALTER TYPE "VideoStatus" RENAME TO "VideoStatus_old";
ALTER TYPE "VideoStatus_new" RENAME TO "VideoStatus";
DROP TYPE "public"."VideoStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "username" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrowserSession" ADD COLUMN     "type" "AccountType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Account_type_username_key" ON "Account"("type", "username");
