import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { eq, and, or, ilike, sql, desc } from 'drizzle-orm';

const router = Router();

// Maximum contacts per organization
const MAX_CONTACTS_PER_ORG = 50000;

// Helper to get current contact count
async function getContactCount(organizationId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));
  return Number(result[0]?.count || 0);
}

// Create contact schema
const createContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).default({}),
});

// Helper to clean phone number
function cleanPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return phone.startsWith('+') ? phone : `+${cleaned}`;
}

// Get all contacts with stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        newCount: sql<number>`count(*) filter (where ${contacts.status} = 'new')`,
        contactedCount: sql<number>`count(*) filter (where ${contacts.status} = 'contacted')`,
        qualifiedCount: sql<number>`count(*) filter (where ${contacts.status} = 'qualified')`,
        convertedCount: sql<number>`count(*) filter (where ${contacts.status} = 'converted')`,
        unqualifiedCount: sql<number>`count(*) filter (where ${contacts.status} = 'unqualified')`,
      })
      .from(contacts)
      .where(eq(contacts.organizationId, organizationId));
    
    const total = Number(stats[0]?.total || 0);
    res.json({
      total,
      new: Number(stats[0]?.newCount || 0),
      contacted: Number(stats[0]?.contactedCount || 0),
      qualified: Number(stats[0]?.qualifiedCount || 0),
      converted: Number(stats[0]?.convertedCount || 0),
      unqualified: Number(stats[0]?.unqualifiedCount || 0),
      limit: MAX_CONTACTS_PER_ORG,
      available: MAX_CONTACTS_PER_ORG - total,
    });
  } catch (error) {
    console.error('Error fetching contact stats:', error);
    res.status(500).json({ error: 'Failed to fetch contact stats' });
  }
});

