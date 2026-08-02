-- CreateEnum
CREATE TYPE "BrowserSessionStatus" AS ENUM ('CREATING', 'WAITING_QR', 'WAITING_LOGIN', 'CONNECTED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BrowserSessionStatus" NOT NULL,
    "qrImagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);
