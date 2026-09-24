-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'vi',
ADD COLUMN     "themeMode" TEXT NOT NULL DEFAULT 'light',
ADD COLUMN     "themeStyle" TEXT NOT NULL DEFAULT 'broadsheet';
