import { HttpException } from "@nestjs/common";

// User-facing API errors carry a stable `code` the frontend translates
// (apiError.<code> in frontend/lib/i18n); `message` stays the Vietnamese text
// for older clients and logs. `params` fill {placeholders} of the translation.
export function codedError<E extends HttpException>(
  Exception: new (response: object) => E,
  code: string,
  message: string,
  params?: Record<string, string | number | null>,
): E {
  return new Exception({ code, message, ...(params ? { params } : {}) });
}
