-- Remove redundant duplicate "singleton" provider connections.
--
-- The /connections UI (IntegrationsService.listConnections) shows exactly one
-- card per singleton provider per user. When several Connection rows exist for
-- the same (userId, provider) -- e.g. an old disabled one plus a newer active
-- one -- the backend keeps the "best" and hides the rest. This migration
-- deletes those hidden, redundant rows so the database matches the UI.
--
-- "Best" row per (userId, provider), mirroring the service's sort:
--   1. status = 'active' is preferred over any other status
--   2. then the most recently updated row ("updatedAt" DESC)
--   3. then lowest id, purely as a deterministic tie-breaker
-- Only rows ranked 2nd or lower within their group are deleted.

DELETE FROM "Connection" c
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "userId", provider
      ORDER BY
        (CASE WHEN status = 'active' THEN 0 ELSE 1 END) ASC,
        "updatedAt" DESC,
        id ASC
    ) AS rn
  FROM "Connection"
  WHERE provider IN ('youtube', 'zoom', 'google_drive', 'onedrive')
) ranked
WHERE c.id = ranked.id
  AND ranked.rn > 1;
