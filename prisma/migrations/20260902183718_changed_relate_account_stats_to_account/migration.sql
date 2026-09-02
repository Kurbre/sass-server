/*
  Warnings:

  - A unique constraint covering the columns `[accountId]` on the table `account_stats` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "account_stats_accountId_key" ON "account_stats"("accountId");
