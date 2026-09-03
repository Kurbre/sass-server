/*
  Warnings:

  - You are about to drop the column `collect` on the `videos` table. All the data in the column will be lost.
  - You are about to drop the column `comments` on the `videos` table. All the data in the column will be lost.
  - You are about to drop the column `likes` on the `videos` table. All the data in the column will be lost.
  - You are about to drop the column `shares` on the `videos` table. All the data in the column will be lost.
  - You are about to drop the column `views` on the `videos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "videos" DROP COLUMN "collect",
DROP COLUMN "comments",
DROP COLUMN "likes",
DROP COLUMN "shares",
DROP COLUMN "views";

-- CreateTable
CREATE TABLE "video_stats" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_stats_videoId_createdAt_idx" ON "video_stats"("videoId", "createdAt");

-- AddForeignKey
ALTER TABLE "video_stats" ADD CONSTRAINT "video_stats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
