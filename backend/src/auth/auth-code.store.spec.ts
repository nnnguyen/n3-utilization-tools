import { AuthCodeStore } from "./auth-code.store";

describe("AuthCodeStore", () => {
  const user = { id: "user-1", email: "a@example.com", name: "A", avatarUrl: null };
  let store: AuthCodeStore;

  beforeEach(() => {
    store = new AuthCodeStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the token and user for a fresh code", () => {
    const code = store.create("jwt-token", user);
    expect(store.consume(code)).toEqual({ token: "jwt-token", user });
  });

  it("only works once", () => {
    const code = store.create("jwt-token", user);
    store.consume(code);
    expect(store.consume(code)).toBeNull();
  });

  it("rejects unknown codes", () => {
    expect(store.consume("made-up")).toBeNull();
  });

  it("rejects codes older than a minute", () => {
    jest.useFakeTimers();
    const code = store.create("jwt-token", user);
    jest.advanceTimersByTime(61_000);
    expect(store.consume(code)).toBeNull();
  });

  it("issues a different, unguessable code each time", () => {
    const a = store.create("t1", user);
    const b = store.create("t2", user);
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
