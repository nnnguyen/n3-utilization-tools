-- CreateTable
CREATE TABLE "DynamicQR" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "shortCode" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicQR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DynamicQR_shortCode_key" ON "DynamicQR"("shortCode");

-- CreateIndex
CREATE INDEX "DynamicQR_workspaceId_idx" ON "DynamicQR"("workspaceId");

-- AddForeignKey
ALTER TABLE "DynamicQR" ADD CONSTRAINT "DynamicQR_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
