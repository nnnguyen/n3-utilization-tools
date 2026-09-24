import "./bigint-json";

describe("BigInt JSON serialization", () => {
  it("serializes a BigInt field as a number", () => {
    const log = { recordingId: "abc", fileSize: BigInt(734003200) };
    expect(JSON.stringify(log)).toBe('{"recordingId":"abc","fileSize":734003200}');
  });

  it("keeps null sizes as null", () => {
    expect(JSON.stringify({ fileSize: null })).toBe('{"fileSize":null}');
  });

  it("falls back to a string beyond the safe integer range", () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(10);
    expect(JSON.stringify({ fileSize: huge })).toBe(`{"fileSize":"${huge.toString()}"}`);
  });
});
