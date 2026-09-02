export class SocialApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 0,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "SocialApiError";
  }
}
