import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimitOptions {
  /** Maximum requests per window per key. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Message returned in the 429 body's `error` field. */
  message: string;
  /** Stable bucket key. Defaults to client IP; authenticated routes can scope by verified user. */
  key?: (req: Request, res: Response) => string;
}

/**
 * Simple in-memory fixed-window rate limiter, keyed by client IP.
 *
 * The key is deliberately based only on the client IP (via trust proxy /
 * X-Forwarded-For) and never on client-supplied headers such as
 * Authorization: an unverified bearer token could be rotated per-request
 * to bypass the limit. If verified per-user identity (e.g. an auth
 * middleware populating req.user) is added later, that can be preferred
 * over the IP.
 *
 * Suitable for a single-process API server; it protects against a single
 * user or scripted client hammering an expensive route.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Periodically drop expired buckets so the map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= options.windowMs) buckets.delete(key);
    }
  }, options.windowMs);
  // Don't keep the process alive just for the sweeper.
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.key?.(req, res) ?? req.ip ?? "unknown";

    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.windowStart + options.windowMs - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}
