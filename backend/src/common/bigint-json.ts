// BigInt columns (ZoomSyncLog.fileSize) are not JSON-serializable:
// JSON.stringify throws "Do not know how to serialize a BigInt", which Nest
// turns into a 500 on any endpoint returning such a row (e.g. GET /zoom/logs
// once a sync has recorded its file size). Serialize them as numbers — file
// sizes stay far below 2^53 — or as strings beyond the safe integer range.
// Imported once, first thing, by main.ts.
declare global {
  interface BigInt {
    toJSON(): number | string;
  }
}

BigInt.prototype.toJSON = function (this: bigint) {
  const n = Number(this);
  return Number.isSafeInteger(n) ? n : this.toString();
};

export {};
