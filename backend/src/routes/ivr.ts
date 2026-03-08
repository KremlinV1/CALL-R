import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { ivrMenus, ivrMenuOptions, ivrCallLogs } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ivrService } from '../services/ivr.js';
import { ivrTemplates, getTemplateById } from '../data/ivr-templates.js';

const router = Router();

// ============================================
// IVR Templates
// ============================================

// GET /api/ivr/templates - List available IVR templates
router.get('/templates', async (req: AuthRequest, res: Response) => {
  try {
    const templates = ivrTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
    }));
    res.json({ templates });
  } catch (error) {
    console.error('Error fetching IVR templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/ivr/templates/:id - Get full template details
router.get('/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  } catch (error) {
    console.error('Error fetching IVR template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/ivr/templates/:id/apply - Create menus from template
router.post('/templates/:id/apply', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const template = getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const createdMenus: any[] = [];
    const menuIdMap = new Map<number, string>(); // Map submenu index to created menu ID

    // First, create all submenus so we have their IDs
    if (template.mainMenu.submenus) {
      for (let i = 0; i < template.mainMenu.submenus.length; i++) {
        const submenu = template.mainMenu.submenus[i];
        const [created] = await db
          .insert(ivrMenus)
          .values({
            organizationId,
            name: submenu.name,
            description: submenu.description,
            isDefault: false,
            greetingType: 'tts',
            greetingText: submenu.greetingText,
            inputTimeoutSeconds: submenu.inputTimeoutSeconds,
            maxRetries: submenu.maxRetries,
            invalidInputMessage: submenu.invalidInputMessage,
            timeoutMessage: submenu.timeoutMessage,
          })
          .returning();

        menuIdMap.set(i, created.id);
        createdMenus.push(created);
      }
    }

    // Create main menu
    const [mainMenu] = await db
      .insert(ivrMenus)
      .values({
        organizationId,
        name: template.mainMenu.name,
        description: template.mainMenu.description,
        isDefault: true, // Main menu is default
        greetingType: 'tts',
        greetingText: template.mainMenu.greetingText,
        inputTimeoutSeconds: template.mainMenu.inputTimeoutSeconds,
        maxRetries: template.mainMenu.maxRetries,
        invalidInputMessage: template.mainMenu.invalidInputMessage,
        timeoutMessage: template.mainMenu.timeoutMessage,
      })
      .returning();

    createdMenus.unshift(mainMenu);

    // Create options for main menu
    for (const opt of template.mainMenu.options) {
      const actionData = { ...opt.actionData };
      
      // Resolve submenu references
      if (opt.actionType === 'submenu' && typeof opt.actionData.submenuIndex === 'number') {
        const submenuId = menuIdMap.get(opt.actionData.submenuIndex);
        if (submenuId) {
          actionData.menuId = submenuId;
          delete actionData.submenuIndex;
        }
      }

      await db.insert(ivrMenuOptions).values({
        menuId: mainMenu.id,
        dtmfKey: opt.dtmfKey,
        label: opt.label,
        actionType: opt.actionType,
        actionData,
        announcementText: opt.announcementText,
      });
    }

    // Create options for submenus
    if (template.mainMenu.submenus) {
      for (let i = 0; i < template.mainMenu.submenus.length; i++) {
        const submenu = template.mainMenu.submenus[i];
        const submenuId = menuIdMap.get(i);
        if (!submenuId) continue;

        for (const opt of submenu.options) {
          const actionData = { ...opt.actionData };

          // Handle return to main menu
          if (opt.actionData.returnToMain) {
            actionData.menuId = mainMenu.id;
            delete actionData.returnToMain;
          }

          await db.insert(ivrMenuOptions).values({
            menuId: submenuId,
            dtmfKey: opt.dtmfKey,
            label: opt.label,
            actionType: opt.actionType,
            actionData,
            announcementText: opt.announcementText,
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdMenus.length} IVR menus from template "${template.name}"`,
      menus: createdMenus,
    });
  } catch (error) {
    console.error('Error applying IVR template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// ============================================
// IVR Menus CRUD
// ============================================

// GET /api/ivr/menus - List all IVR menus
router.get('/menus', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const menus = await db
      .select()
      .from(ivrMenus)
      .where(eq(ivrMenus.organizationId, organizationId))
      .orderBy(desc(ivrMenus.createdAt));

    // Get option counts for each menu
    const menusWithCounts = await Promise.all(
      menus.map(async (menu) => {
        const options = await db
          .select()
          .from(ivrMenuOptions)
          .where(eq(ivrMenuOptions.menuId, menu.id));
        return { ...menu, optionCount: options.length };
      })
    );

    res.json({ menus: menusWithCounts });
  } catch (error) {
    console.error('Error fetching IVR menus:', error);
    res.status(500).json({ error: 'Failed to fetch IVR menus' });
  }
});

// GET /api/ivr/menus/:id - Get single menu with options
router.get('/menus/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const menu = await ivrService.getMenu(req.params.id);
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    res.json({ menu });
  } catch (error) {
    console.error('Error fetching IVR menu:', error);
    res.status(500).json({ error: 'Failed to fetch IVR menu' });
  }
});

// POST /api/ivr/menus - Create new menu
router.post('/menus', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      description,
      isDefault,
      greetingType,
      greetingText,
      greetingAudioUrl,
      voiceProvider,
      voiceId,
      inputTimeoutSeconds,
      maxRetries,
      invalidInputMessage,
      timeoutMessage,
      callerIdProfileId,
      options,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(ivrMenus)
        .set({ isDefault: false })
        .where(eq(ivrMenus.organizationId, organizationId));
    }

    // Create menu
    const [menu] = await db
      .insert(ivrMenus)
      .values({
        organizationId,
        name,
        description,
        isDefault: isDefault || false,
        greetingType: greetingType || 'tts',
        greetingText,
        greetingAudioUrl,
        voiceProvider: voiceProvider || 'cartesia',
        voiceId,
        inputTimeoutSeconds: inputTimeoutSeconds || 5,
        maxRetries: maxRetries || 3,
        invalidInputMessage,
        timeoutMessage,
        callerIdProfileId: callerIdProfileId || null,
      })
      .returning();

    // Create options if provided
    if (options && Array.isArray(options) && options.length > 0) {
      await db.insert(ivrMenuOptions).values(
        options.map((opt: any, index: number) => ({
          menuId: menu.id,
          dtmfKey: opt.dtmfKey,
          label: opt.label,
          actionType: opt.actionType,
          actionData: opt.actionData || {},
          announcementText: opt.announcementText,
          sortOrder: index,
        }))
      );
    }

    res.status(201).json({ menu });
  } catch (error) {
    console.error('Error creating IVR menu:', error);
    res.status(500).json({ error: 'Failed to create IVR menu' });
  }
});

// PUT /api/ivr/menus/:id - Update menu
router.put('/menus/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      description,
      isActive,
      isDefault,
      greetingType,
      greetingText,
      greetingAudioUrl,
      voiceProvider,
      voiceId,
      inputTimeoutSeconds,
      maxRetries,
      invalidInputMessage,
      timeoutMessage,
      callerIdProfileId,
      options,
    } = req.body;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(ivrMenus)
      .where(and(eq(ivrMenus.id, req.params.id), eq(ivrMenus.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await db
        .update(ivrMenus)
        .set({ isDefault: false })
        .where(eq(ivrMenus.organizationId, organizationId));
    }

    // Update menu
    const [menu] = await db
      .update(ivrMenus)
      .set({
        name,
        description,
        isActive,
        isDefault,
        greetingType,
        greetingText,
        greetingAudioUrl,
        voiceProvider,
        voiceId,
        inputTimeoutSeconds,
        maxRetries,
        invalidInputMessage,
        timeoutMessage,
        callerIdProfileId: callerIdProfileId !== undefined ? (callerIdProfileId || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(ivrMenus.id, req.params.id))
      .returning();

    // Update options if provided
    if (options && Array.isArray(options)) {
      // Delete existing options
      await db.delete(ivrMenuOptions).where(eq(ivrMenuOptions.menuId, req.params.id));

      // Insert new options
      if (options.length > 0) {
        await db.insert(ivrMenuOptions).values(
          options.map((opt: any, index: number) => ({
            menuId: menu.id,
            dtmfKey: opt.dtmfKey,
            label: opt.label,
            actionType: opt.actionType,
            actionData: opt.actionData || {},
            announcementText: opt.announcementText,
            sortOrder: index,
          }))
        );
      }
    }

    res.json({ menu });
  } catch (error) {
    console.error('Error updating IVR menu:', error);
    res.status(500).json({ error: 'Failed to update IVR menu' });
  }
});

// DELETE /api/ivr/menus/:id - Delete menu
router.delete('/menus/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify ownership
    const [existing] = await db
      .select()
      .from(ivrMenus)
      .where(and(eq(ivrMenus.id, req.params.id), eq(ivrMenus.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    // Options are deleted via cascade
    await db.delete(ivrMenus).where(eq(ivrMenus.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting IVR menu:', error);
    res.status(500).json({ error: 'Failed to delete IVR menu' });
  }
});

// ============================================
// IVR Call Logs
// ============================================

// GET /api/ivr/logs - Get IVR call logs
router.get('/logs', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await db
      .select()
      .from(ivrCallLogs)
      .where(eq(ivrCallLogs.organizationId, organizationId))
      .orderBy(desc(ivrCallLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs });
  } catch (error) {
    console.error('Error fetching IVR logs:', error);
    res.status(500).json({ error: 'Failed to fetch IVR logs' });
  }
});

// ============================================
// IVR Runtime (for LiveKit agent integration)
// ============================================

// POST /api/ivr/session/start - Start IVR session (called by LiveKit agent)
router.post('/session/start', async (req: AuthRequest, res: Response) => {
  try {
    const { callId, organizationId, callerNumber, roomName } = req.body;

    if (!callId || !organizationId || !roomName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await ivrService.startSession({
      callId,
      organizationId,
      callerNumber: callerNumber || 'unknown',
      roomName,
    });

    if (!result) {
      return res.status(404).json({ error: 'No IVR menu configured' });
    }

    res.json({
      sessionStarted: true,
      greeting: ivrService.buildFullGreeting(result.menu),
      menu: result.menu,
    });
  } catch (error) {
    console.error('Error starting IVR session:', error);
    res.status(500).json({ error: 'Failed to start IVR session' });
  }
});

// POST /api/ivr/session/dtmf - Process DTMF input
router.post('/session/dtmf', async (req: AuthRequest, res: Response) => {
  try {
    const { callId, dtmfKey } = req.body;

    if (!callId || !dtmfKey) {
      return res.status(400).json({ error: 'Missing callId or dtmfKey' });
    }

    const result = await ivrService.processDtmf(callId, dtmfKey);

    if (!result) {
      return res.status(404).json({ error: 'No active IVR session' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error processing DTMF:', error);
    res.status(500).json({ error: 'Failed to process DTMF' });
  }
});

// POST /api/ivr/session/timeout - Handle input timeout
router.post('/session/timeout', async (req: AuthRequest, res: Response) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'Missing callId' });
    }

    const result = await ivrService.handleTimeout(callId);

    if (!result) {
      return res.status(404).json({ error: 'No active IVR session' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error handling timeout:', error);
    res.status(500).json({ error: 'Failed to handle timeout' });
  }
});

// POST /api/ivr/session/end - End IVR session
router.post('/session/end', async (req: AuthRequest, res: Response) => {
  try {
    const { callId, finalAction, finalActionData } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'Missing callId' });
    }

    await ivrService.endSession(callId, finalAction || 'hangup', finalActionData || {});

    res.json({ success: true });
  } catch (error) {
    console.error('Error ending IVR session:', error);
    res.status(500).json({ error: 'Failed to end IVR session' });
  }
});

export default router;
