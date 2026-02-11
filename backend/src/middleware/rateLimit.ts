import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Simple in-memory rate limiter.
 * For multi-instance production, swap to Redis-backed limiter.
 */
export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max, message = 'Too many requests, please try again later.' } = opts;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(max - 1));
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(max - entry.count));
    next();
  };
}

// Presets
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again in 15 minutes.' });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
