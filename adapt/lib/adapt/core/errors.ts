export type ErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT";

export class AdaptError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);

    this.name = "AdaptError";
    this.code = code;
  }
}
