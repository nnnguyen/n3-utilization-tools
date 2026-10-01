/*
  Warnings:

  - You are about to drop the `YoutubeConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `YoutubeQuotaUsage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ZoomConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "YoutubeConfig" DROP CONSTRAINT "YoutubeConfig_userId_fkey";

-- DropForeignKey
ALTER TABLE "YoutubeQuotaUsage" DROP CONSTRAINT "YoutubeQuotaUsage_userId_fkey";

-- DropForeignKey
ALTER TABLE "ZoomConfig" DROP CONSTRAINT "ZoomConfig_userId_fkey";

-- DropTable
DROP TABLE "YoutubeConfig";

-- DropTable
DROP TABLE "YoutubeQuotaUsage";

-- DropTable
DROP TABLE "ZoomConfig";
