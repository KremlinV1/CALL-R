import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { generateToken, verifyToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { users, organizations } from '../db/schema.js';

async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return bcrypt.compare(password, passwordHash);
  }
  return verify(passwordHash, password);
}

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const passwordHash = await hash(data.password);

    // Create organization
    const orgSlug = data.organizationName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const [org] = await db.insert(organizations).values({
      name: data.organizationName,
      slug: orgSlug,
    }).returning();

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const [user] = await db.insert(users).values({
      organizationId: org.id,
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'admin',
      emailVerified: false,
      verificationToken,
      verificationTokenExpiresAt,
    }).returning();

    // Log verification URL (replace with email service in production)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    console.log(`\n📧 Verification email for ${user.email}:\n   ${verifyUrl}\n`);

    // Generate JWT token
    const token = await generateToken({
      sub: user.id,
      email: user.email,
      organizationId: org.id,
      role: user.role,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: false,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user with organization
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password (supports both argon2 and bcrypt hashes)
    const valid = await verifyPassword(user.passwordHash, data.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Get organization
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });

    // Update last login — also upgrade bcrypt hashes to argon2
    const updateData: { lastLoginAt: Date; passwordHash?: string; updatedAt?: Date } = {
      lastLoginAt: new Date(),
    };
    if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2y$')) {
      updateData.passwordHash = await hash(data.password);
      updateData.updatedAt = new Date();
    }
    await db.update(users)
      .set(updateData)
      .where(eq(users.id, user.id));

    // Generate token
    const token = await generateToken({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified ?? false,
      },
      organization: org ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
      } : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const token = authHeader ? authHeader.split(' ')[1] : queryToken!;
    const { verifyToken } = await import('../middleware/auth.js');
    const payload = await verifyToken(token);

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified ?? false,
      },
      organization: org ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
      } : null,
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Verify email
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.verificationToken, token),
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid verification token' });
      return;
    }

    if (user.emailVerified) {
      res.json({ message: 'Email already verified' });
      return;
    }

    if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
      res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
      return;
    }

    await db.update(users)
      .set({
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const jwtToken = authHeader.split(' ')[1];
    const payload = await verifyToken(jwtToken);

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.emailVerified) {
      res.json({ message: 'Email already verified' });
      return;
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.update(users)
      .set({
        verificationToken: newToken,
        verificationTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${newToken}`;
    console.log(`\n📧 Re-sent verification email for ${user.email}:\n   ${verifyUrl}\n`);

    res.json({ message: 'Verification email resent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

export default router;