// Get all contacts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { search, status, listId, page = '1', limit = '50' } = req.query;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    // Build conditions
    const conditions = [eq(contacts.organizationId, organizationId)];
    
    if (listId) {
      conditions.push(eq(contacts.listId, listId as string));
    }
    
    if (status && status !== 'all') {
      conditions.push(sql`${contacts.status} = ${status}`);
    }
    
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(contacts.firstName, searchTerm),
          ilike(contacts.lastName, searchTerm),
          ilike(contacts.email, searchTerm),
          ilike(contacts.phone, searchTerm),
          ilike(contacts.company, searchTerm)
        )!
      );
    }
    
    // Get contacts
    const contactList = await db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(desc(contacts.createdAt))
      .limit(limitNum)
      .offset(offset);
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(and(...conditions));
    
    const total = Number(countResult[0]?.count || 0);
    
    res.json({
      contacts: contactList,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get single contact
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const contactResult = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.organizationId, organizationId)))
      .limit(1);
    
    if (contactResult.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ contact: contactResult[0] });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Create contact
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check contact limit
    const currentCount = await getContactCount(organizationId);
    if (currentCount >= MAX_CONTACTS_PER_ORG) {
      return res.status(403).json({ 
        error: 'Contact limit reached', 
        message: `You have reached the maximum limit of ${MAX_CONTACTS_PER_ORG.toLocaleString()} contacts. Please delete some contacts to add new ones.`,
        currentCount,
        limit: MAX_CONTACTS_PER_ORG
      });
    }
    
    const data = createContactSchema.parse(req.body);
    
    // Check for duplicate phone number
    const existingContact = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.organizationId, organizationId),
        eq(contacts.phone, cleanPhoneNumber(data.phone))
      ))
      .limit(1);
    
    if (existingContact.length > 0) {
      return res.status(409).json({ error: 'Contact with this phone number already exists' });
    }
    
    const [newContact] = await db.insert(contacts).values({
      organizationId,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: cleanPhoneNumber(data.phone),
      email: data.email || null,
      company: data.company || null,
      tags: data.tags,
      customFields: data.customFields,
    }).returning();
    
    res.status(201).json({ contact: newContact });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Bulk create contacts (CSV upload)
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { contacts: contactsData, skipDuplicates = true, tags = [], listId } = req.body;
    
    console.log('📥 Bulk upload received - listId:', listId, 'contacts count:', contactsData?.length);
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!Array.isArray(contactsData)) {
      return res.status(400).json({ error: 'Invalid contacts data - expected array' });
    }
    
    // Check contact limit
    const currentCount = await getContactCount(organizationId);
    const availableSlots = MAX_CONTACTS_PER_ORG - currentCount;
    
    if (availableSlots <= 0) {
      return res.status(403).json({ 
        error: 'Contact limit reached', 
        message: `You have reached the maximum limit of ${MAX_CONTACTS_PER_ORG.toLocaleString()} contacts. Please delete some contacts to add new ones.`,
        currentCount,
        limit: MAX_CONTACTS_PER_ORG
      });
    }
    
    if (contactsData.length > availableSlots) {
      return res.status(403).json({ 
        error: 'Would exceed contact limit', 
        message: `You can only add ${availableSlots.toLocaleString()} more contacts. You are trying to upload ${contactsData.length.toLocaleString()} contacts.`,
        currentCount,
        limit: MAX_CONTACTS_PER_ORG,
        availableSlots,
        requestedCount: contactsData.length
      });
    }
    
    const created: any[] = [];
    const skipped: { index: number; reason: string; phone: string }[] = [];
    const errors: { index: number; error: string; data: any }[] = [];
    
    // Get existing phone numbers to check for duplicates
    const existingPhones = new Set<string>();
    if (skipDuplicates) {
      const existing = await db
        .select({ phone: contacts.phone })
        .from(contacts)
        .where(eq(contacts.organizationId, organizationId));
      existing.forEach(c => existingPhones.add(c.phone));
    }

    const normalizeRow = (row: Record<string, any>) => {
      // Normalize headers like "Phone Number" -> "phone_number" (case-insensitive)
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(row || {})) {
        const normalizedKey = key
          .toString()
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        normalized[normalizedKey] = value;
      }
      return normalized;
    };
    
    // Phase 1: Validate and prepare all rows in-memory (no DB calls)
    const validRows: Array<{
      organizationId: string;
      firstName: string | null;
      lastName: string | null;
      phone: string;
      email: string | null;
      company: string | null;
      tags: string[];
      customFields: Record<string, unknown>;
      listId: string | null;
    }> = [];

    for (let i = 0; i < contactsData.length; i++) {
      try {
        const rawData = contactsData[i];
        const row = normalizeRow(rawData);
        
        const nameValue = row.name ?? rawData.name;
        const data = {
          firstName: row.first_name || row.firstname || row.fname || (typeof nameValue === 'string' ? nameValue.split(' ')[0] : '') || '',
          lastName: row.last_name || row.lastname || row.lname || (typeof nameValue === 'string' ? nameValue.split(' ').slice(1).join(' ') : '') || '',
          phone: row.phone || row.phone_number || row.mobile || row.cell || row.telephone || '',
          email: row.email || row.email_address || '',
          company: row.company || row.organization || row.business || '',
          tags: [
            ...(
              Array.isArray(row.tags)
                ? row.tags
                : typeof row.tags === 'string'
                  ? row.tags.split(',').map((t) => t.trim()).filter(Boolean)
                  : []
            ),
            ...tags,
          ],
        };
        
        if (!data.phone) {
          errors.push({ index: i, error: 'Missing phone number', data: rawData });
          continue;
        }
        
        const cleanedPhone = cleanPhoneNumber(data.phone);
        
        if (skipDuplicates && existingPhones.has(cleanedPhone)) {
          skipped.push({ index: i, reason: 'Duplicate phone number', phone: cleanedPhone });
          continue;
        }
        
        if (existingPhones.has(cleanedPhone)) {
          skipped.push({ index: i, reason: 'Duplicate in batch', phone: cleanedPhone });
          continue;
        }
        
        existingPhones.add(cleanedPhone);
        validRows.push({
          organizationId,
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          phone: cleanedPhone,
          email: data.email || null,
          company: data.company || null,
          tags: data.tags,
          customFields: {},
          listId: listId || null,
        });
      } catch (err: any) {
        errors.push({ index: i, error: err.message || 'Validation failed', data: contactsData[i] });
      }
    }

    // Phase 2: Batch insert all valid rows in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      try {
        const inserted = await db.insert(contacts).values(batch).returning();
        created.push(...inserted);
      } catch (err: any) {
        // If batch fails, fall back to individual inserts for this chunk
        for (const row of batch) {
          try {
            const [inserted] = await db.insert(contacts).values(row).returning();
            created.push(inserted);
          } catch (innerErr: any) {
            errors.push({ index: -1, error: innerErr.message, data: { phone: row.phone } });
          }
        }
      }
    }
    
    if (created.length > 0) {
      console.log(`📝 Bulk inserted ${created.length} contacts (listId: ${listId || 'none'})`);
    }
    
    res.status(201).json({
      success: true,
      summary: {
        total: contactsData.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('Error bulk creating contacts:', error);
    res.status(500).json({ error: 'Failed to bulk create contacts' });
  }
});

// Update contact
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check contact exists
    const existingContact = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.organizationId, organizationId)))
      .limit(1);
    
    if (existingContact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const { firstName, lastName, phone, email, company, status, tags } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = cleanPhoneNumber(phone);
    if (email !== undefined) updateData.email = email;
    if (company !== undefined) updateData.company = company;
    if (status !== undefined) updateData.status = status;
    if (tags !== undefined) updateData.tags = tags;
    
    const [updatedContact] = await db
      .update(contacts)
      .set(updateData)
      .where(eq(contacts.id, req.params.id))
      .returning();
    
    res.json({ contact: updatedContact });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check contact exists
    const existingContact = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.organizationId, organizationId)))
      .limit(1);
    
    if (existingContact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await db
      .delete(contacts)
      .where(eq(contacts.id, req.params.id));
    
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Bulk delete contacts
router.post('/bulk-delete', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { ids } = req.body;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids - expected non-empty array' });
    }
    
    // Delete only contacts belonging to this organization
    let deleted = 0;
    for (const id of ids) {
      const result = await db
        .delete(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)));
      deleted++;
    }
    
    res.json({ deleted, message: `${deleted} contacts deleted` });
  } catch (error) {
    console.error('Error bulk deleting contacts:', error);
    res.status(500).json({ error: 'Failed to bulk delete contacts' });
  }
});

// Export contacts as CSV data
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const allContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.organizationId, organizationId))
      .orderBy(desc(contacts.createdAt));
    
    res.json({ contacts: allContacts });
  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

export default router;
