import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { generateToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { users, organizations } from '../db/schema.js';

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

    // Create user
    const [user] = await db.insert(users).values({
      organizationId: org.id,
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'admin',
    }).returning();

    // Generate token
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

    // Verify password
    const valid = await verify(user.passwordHash, data.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Get organization
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date() })
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

export default router;
