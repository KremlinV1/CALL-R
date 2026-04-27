import { Router, Response } from 'express';
import { db } from '../db';
import { users, organizations, escrowClaims } from '../db/schema';
import { eq, ilike, or, and, sql, desc, count } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();

// Middleware to check if user is admin or owner
const requireAdmin = (req: AuthRequest, res: Response, next: Function) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'owner')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get admin stats
router.get('/stats', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Total users
    const totalUsersResult = await db.select({ count: count() }).from(users);
    const totalUsers = Number(totalUsersResult[0]?.count || 0);

    // Total organizations
    const totalOrgsResult = await db.select({ count: count() }).from(organizations);
    const totalOrganizations = Number(totalOrgsResult[0]?.count || 0);

    // Active users (logged in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(sql`${users.lastLoginAt} >= ${thirtyDaysAgo}`);
    const activeUsers = Number(activeUsersResult[0]?.count || 0);

    // New users this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(sql`${users.createdAt} >= ${startOfMonth}`);
    const newUsersThisMonth = Number(newUsersResult[0]?.count || 0);

    // Users by role
    const ownerCount = await db.select({ count: count() }).from(users).where(eq(users.role, 'owner'));
    const adminCount = await db.select({ count: count() }).from(users).where(eq(users.role, 'admin'));
    const memberCount = await db.select({ count: count() }).from(users).where(eq(users.role, 'member'));

    res.json({
      totalUsers,
      totalOrganizations,
      activeUsers,
      newUsersThisMonth,
      usersByRole: {
        owner: Number(ownerCount[0]?.count || 0),
        admin: Number(adminCount[0]?.count || 0),
        member: Number(memberCount[0]?.count || 0),
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get all users with filtering
router.get('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { search, role, organizationId, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        organizationId: users.organizationId,
        organization: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        }
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id));

    const conditions: any[] = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(users.email, searchTerm),
          ilike(users.firstName, searchTerm),
          ilike(users.lastName, searchTerm)
        )
      );
    }

    if (role && role !== 'all') {
      conditions.push(eq(users.role, role as any));
    }

    if (organizationId && organizationId !== 'all') {
      conditions.push(eq(users.organizationId, organizationId as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allUsers = await query
      .orderBy(desc(users.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    let countQuery = db.select({ count: count() }).from(users);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    res.json({
      users: allUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { email, firstName, lastName, phone, role, password, organizationId } = req.body;

    if (!email || !firstName || !lastName || !password || !organizationId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email already exists
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        firstName,
        lastName,
        phone: phone || null,
        role: role || 'member',
        passwordHash,
        organizationId,
        emailVerified: false,
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        emailVerified: users.emailVerified,
        organizationId: users.organizationId,
        createdAt: users.createdAt,
      });

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, phone, role, password, organizationId } = req.body;

    // Check if user exists
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (existingUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is taken by another user
    if (email) {
      const emailTaken = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), sql`${users.id} != ${id}`))
        .limit(1);
      if (emailTaken.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (email) updateData.email = email;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone || null;
    if (role) updateData.role = role;
    if (organizationId) updateData.organizationId = organizationId;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        emailVerified: users.emailVerified,
        organizationId: users.organizationId,
        updatedAt: users.updatedAt,
      });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user?.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, id: deleted[0].id });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Manually verify a user's email (admin action)
router.post('/users/:id/verify', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.id, id)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user[0].emailVerified) {
      return res.json({ message: 'User is already verified' });
    }

    await db.update(users)
      .set({
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    res.json({ message: 'User verified successfully' });
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ error: 'Failed to verify user' });
  }
});

// Get verification link for a user (admin action)
router.get('/users/:id/verification-link', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        verificationToken: users.verificationToken,
        verificationTokenExpiresAt: users.verificationTokenExpiresAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user[0].emailVerified) {
      return res.json({ verified: true, message: 'User is already verified' });
    }

    let token = user[0].verificationToken;

    // If no token or expired, generate a new one
    if (!token || (user[0].verificationTokenExpiresAt && user[0].verificationTokenExpiresAt < new Date())) {
      const crypto = await import('crypto');
      token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.update(users)
        .set({
          verificationToken: token,
          verificationTokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    res.json({ verified: false, verificationLink: verifyUrl, email: user[0].email });
  } catch (error) {
    console.error('Error getting verification link:', error);
    res.status(500).json({ error: 'Failed to get verification link' });
  }
});

// Get all organizations
router.get('/organizations', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const allOrgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        website: organizations.website,
        timezone: organizations.timezone,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));

    // Get user counts and claim counts for each organization
    const orgsWithCounts = await Promise.all(
      allOrgs.map(async (org) => {
        const [userCountResult, claimCountResult] = await Promise.all([
          db.select({ count: count() }).from(users).where(eq(users.organizationId, org.id)),
          db.select({ count: count() }).from(escrowClaims).where(eq(escrowClaims.organizationId, org.id)),
        ]);
        return {
          ...org,
          _count: {
            users: Number(userCountResult[0]?.count || 0),
            claims: Number(claimCountResult[0]?.count || 0),
          },
        };
      })
    );

    res.json({ organizations: orgsWithCounts });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Create organization
router.post('/organizations', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, website, timezone } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Check if slug already exists
    const existingOrg = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (existingOrg.length > 0) {
      return res.status(400).json({ error: 'Slug already exists' });
    }

    const [newOrg] = await db
      .insert(organizations)
      .values({
        name,
        slug,
        website: website || null,
        timezone: timezone || 'America/New_York',
      })
      .returning();

    res.status(201).json(newOrg);
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Update organization
router.put('/organizations/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, website, timezone } = req.body;

    // Check if organization exists
    const existingOrg = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (existingOrg.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if slug is taken by another org
    if (slug) {
      const slugTaken = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.slug, slug), sql`${organizations.id} != ${id}`))
        .limit(1);
      if (slugTaken.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (slug) updateData.slug = slug;
    if (website !== undefined) updateData.website = website || null;
    if (timezone) updateData.timezone = timezone;

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning();

    res.json(updatedOrg);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Delete organization
router.delete('/organizations/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if organization has users
    const userCount = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.organizationId, id));
    
    if (Number(userCount[0]?.count || 0) > 0) {
      // Delete all users in the organization first
      await db.delete(users).where(eq(users.organizationId, id));
    }

    const deleted = await db
      .delete(organizations)
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id });

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({ success: true, id: deleted[0].id });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

export default router;
