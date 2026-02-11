import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { campaigns, campaignContacts, contacts, agents } from '../db/schema.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { campaignExecutor } from '../services/campaignExecutor.js';

const router = Router();

// Create campaign schema
const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  agentId: z.string().uuid(),
  contactListId: z.string().uuid().optional(),
  phoneNumberPoolId: z.string().uuid().optional(),
  singlePhoneNumber: z.string().optional(),
  scheduleType: z.enum(['immediate', 'scheduled', 'recurring']).default('immediate'),
  scheduledStartAt: z.string().optional(),
  recurringPattern: z.enum(['daily', 'weekly', 'monthly']).optional(),
  recurringDays: z.array(z.number().int().min(0).max(6)).optional(),
  timeWindowStart: z.string().optional(),
  timeWindowEnd: z.string().optional(),
  timezone: z.string().default('America/New_York'),
  callsPerMinute: z.number().int().min(1).max(100).default(10),
  maxConcurrentCalls: z.number().int().min(1).max(50).default(5),
  voicemailAction: z.enum(['hangup', 'leave_message', 'llm_message']).default('leave_message'),
});

// Add contacts to campaign schema
const addContactsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1),
});

// Get all campaigns
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const orgCampaigns = await db.select({
      id: campaigns.id,
      organizationId: campaigns.organizationId,
      agentId: campaigns.agentId,
      name: campaigns.name,
      description: campaigns.description,
      status: campaigns.status,
      scheduledStartAt: campaigns.scheduledStartAt,
      scheduledEndAt: campaigns.scheduledEndAt,
      startedAt: campaigns.startedAt,
      completedAt: campaigns.completedAt,
      scheduleType: campaigns.scheduleType,
      recurringPattern: campaigns.recurringPattern,
      recurringDays: campaigns.recurringDays,
      timeWindowStart: campaigns.timeWindowStart,
      timeWindowEnd: campaigns.timeWindowEnd,
      timezone: campaigns.timezone,
      callsPerMinute: campaigns.callsPerMinute,
      maxConcurrentCalls: campaigns.maxConcurrentCalls,
      voicemailAction: campaigns.voicemailAction,
      totalContacts: campaigns.totalContacts,
      completedCalls: campaigns.completedCalls,
      connectedCalls: campaigns.connectedCalls,
      voicemailCalls: campaigns.voicemailCalls,
      failedCalls: campaigns.failedCalls,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
      agentName: agents.name,
    })
    .from(campaigns)
    .leftJoin(agents, eq(campaigns.agentId, agents.id))
    .where(eq(campaigns.organizationId, req.user!.organizationId))
    .orderBy(desc(campaigns.createdAt));
    
    res.json({ campaigns: orgCampaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign with contacts
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    // Get campaign contacts with their status
    const campaignContactsList = await db.select({
      id: campaignContacts.id,
      contactId: campaignContacts.contactId,
      status: campaignContacts.status,
      attempts: campaignContacts.attempts,
      lastAttemptAt: campaignContacts.lastAttemptAt,
      completedAt: campaignContacts.completedAt,
      result: campaignContacts.result,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
    })
    .from(campaignContacts)
    .leftJoin(contacts, eq(campaignContacts.contactId, contacts.id))
    .where(eq(campaignContacts.campaignId, req.params.id));
    
    res.json({ campaign, contacts: campaignContactsList });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create campaign
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createCampaignSchema.parse(req.body);
    
    // Verify agent exists and belongs to org
    const [agent] = await db.select()
      .from(agents)
      .where(and(
        eq(agents.id, data.agentId),
        eq(agents.organizationId, req.user!.organizationId)
      ));
    
    if (!agent) {
      res.status(400).json({ error: 'Invalid agent ID' });
      return;
    }
    
    const [campaign] = await db.insert(campaigns).values({
      organizationId: req.user!.organizationId,
      agentId: data.agentId,
      name: data.name,
      description: data.description || '',
      status: data.scheduleType === 'immediate' ? 'draft' : 'scheduled',
      contactListId: data.contactListId || null,
      phoneNumberPoolId: data.phoneNumberPoolId || null,
      singlePhoneNumber: data.singlePhoneNumber || null,
      scheduledStartAt: data.scheduledStartAt ? new Date(data.scheduledStartAt) : null,
      scheduleType: data.scheduleType,
      recurringPattern: data.recurringPattern || null,
      recurringDays: data.recurringDays || null,
      timeWindowStart: data.timeWindowStart || null,
      timeWindowEnd: data.timeWindowEnd || null,
      timezone: data.timezone,
      callsPerMinute: data.callsPerMinute,
      maxConcurrentCalls: data.maxConcurrentCalls,
      voicemailAction: data.voicemailAction,
    }).returning();
    
    // If a contact list is selected, automatically add all contacts from that list
    if (data.contactListId) {
      const listContacts = await db.select({ id: contacts.id })
        .from(contacts)
        .where(and(
          eq(contacts.listId, data.contactListId),
          eq(contacts.organizationId, req.user!.organizationId)
        ));
      
      if (listContacts.length > 0) {
        const contactEntries = listContacts.map(contact => ({
          campaignId: campaign.id,
          contactId: contact.id,
          status: 'pending',
        }));
        
        await db.insert(campaignContacts).values(contactEntries);
        
        // Update campaign total contacts
        await db.update(campaigns)
          .set({ totalContacts: listContacts.length })
          .where(eq(campaigns.id, campaign.id));
      }
    }
    
    res.status(201).json({ campaign });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Add contacts to campaign
router.post('/:id/contacts', async (req: AuthRequest, res: Response) => {
  try {
    const data = addContactsSchema.parse(req.body);
    
    // Verify campaign exists
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    if (campaign.status === 'running' || campaign.status === 'completed') {
      res.status(400).json({ error: 'Cannot add contacts to a running or completed campaign' });
      return;
    }
    
    // Get existing contact IDs in campaign to avoid duplicates
    const existingContacts = await db.select({ contactId: campaignContacts.contactId })
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, req.params.id));
    
    const existingIds = new Set(existingContacts.map(c => c.contactId));
    const newContactIds = data.contactIds.filter(id => !existingIds.has(id));
    
    if (newContactIds.length === 0) {
      res.json({ message: 'All contacts already in campaign', added: 0 });
      return;
    }
    
    // Insert new campaign contacts
    await db.insert(campaignContacts).values(
      newContactIds.map(contactId => ({
        campaignId: req.params.id,
        contactId,
        status: 'pending',
      }))
    );
    
    // Update campaign total contacts
    await db.update(campaigns)
      .set({ 
        totalContacts: sql`${campaigns.totalContacts} + ${newContactIds.length}`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, req.params.id));
    
    res.json({ message: 'Contacts added successfully', added: newContactIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error adding contacts to campaign:', error);
    res.status(500).json({ error: 'Failed to add contacts' });
  }
});

// Start campaign
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      res.status(400).json({ error: 'Campaign cannot be started in its current state' });
      return;
    }
    
    if (campaign.totalContacts === 0) {
      res.status(400).json({ error: 'Cannot start campaign with no contacts' });
      return;
    }
    
    // Update campaign status to scheduled/running based on schedule type
    const newStatus = campaign.scheduleType === 'immediate' ? 'running' : 'scheduled';
    
    const [updatedCampaign] = await db.update(campaigns)
      .set({ 
        status: newStatus,
        startedAt: campaign.startedAt || new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, req.params.id))
      .returning();
    
    // If immediate start, trigger executor directly
    if (campaign.scheduleType === 'immediate') {
      // Executor will pick this up in next check cycle
      // Or we can trigger it directly (but async to not block response)
      setImmediate(() => {
        campaignExecutor['startCampaignExecution'](req.params.id).catch(console.error);
      });
    }
    
    res.json({ campaign: updatedCampaign });
  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

// Pause campaign
router.post('/:id/pause', async (req: AuthRequest, res: Response) => {
  try {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    if (campaign.status !== 'running') {
      res.status(400).json({ error: 'Campaign is not running' });
      return;
    }
    
    // Use campaign executor to pause (handles cleanup)
    await campaignExecutor.pauseCampaign(req.params.id);
    
    // Get updated campaign
    const [updatedCampaign] = await db.select()
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    
    res.json({ campaign: updatedCampaign });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

// Delete campaign
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    if (campaign.status === 'running') {
      res.status(400).json({ error: 'Cannot delete a running campaign' });
      return;
    }
    
    // Delete campaign contacts first
    await db.delete(campaignContacts)
      .where(eq(campaignContacts.campaignId, req.params.id));
    
    // Delete campaign
    await db.delete(campaigns)
      .where(eq(campaigns.id, req.params.id));
    
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Get campaign stats
router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(
        eq(campaigns.id, req.params.id),
        eq(campaigns.organizationId, req.user!.organizationId)
      ));
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    // Get contact status breakdown
    const statusBreakdown = await db.select({
      status: campaignContacts.status,
      count: sql<number>`count(*)::int`,
    })
    .from(campaignContacts)
    .where(eq(campaignContacts.campaignId, req.params.id))
    .groupBy(campaignContacts.status);
    
    const stats = {
      totalContacts: campaign.totalContacts,
      completedCalls: campaign.completedCalls,
      connectedCalls: campaign.connectedCalls,
      voicemailCalls: campaign.voicemailCalls,
      failedCalls: campaign.failedCalls,
      pendingContacts: statusBreakdown.find(s => s.status === 'pending')?.count || 0,
      inProgressContacts: statusBreakdown.find(s => s.status === 'in_progress')?.count || 0,
      successRate: (campaign.completedCalls || 0) > 0 
        ? Math.round(((campaign.connectedCalls || 0) / (campaign.completedCalls || 0)) * 100) 
        : 0,
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    res.status(500).json({ error: 'Failed to fetch campaign stats' });
  }
});

export default router;
