import { ApiError } from "../error/ApiError";

export class RateLimiter {
  private readonly rateLimitedEndpoints: Map<string, number> = new Map();
  private readonly defaultResetTime: number;

  constructor(defaultResetTime = 60000) {
    this.defaultResetTime = defaultResetTime;
  }

  checkRateLimit(endpoint: string): void {
    if (this.rateLimitedEndpoints.has(endpoint)) {
      const limitExpires = this.rateLimitedEndpoints.get(endpoint) || 0;
      const now = Date.now();

      if (now < limitExpires) {
        const retryAfter = Math.ceil((limitExpires - now) / 1000);
        throw ApiError.rateLimit(retryAfter);
      }

      this.rateLimitedEndpoints.delete(endpoint);
    }
  }

  setRateLimit(endpoint: string, retryAfter?: string | number): void {
    const retryMs =
      typeof retryAfter === "string"
        ? parseInt(retryAfter) * 1000
        : typeof retryAfter === "number"
          ? retryAfter * 1000
          : this.defaultResetTime;

    this.rateLimitedEndpoints.set(endpoint, Date.now() + retryMs);
  }

  clearRateLimit(endpoint: string): void {
    this.rateLimitedEndpoints.delete(endpoint);
  }

  clearAllRateLimits(): void {
    this.rateLimitedEndpoints.clear();
  }
}
