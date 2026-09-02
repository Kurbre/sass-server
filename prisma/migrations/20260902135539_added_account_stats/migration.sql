-- CreateTable
CREATE TABLE "account_stats" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "videos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "account_stats_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "account_stats" ADD CONSTRAINT "account_stats_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
