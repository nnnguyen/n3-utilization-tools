import { GoogleCallbackGuard } from "./google-callback.guard";

describe("GoogleCallbackGuard", () => {
  const guard = new GoogleCallbackGuard();
  const contextFor = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

  it("passes the Google profile through", () => {
    const request: any = {};
    expect(guard.handleRequest(null, { email: "a@b.c" }, null, contextFor(request))).toEqual({ email: "a@b.c" });
    expect(request.googleAuthError).toBeUndefined();
  });

  it("does not throw on a code Google refused, and flags it", () => {
    const request: any = {};
    const error = Object.assign(new Error("Malformed auth code."), { code: "invalid_grant" });
    expect(() => guard.handleRequest(error, false, null, contextFor(request))).not.toThrow();
    expect(guard.handleRequest(error, false, null, contextFor(request))).toBeNull();
    expect(request.googleAuthError).toBe(true);
  });

  it("does not throw when the user cancels on Google's screen", () => {
    const request: any = {};
    expect(guard.handleRequest(null, false, { message: "access_denied" }, contextFor(request))).toBeNull();
    expect(request.googleAuthError).toBeUndefined();
  });
});
