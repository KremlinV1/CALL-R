import { Router, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { agents } from '../db/schema.js';

const router = Router();

// Create agent schema
const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  voiceProvider: z.string().default('cartesia'),
  voiceId: z.string().optional(),
  voiceSettings: z.record(z.unknown()).optional(),
  llmProvider: z.string().default('openai'),
  llmModel: z.string().default('gpt-4o'),
  llmSettings: z.record(z.unknown()).optional(),
  // Actions & configs
  actions: z.object({
    transferCall: z.boolean().default(false),
    bookAppointment: z.boolean().default(false),
    sendSms: z.boolean().default(false),
    sendEmail: z.boolean().default(false),
    endCall: z.boolean().default(true),
    leaveVoicemail: z.boolean().default(false),
    ivrNavigation: z.boolean().default(false),
  }).optional(),
  transferConfig: z.object({
    enabled: z.boolean().default(false),
    destinations: z.array(z.object({
      id: z.string(),
      name: z.string(),
      phoneNumber: z.string(),
      description: z.string().optional(),
    })).default([]),
    defaultDestination: z.string().optional(),
  }).optional(),
  voicemailConfig: z.object({
    detectionMessage: z.string().optional(),
    leaveMessage: z.boolean().default(true),
    message: z.string().optional(),
  }).optional(),
  smsConfig: z.object({
    followUpMessage: z.string().optional(),
    sendAfterCall: z.boolean().default(false),
  }).optional(),
  emailConfig: z.object({
    followUpSubject: z.string().optional(),
    followUpBody: z.string().optional(),
    sendAfterCall: z.boolean().default(false),
  }).optional(),
  ivrConfig: z.object({
    targetOption: z.string().optional(),
  }).optional(),
  variables: z.array(z.object({
    id: z.string(),
    name: z.string(),
    csvColumn: z.string(),
    defaultValue: z.string(),
  })).optional(),
});

// Get all agents
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const orgAgents = await db.query.agents.findMany({
      where: eq(agents.organizationId, req.user!.organizationId),
      orderBy: (agents, { desc }) => [desc(agents.createdAt)],
    });
    
    res.json({ agents: orgAgents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get single agent
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const agent = await db.query.agents.findFirst({
      where: and(
        eq(agents.id, req.params.id),
        eq(agents.organizationId, req.user!.organizationId)
      ),
    });
    
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Create agent
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createAgentSchema.parse(req.body);
    
    // Build actions array for DB storage
    const actionsArray = data.actions ? Object.entries(data.actions)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => ({
        type: key,
        enabled: true,
        ...(key === 'transferCall' && data.transferConfig ? { config: data.transferConfig } : {}),
        ...(key === 'leaveVoicemail' && data.voicemailConfig ? { config: data.voicemailConfig } : {}),
        ...(key === 'sendSms' && data.smsConfig ? { config: data.smsConfig } : {}),
        ...(key === 'sendEmail' && data.emailConfig ? { config: data.emailConfig } : {}),
        ...(key === 'ivrNavigation' && data.ivrConfig ? { config: data.ivrConfig } : {}),
      })) : [];

    const [agent] = await db.insert(agents).values({
      organizationId: req.user!.organizationId,
      name: data.name,
      description: data.description || '',
      status: 'draft',
      systemPrompt: data.systemPrompt || '',
      voiceProvider: data.voiceProvider,
      voiceId: data.voiceId || '',
      voiceSettings: {
        ...(data.voiceSettings || {}),
        variables: data.variables || [],
      },
      llmProvider: data.llmProvider,
      llmModel: data.llmModel,
      llmSettings: data.llmSettings || {},
      actions: actionsArray,
      transferEnabled: data.actions?.transferCall ?? false,
      transferDestinations: data.transferConfig?.destinations || [],
      voicemailEnabled: data.actions?.leaveVoicemail ?? false,
      voicemailMessage: data.voicemailConfig?.message || '',
    }).returning();
    
    res.status(201).json({ agent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update agent
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // First check if agent exists and belongs to org
    const existing = await db.query.agents.findFirst({
      where: and(
        eq(agents.id, req.params.id),
        eq(agents.organizationId, req.user!.organizationId)
      ),
    });
    
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const data = createAgentSchema.parse(req.body);

    // Build actions array for DB storage (same logic as create)
    const actionsArray = data.actions ? Object.entries(data.actions)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => ({
        type: key,
        enabled: true,
        ...(key === 'transferCall' && data.transferConfig ? { config: data.transferConfig } : {}),
        ...(key === 'leaveVoicemail' && data.voicemailConfig ? { config: data.voicemailConfig } : {}),
        ...(key === 'sendSms' && data.smsConfig ? { config: data.smsConfig } : {}),
        ...(key === 'sendEmail' && data.emailConfig ? { config: data.emailConfig } : {}),
        ...(key === 'ivrNavigation' && data.ivrConfig ? { config: data.ivrConfig } : {}),
      })) : [];

    const [agent] = await db.update(agents)
      .set({
        name: data.name,
        description: data.description || '',
        systemPrompt: data.systemPrompt || '',
        voiceProvider: data.voiceProvider,
        voiceId: data.voiceId || '',
        voiceSettings: {
          ...(data.voiceSettings || {}),
          variables: data.variables || [],
        },
        llmProvider: data.llmProvider,
        llmModel: data.llmModel,
        llmSettings: data.llmSettings || {},
        actions: actionsArray,
        transferEnabled: data.actions?.transferCall ?? false,
        transferDestinations: data.transferConfig?.destinations || [],
        voicemailEnabled: data.actions?.leaveVoicemail ?? false,
        voicemailMessage: data.voicemailConfig?.message || '',
        updatedAt: new Date(),
      })
      .where(eq(agents.id, req.params.id))
      .returning();
    
    res.json({ agent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await db.query.agents.findFirst({
      where: and(
        eq(agents.id, req.params.id),
        eq(agents.organizationId, req.user!.organizationId)
      ),
    });
    
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    
    await db.delete(agents).where(eq(agents.id, req.params.id));
    
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Update agent status
router.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await db.query.agents.findFirst({
      where: and(
        eq(agents.id, req.params.id),
        eq(agents.organizationId, req.user!.organizationId)
      ),
    });
    
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    
    const { status } = req.body;
    if (!['active', 'paused', 'draft'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    const [agent] = await db.update(agents)
      .set({ status, updatedAt: new Date() })
      .where(eq(agents.id, req.params.id))
      .returning();
    
    res.json({ agent });
  } catch (error) {
    console.error('Error updating agent status:', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

export default router;
