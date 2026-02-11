import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'
);

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader ? authHeader.split(' ')[1] : queryToken!;

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    req.user = {
      id: payload.sub as string,
      email: payload.email as string,
      organizationId: payload.organizationId as string,
      role: payload.role as string,
    };

    next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

export async function generateToken(payload: {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
}): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET);
  return payload;
}
