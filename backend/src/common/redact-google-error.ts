// Google / gaxios errors (from googleapis OAuth token refresh) carry the
// outgoing request body on `config.data` / `config.body` as a URLSearchParams
// that contains the `refresh_token`. When such an error is logged in full
// (e.g. by Nest's default ExceptionsHandler), the refresh token leaks into the
// logs. gaxios' own default redactor does not strip `refresh_token`.
//
// This scrubs the sensitive request/response payloads off the error IN PLACE
// so that whoever logs it afterwards -- our logger, Nest, or an unhandled
// rejection handler -- never sees the secret. It mutates and returns the same
// object so the error type, message, status and `response.data.error` code
// remain intact for callers that inspect them (e.g. invalid_grant handling).
//
// Never throws: redaction must not break the failing flow it runs inside.

const SENSITIVE_KEYS = ["data", "body"];

function scrubConfig(config: unknown): void {
  if (!config || typeof config !== "object") return;
  const c = config as Record<string, unknown>;
  for (const key of SENSITIVE_KEYS) {
    if (c[key] != null) c[key] = "[REDACTED]";
  }
}

export function redactGoogleError<T>(error: T): T {
  try {
    const e = error as unknown as Record<string, any>;
    if (!e || typeof e !== "object") return error;

    // Outgoing request payload (where refresh_token lives)
    scrubConfig(e.config);
    scrubConfig(e.request);
    scrubConfig(e.response?.config);

    // Defensive: in case a token is ever echoed back in a response body
    const respData = e.response?.data;
    if (respData && typeof respData === "object") {
      for (const key of ["refresh_token", "access_token", "id_token"]) {
        if (key in respData) respData[key] = "[REDACTED]";
      }
    }
  } catch {
    // ignore — never let redaction throw
  }
  return error;
}
