-- CreateTable
CREATE TABLE "ZoomConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "webhookSecretToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "refreshToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoomConfig_userId_key" ON "ZoomConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeConfig_userId_key" ON "YoutubeConfig"("userId");

-- AddForeignKey
ALTER TABLE "ZoomConfig" ADD CONSTRAINT "ZoomConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeConfig" ADD CONSTRAINT "YoutubeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
