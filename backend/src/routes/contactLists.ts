import { Router, Response } from 'express';
import { z } from 'zod';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contactLists, contacts, calls } from '../db/schema.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const createListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateListSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// Get all contact lists with dynamic contact counts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;

    const lists = await db
      .select({
        id: contactLists.id,
        organizationId: contactLists.organizationId,
        name: contactLists.name,
        description: contactLists.description,
        color: contactLists.color,
        contactCount: sql<number>`(SELECT count(*)::int FROM contacts WHERE contacts.list_id = contact_lists.id)`,
        createdAt: contactLists.createdAt,
        updatedAt: contactLists.updatedAt,
      })
      .from(contactLists)
      .where(eq(contactLists.organizationId, organizationId))
      .orderBy(desc(contactLists.createdAt));

    res.json({ lists });
  } catch (error) {
    console.error('Error fetching contact lists:', error);
    res.status(500).json({ error: 'Failed to fetch contact lists' });
  }
});

// Get single contact list with contacts
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const [list] = await db
      .select()
      .from(contactLists)
      .where(and(
        eq(contactLists.id, id),
        eq(contactLists.organizationId, organizationId)
      ));

    if (!list) {
      res.status(404).json({ error: 'Contact list not found' });
      return;
    }

    // Get contacts in this list with their call details
    const listContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        phone: contacts.phone,
        email: contacts.email,
        company: contacts.company,
        status: contacts.status,
        tags: contacts.tags,
        totalCalls: contacts.totalCalls,
        lastCalledAt: contacts.lastCalledAt,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(and(
        eq(contacts.listId, id),
        eq(contacts.organizationId, organizationId)
      ))
      .orderBy(desc(contacts.createdAt));

    // Get call history for contacts in this list
    const contactIds = listContacts.map(c => c.id);
    let callHistory: any[] = [];
    
    if (contactIds.length > 0) {
      callHistory = await db
        .select({
          id: calls.id,
          contactId: calls.contactId,
          direction: calls.direction,
          status: calls.status,
          outcome: calls.outcome,
          duration: calls.durationSeconds,
          createdAt: calls.createdAt,
        })
        .from(calls)
        .where(sql`${calls.contactId} = ANY(${contactIds})`)
        .orderBy(desc(calls.createdAt))
        .limit(100);
    }

    res.json({
      list,
      contacts: listContacts,
      callHistory,
    });
  } catch (error) {
    console.error('Error fetching contact list:', error);
    res.status(500).json({ error: 'Failed to fetch contact list' });
  }
});

// Create contact list
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createListSchema.parse(req.body);
    const organizationId = req.user!.organizationId;

    const [list] = await db
      .insert(contactLists)
      .values({
        organizationId,
        name: data.name,
        description: data.description,
        color: data.color || '#3b82f6',
      })
      .returning();

    res.status(201).json({ list });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contact list:', error);
    res.status(500).json({ error: 'Failed to create contact list' });
  }
});

// Update contact list
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateListSchema.parse(req.body);
    const organizationId = req.user!.organizationId;

    const [list] = await db
      .update(contactLists)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(contactLists.id, id),
        eq(contactLists.organizationId, organizationId)
      ))
      .returning();

    if (!list) {
      res.status(404).json({ error: 'Contact list not found' });
      return;
    }

    res.json({ list });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contact list:', error);
    res.status(500).json({ error: 'Failed to update contact list' });
  }
});

// Delete contact list
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    // Update contacts to remove listId before deleting the list
    await db
      .update(contacts)
      .set({ listId: null })
      .where(and(
        eq(contacts.listId, id),
        eq(contacts.organizationId, organizationId)
      ));

    // Delete the list
    await db
      .delete(contactLists)
      .where(and(
        eq(contactLists.id, id),
        eq(contactLists.organizationId, organizationId)
      ));

    res.json({ message: 'Contact list deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact list:', error);
    res.status(500).json({ error: 'Failed to delete contact list' });
  }
});

// Move contacts to a list
router.post('/:id/contacts', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { contactIds } = z.object({
      contactIds: z.array(z.string().uuid()),
    }).parse(req.body);
    
    const organizationId = req.user!.organizationId;

    // Verify list exists
    const [list] = await db
      .select()
      .from(contactLists)
      .where(and(
        eq(contactLists.id, id),
        eq(contactLists.organizationId, organizationId)
      ));

    if (!list) {
      res.status(404).json({ error: 'Contact list not found' });
      return;
    }

    // Update contacts to move them to this list
    await db
      .update(contacts)
      .set({ listId: id })
      .where(and(
        sql`${contacts.id} = ANY(${contactIds})`,
        eq(contacts.organizationId, organizationId)
      ));

    // Update contact count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(
        eq(contacts.listId, id),
        eq(contacts.organizationId, organizationId)
      ));

    await db
      .update(contactLists)
      .set({ contactCount: count })
      .where(eq(contactLists.id, id));

    res.json({ message: 'Contacts moved successfully', count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error moving contacts:', error);
    res.status(500).json({ error: 'Failed to move contacts' });
  }
});

export default router;
