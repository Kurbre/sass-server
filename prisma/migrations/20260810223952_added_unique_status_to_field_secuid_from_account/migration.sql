/*
  Warnings:

  - A unique constraint covering the columns `[secuid]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Account_secuid_key" ON "Account"("secuid");
