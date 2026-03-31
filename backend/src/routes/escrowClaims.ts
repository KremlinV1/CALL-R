import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { escrowClaims } from '../db/schema.js';
import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';

const router = Router();

// Create escrow claim schema - very lenient validation
const createEscrowClaimSchema = z.object({
  claimCode: z.string().min(1, 'Claim code is required'),
  pin: z.string().min(4, 'PIN must be at least 4 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional().nullable().transform(v => v || ''),
  email: z.string().optional().nullable().transform(v => v || ''),
  ssn4: z.string().optional().nullable().transform(v => v || ''),
  dateOfBirth: z.string().optional().nullable().transform(v => v || ''),
  address: z.string().optional().nullable().transform(v => v || ''),
  city: z.string().optional().nullable().transform(v => v || ''),
  state: z.string().optional().nullable().transform(v => v || ''),
  zipCode: z.string().optional().nullable().transform(v => v || ''),
  escrowAmount: z.number().min(0, 'Amount must be positive'),
  releaseFee: z.number().min(0).default(0),
  escrowType: z.string().optional().nullable().default('federal_reserve'),
  escrowDescription: z.string().optional().nullable().transform(v => v || ''),
  originatingEntity: z.string().optional().nullable().transform(v => v || ''),
  status: z.string().optional().nullable().default('pending'),
  disbursementMethod: z.string().optional().nullable().transform(v => v || ''),
  expiresAt: z.string().optional().nullable().transform(v => v || ''),
  notes: z.string().optional().nullable().transform(v => v || ''),
});

// Update escrow claim schema
const updateEscrowClaimSchema = createEscrowClaimSchema.partial();

// Get all escrow claims with pagination and search
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, page = '1', limit = '50', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    // TODO: Re-enable organization filter once column exists in production
    // const organizationId = req.user?.organizationId;
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;
    
    // Select only columns that exist in production (excluding organizationId)
    let query = db.select({
      id: escrowClaims.id,
      claimCode: escrowClaims.claimCode,
      pin: escrowClaims.pin,
      firstName: escrowClaims.firstName,
      lastName: escrowClaims.lastName,
      phone: escrowClaims.phone,
      email: escrowClaims.email,
      ssn4: escrowClaims.ssn4,
      dateOfBirth: escrowClaims.dateOfBirth,
      address: escrowClaims.address,
      city: escrowClaims.city,
      state: escrowClaims.state,
      zipCode: escrowClaims.zipCode,
      escrowAmount: escrowClaims.escrowAmount,
      escrowType: escrowClaims.escrowType,
      escrowDescription: escrowClaims.escrowDescription,
      originatingEntity: escrowClaims.originatingEntity,
      status: escrowClaims.status,
      verifiedAt: escrowClaims.verifiedAt,
      approvedAt: escrowClaims.approvedAt,
      disbursedAt: escrowClaims.disbursedAt,
      disbursementMethod: escrowClaims.disbursementMethod,
      lastCallAt: escrowClaims.lastCallAt,
      totalCalls: escrowClaims.totalCalls,
      failedVerificationAttempts: escrowClaims.failedVerificationAttempts,
      isLocked: escrowClaims.isLocked,
      notes: escrowClaims.notes,
      expiresAt: escrowClaims.expiresAt,
      createdAt: escrowClaims.createdAt,
      updatedAt: escrowClaims.updatedAt,
    }).from(escrowClaims);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(escrowClaims);
    
    // Build where conditions
    const conditions: any[] = [];
    
    if (search) {
      const searchTerm = `%${search}%`;
      const searchCondition = or(
        ilike(escrowClaims.claimCode, searchTerm),
        ilike(escrowClaims.firstName, searchTerm),
        ilike(escrowClaims.lastName, searchTerm),
        ilike(escrowClaims.phone, searchTerm),
        ilike(escrowClaims.email, searchTerm)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(escrowClaims.status, status as any));
    }
    
    // Apply conditions if any
    if (conditions.length > 0) {
      const whereClause = and(...conditions);
      query = query.where(whereClause) as any;
      countQuery = countQuery.where(whereClause) as any;
    }
    
    // Get total count
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);
    
    // Apply sorting
    const orderColumn = escrowClaims[sortBy as keyof typeof escrowClaims] || escrowClaims.createdAt;
    if (sortOrder === 'asc') {
      query = query.orderBy(asc(orderColumn as any)) as any;
    } else {
      query = query.orderBy(desc(orderColumn as any)) as any;
    }
    
    // Apply pagination
    query = query.limit(limitNum).offset(offset) as any;
    
    const claims = await query;
    
    res.json({
      claims,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching escrow claims:', error);
    res.status(500).json({ error: 'Failed to fetch escrow claims' });
  }
});

