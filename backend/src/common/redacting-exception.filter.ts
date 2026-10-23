import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { redactGoogleError } from "./redact-google-error";

// Catch-all filter that scrubs secrets (e.g. a refresh_token on a gaxios error)
// off the exception BEFORE delegating to Nest's default handling, which logs
// the full error object. Behaviour is otherwise unchanged: the redacted error
// is passed straight to BaseExceptionFilter, so HTTP responses and status
// codes stay exactly as before.
@Catch()
export class RedactingExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(redactGoogleError(exception), host);
  }
}
