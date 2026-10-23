import { redactGoogleError } from "./redact-google-error";

describe("redactGoogleError", () => {
  it("scrubs the refresh_token from a gaxios-style error's request body", () => {
    const body = new URLSearchParams({
      refresh_token: "1//SECRET-REFRESH-TOKEN",
      grant_type: "refresh_token",
    });
    const error: any = Object.assign(new Error("invalid_request"), {
      config: { data: body, url: "https://oauth2.googleapis.com/token" },
      request: { body },
      response: {
        config: { data: body },
        data: { error: "invalid_request" },
      },
    });

    redactGoogleError(error);

    const dump = JSON.stringify({
      msg: error.message,
      config: error.config,
      request: error.request,
      responseConfig: error.response.config,
    });
    expect(dump).not.toContain("SECRET-REFRESH-TOKEN");
    expect(error.config.data).toBe("[REDACTED]");
    expect(error.request.body).toBe("[REDACTED]");
    expect(error.response.config.data).toBe("[REDACTED]");
  });

  it("preserves the message, status and response error code", () => {
    const error: any = Object.assign(new Error("invalid_grant"), {
      status: 400,
      config: { data: new URLSearchParams({ refresh_token: "x" }) },
      response: { data: { error: "invalid_grant" }, status: 400 },
    });

    redactGoogleError(error);

    expect(error.message).toBe("invalid_grant");
    expect(error.status).toBe(400);
    expect(error.response.data.error).toBe("invalid_grant");
  });

  it("redacts a token echoed back in a response body", () => {
    const error: any = {
      response: { data: { refresh_token: "1//SECRET", access_token: "ya29.SECRET" } },
    };

    redactGoogleError(error);

    expect(error.response.data.refresh_token).toBe("[REDACTED]");
    expect(error.response.data.access_token).toBe("[REDACTED]");
  });

  it("never throws on non-object / nullish input", () => {
    expect(() => redactGoogleError(null)).not.toThrow();
    expect(() => redactGoogleError(undefined)).not.toThrow();
    expect(() => redactGoogleError("boom")).not.toThrow();
    expect(redactGoogleError("boom")).toBe("boom");
  });
});