// Get escrow claim stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Re-enable organization filter once column exists in production
    // const organizationId = req.user?.organizationId;
    
    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${escrowClaims.status} = 'pending')`,
        verified: sql<number>`count(*) filter (where ${escrowClaims.status} = 'verified')`,
        processing: sql<number>`count(*) filter (where ${escrowClaims.status} = 'processing')`,
        approved: sql<number>`count(*) filter (where ${escrowClaims.status} = 'approved')`,
        disbursed: sql<number>`count(*) filter (where ${escrowClaims.status} = 'disbursed')`,
        rejected: sql<number>`count(*) filter (where ${escrowClaims.status} = 'rejected')`,
        expired: sql<number>`count(*) filter (where ${escrowClaims.status} = 'expired')`,
        totalAmount: sql<number>`coalesce(sum(${escrowClaims.escrowAmount}), 0)`,
      })
      .from(escrowClaims);
    
    res.json({
      total: Number(stats[0]?.total || 0),
      pending: Number(stats[0]?.pending || 0),
      verified: Number(stats[0]?.verified || 0),
      processing: Number(stats[0]?.processing || 0),
      approved: Number(stats[0]?.approved || 0),
      disbursed: Number(stats[0]?.disbursed || 0),
      rejected: Number(stats[0]?.rejected || 0),
      expired: Number(stats[0]?.expired || 0),
      totalAmountCents: Number(stats[0]?.totalAmount || 0),
    });
  } catch (error) {
    console.error('Error fetching escrow claim stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single escrow claim
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Re-enable organization filter once column exists in production
    
    const claim = await db
      .select({
        id: escrowClaims.id,
        claimCode: escrowClaims.claimCode,
        pin: escrowClaims.pin,
        firstName: escrowClaims.firstName,
        lastName: escrowClaims.lastName,
        phone: escrowClaims.phone,
        email: escrowClaims.email,
        ssn4: escrowClaims.ssn4,
        dateOfBirth: escrowClaims.dateOfBirth,
        address: escrowClaims.address,
        city: escrowClaims.city,
        state: escrowClaims.state,
        zipCode: escrowClaims.zipCode,
        escrowAmount: escrowClaims.escrowAmount,
        escrowType: escrowClaims.escrowType,
        escrowDescription: escrowClaims.escrowDescription,
        originatingEntity: escrowClaims.originatingEntity,
        status: escrowClaims.status,
        verifiedAt: escrowClaims.verifiedAt,
        approvedAt: escrowClaims.approvedAt,
        disbursedAt: escrowClaims.disbursedAt,
        disbursementMethod: escrowClaims.disbursementMethod,
        lastCallAt: escrowClaims.lastCallAt,
        totalCalls: escrowClaims.totalCalls,
        failedVerificationAttempts: escrowClaims.failedVerificationAttempts,
        isLocked: escrowClaims.isLocked,
        notes: escrowClaims.notes,
        expiresAt: escrowClaims.expiresAt,
        createdAt: escrowClaims.createdAt,
        updatedAt: escrowClaims.updatedAt,
      })
      .from(escrowClaims)
      .where(eq(escrowClaims.id, id))
      .limit(1);
    
    if (claim.length === 0) {
      return res.status(404).json({ error: 'Escrow claim not found' });
    }
    
    res.json(claim[0]);
  } catch (error) {
    console.error('Error fetching escrow claim:', error);
    res.status(500).json({ error: 'Failed to fetch escrow claim' });
  }
});

// Create escrow claim
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Re-enable organization filter once column exists in production
    // const organizationId = req.user?.organizationId;
    
    const data = createEscrowClaimSchema.parse(req.body);
    
    // Check if claim code already exists
    const existing = await db
      .select({ id: escrowClaims.id })
      .from(escrowClaims)
      .where(eq(escrowClaims.claimCode, data.claimCode))
      .limit(1);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Claim code already exists' });
    }
    
    const [claim] = await db
      .insert(escrowClaims)
      .values({
        // organizationId, // TODO: Re-enable once column exists in production
        claimCode: data.claimCode,
        pin: data.pin,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        email: data.email || null,
        ssn4: data.ssn4 || null,
        dateOfBirth: data.dateOfBirth || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        escrowAmount: Math.round(data.escrowAmount * 100), // Convert to cents
        // releaseFeeCents: Math.round((data.releaseFee || 0) * 100), // Column doesn't exist in production yet
        escrowType: data.escrowType,
        escrowDescription: data.escrowDescription || null,
        originatingEntity: data.originatingEntity || null,
        status: (data.status || 'pending') as 'pending' | 'verified' | 'processing' | 'approved' | 'disbursed' | 'rejected' | 'expired',
        disbursementMethod: data.disbursementMethod || null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        notes: data.notes || null,
      })
      .returning({
        id: escrowClaims.id,
        claimCode: escrowClaims.claimCode,
        pin: escrowClaims.pin,
        firstName: escrowClaims.firstName,
        lastName: escrowClaims.lastName,
        phone: escrowClaims.phone,
        email: escrowClaims.email,
        ssn4: escrowClaims.ssn4,
        dateOfBirth: escrowClaims.dateOfBirth,
        address: escrowClaims.address,
        city: escrowClaims.city,
        state: escrowClaims.state,
        zipCode: escrowClaims.zipCode,
        escrowAmount: escrowClaims.escrowAmount,
        escrowType: escrowClaims.escrowType,
        escrowDescription: escrowClaims.escrowDescription,
        originatingEntity: escrowClaims.originatingEntity,
        status: escrowClaims.status,
        disbursementMethod: escrowClaims.disbursementMethod,
        expiresAt: escrowClaims.expiresAt,
        notes: escrowClaims.notes,
        createdAt: escrowClaims.createdAt,
        updatedAt: escrowClaims.updatedAt,
      });
    
    res.status(201).json(claim);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating escrow claim:', error);
    res.status(500).json({ error: 'Failed to create escrow claim' });
  }
});

// Update escrow claim
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Re-enable organization filter once column exists in production
    
    const data = updateEscrowClaimSchema.parse(req.body);
    
    // Check if claim exists
    const existing = await db
      .select({ id: escrowClaims.id })
      .from(escrowClaims)
      .where(eq(escrowClaims.id, id))
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Escrow claim not found' });
    }
    
    // If updating claim code, check for duplicates
    if (data.claimCode) {
      const duplicate = await db
        .select({ id: escrowClaims.id })
        .from(escrowClaims)
        .where(and(
          eq(escrowClaims.claimCode, data.claimCode),
          sql`${escrowClaims.id} != ${id}`
        ))
        .limit(1);
      
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'Claim code already exists' });
      }
    }
    
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    if (data.claimCode !== undefined) updateData.claimCode = data.claimCode;
    if (data.pin !== undefined) updateData.pin = data.pin;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.ssn4 !== undefined) updateData.ssn4 = data.ssn4 || null;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.state !== undefined) updateData.state = data.state || null;
    if (data.zipCode !== undefined) updateData.zipCode = data.zipCode || null;
    if (data.escrowAmount !== undefined) updateData.escrowAmount = Math.round(data.escrowAmount * 100);
    // if (data.releaseFee !== undefined) updateData.releaseFeeCents = Math.round(data.releaseFee * 100); // Column doesn't exist in production yet
    if (data.escrowType !== undefined) updateData.escrowType = data.escrowType;
    if (data.escrowDescription !== undefined) updateData.escrowDescription = data.escrowDescription || null;
    if (data.originatingEntity !== undefined) updateData.originatingEntity = data.originatingEntity || null;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'verified') updateData.verifiedAt = new Date();
      if (data.status === 'approved') updateData.approvedAt = new Date();
      if (data.status === 'disbursed') updateData.disbursedAt = new Date();
    }
    if (data.disbursementMethod !== undefined) updateData.disbursementMethod = data.disbursementMethod || null;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    
    const [claim] = await db
      .update(escrowClaims)
      .set(updateData)
      .where(eq(escrowClaims.id, id))
      .returning({
        id: escrowClaims.id,
        claimCode: escrowClaims.claimCode,
        pin: escrowClaims.pin,
        firstName: escrowClaims.firstName,
        lastName: escrowClaims.lastName,
        phone: escrowClaims.phone,
        email: escrowClaims.email,
        ssn4: escrowClaims.ssn4,
        dateOfBirth: escrowClaims.dateOfBirth,
        address: escrowClaims.address,
        city: escrowClaims.city,
        state: escrowClaims.state,
        zipCode: escrowClaims.zipCode,
        escrowAmount: escrowClaims.escrowAmount,
        escrowType: escrowClaims.escrowType,
        escrowDescription: escrowClaims.escrowDescription,
        originatingEntity: escrowClaims.originatingEntity,
        status: escrowClaims.status,
        disbursementMethod: escrowClaims.disbursementMethod,
        expiresAt: escrowClaims.expiresAt,
        notes: escrowClaims.notes,
        createdAt: escrowClaims.createdAt,
        updatedAt: escrowClaims.updatedAt,
      });
    
    res.json(claim);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating escrow claim:', error);
    res.status(500).json({ error: 'Failed to update escrow claim' });
  }
});

// Delete escrow claim
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Re-enable organization filter once column exists in production
    
    const deleted = await db
      .delete(escrowClaims)
      .where(eq(escrowClaims.id, id))
      .returning({ id: escrowClaims.id });
    
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Escrow claim not found' });
    }
    
    res.json({ success: true, id: deleted[0].id });
  } catch (error) {
    console.error('Error deleting escrow claim:', error);
    res.status(500).json({ error: 'Failed to delete escrow claim' });
  }
});

// Bulk delete escrow claims
router.post('/bulk-delete', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    // TODO: Re-enable organization filter once column exists in production
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    
    let deletedCount = 0;
    for (const id of ids) {
      const result = await db
        .delete(escrowClaims)
        .where(eq(escrowClaims.id, id))
        .returning({ id: escrowClaims.id });
      if (result.length > 0) deletedCount++;
    }
    
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Error bulk deleting escrow claims:', error);
    res.status(500).json({ error: 'Failed to delete escrow claims' });
  }
});

// Verify claim (for IVR agent)
router.post('/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { claimCode, pin } = req.body;
    
    if (!claimCode || !pin) {
      return res.status(400).json({ error: 'Claim code and PIN are required' });
    }
    
    const claim = await db
      .select()
      .from(escrowClaims)
      .where(eq(escrowClaims.claimCode, claimCode))
      .limit(1);
    
    if (claim.length === 0) {
      return res.status(404).json({ error: 'Claim not found', verified: false });
    }
    
    const claimData = claim[0];
    
    // Check if locked
    if (claimData.isLocked) {
      return res.status(403).json({ error: 'Account is locked', verified: false });
    }
    
    // Verify PIN
    if (claimData.pin !== pin) {
      // Increment failed attempts
      await db
        .update(escrowClaims)
        .set({
          failedVerificationAttempts: (claimData.failedVerificationAttempts || 0) + 1,
          isLocked: (claimData.failedVerificationAttempts || 0) >= 4, // Lock after 5 attempts
          updatedAt: new Date(),
        })
        .where(eq(escrowClaims.id, claimData.id));
      
      return res.status(401).json({ error: 'Invalid PIN', verified: false });
    }
    
    // Update last call and reset failed attempts
    await db
      .update(escrowClaims)
      .set({
        lastCallAt: new Date(),
        totalCalls: (claimData.totalCalls || 0) + 1,
        failedVerificationAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(escrowClaims.id, claimData.id));
    
    res.json({
      verified: true,
      claim: {
        id: claimData.id,
        claimCode: claimData.claimCode,
        firstName: claimData.firstName,
        lastName: claimData.lastName,
        escrowAmount: claimData.escrowAmount,
        status: claimData.status,
        disbursementMethod: claimData.disbursementMethod,
        originatingEntity: claimData.originatingEntity,
        address: claimData.address,
        city: claimData.city,
        state: claimData.state,
        zipCode: claimData.zipCode,
      },
    });
  } catch (error) {
    console.error('Error verifying claim:', error);
    res.status(500).json({ error: 'Failed to verify claim' });
  }
});

export default router;
