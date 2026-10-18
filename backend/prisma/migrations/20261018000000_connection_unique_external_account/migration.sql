-- The connection upsert targets (userId, provider, externalAccountId) and
-- (workspaceId, provider, externalAccountId), coercing a missing external
-- account id to ''. Backfill existing NULLs so those upserts match the rows
-- that were created under the old (userId, provider) / (workspaceId, provider)
-- constraints instead of inserting duplicates.
UPDATE "Connection" SET "externalAccountId" = '' WHERE "externalAccountId" IS NULL;

-- DropIndex
DROP INDEX "Connection_userId_provider_key";

-- DropIndex
DROP INDEX "Connection_workspaceId_provider_key";

-- CreateIndex
CREATE UNIQUE INDEX "Connection_userId_provider_externalAccountId_key" ON "Connection"("userId", "provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_workspaceId_provider_externalAccountId_key" ON "Connection"("workspaceId", "provider", "externalAccountId");
