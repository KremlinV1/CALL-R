import { db } from '../db/index.js';
import { ivrMenus, ivrMenuOptions, ivrCallLogs, agents, callerIdProfiles } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { livekitService } from './livekit.js';

// IVR Action Types
export type IvrActionType = 'play_message' | 'transfer' | 'voicemail' | 'submenu' | 'hangup' | 'repeat' | 'agent';

export interface IvrMenuOption {
  id: string;
  dtmfKey: string;
  label: string;
  actionType: IvrActionType;
  actionData: Record<string, any>;
  announcementText?: string;
}

export interface IvrCallerIdInfo {
  profileId: string;
  displayNumber: string;
  displayName: string | null;
  mode: string;
  profileName: string;
}

export interface IvrMenu {
  id: string;
  name: string;
  greetingType: 'tts' | 'audio';
  greetingText?: string;
  greetingAudioUrl?: string;
  voiceProvider: string;
  voiceId?: string;
  inputTimeoutSeconds: number;
  maxRetries: number;
  invalidInputMessage: string;
  timeoutMessage: string;
  options: IvrMenuOption[];
  callerId?: IvrCallerIdInfo;
}

export interface IvrSession {
  callId: string;
  organizationId: string;
  callerNumber: string;
  currentMenuId: string;
  dtmfInputs: Array<{ key: string; timestamp: Date; menuId: string }>;
  retryCount: number;
  startedAt: Date;
}

// In-memory session store (for production, use Redis)
const activeSessions = new Map<string, IvrSession>();

class IvrService {
  // Load a menu with its options and caller ID profile
  async getMenu(menuId: string): Promise<IvrMenu | null> {
    const [menu] = await db
      .select()
      .from(ivrMenus)
      .where(eq(ivrMenus.id, menuId))
      .limit(1);

    if (!menu) return null;

    const options = await db
      .select()
      .from(ivrMenuOptions)
      .where(eq(ivrMenuOptions.menuId, menuId))
      .orderBy(asc(ivrMenuOptions.sortOrder));

    // Load caller ID profile if assigned
    let callerId: IvrCallerIdInfo | undefined;
    if (menu.callerIdProfileId) {
      const [profile] = await db
        .select()
        .from(callerIdProfiles)
        .where(and(eq(callerIdProfiles.id, menu.callerIdProfileId), eq(callerIdProfiles.isActive, true)))
        .limit(1);

      if (profile) {
        callerId = {
          profileId: profile.id,
          displayNumber: profile.displayNumber,
          displayName: profile.displayName,
          mode: profile.mode,
          profileName: profile.name,
        };
      }
    }

    return {
      id: menu.id,
      name: menu.name,
      greetingType: (menu.greetingType as 'tts' | 'audio') || 'tts',
      greetingText: menu.greetingText || undefined,
      greetingAudioUrl: menu.greetingAudioUrl || undefined,
      voiceProvider: menu.voiceProvider || 'cartesia',
      voiceId: menu.voiceId || undefined,
      inputTimeoutSeconds: menu.inputTimeoutSeconds || 5,
      maxRetries: menu.maxRetries || 3,
      invalidInputMessage: menu.invalidInputMessage || 'Sorry, I didn\'t understand that.',
      timeoutMessage: menu.timeoutMessage || 'Goodbye.',
      options: options.map((opt) => ({
        id: opt.id,
        dtmfKey: opt.dtmfKey,
        label: opt.label,
        actionType: opt.actionType as IvrActionType,
        actionData: (opt.actionData as Record<string, any>) || {},
        announcementText: opt.announcementText || undefined,
      })),
      callerId,
    };
  }

  // Get default menu for an organization
  async getDefaultMenu(organizationId: string): Promise<IvrMenu | null> {
    const [menu] = await db
      .select()
      .from(ivrMenus)
      .where(and(eq(ivrMenus.organizationId, organizationId), eq(ivrMenus.isDefault, true), eq(ivrMenus.isActive, true)))
      .limit(1);

    if (!menu) return null;
    return this.getMenu(menu.id);
  }

  // Start an IVR session for an inbound call
  async startSession(params: {
    callId: string;
    organizationId: string;
    callerNumber: string;
    roomName: string;
  }): Promise<{ session: IvrSession; menu: IvrMenu } | null> {
    const menu = await this.getDefaultMenu(params.organizationId);
    if (!menu) {
      console.log(`No default IVR menu configured for org ${params.organizationId}`);
      return null;
    }

    const session: IvrSession = {
      callId: params.callId,
      organizationId: params.organizationId,
      callerNumber: params.callerNumber,
      currentMenuId: menu.id,
      dtmfInputs: [],
      retryCount: 0,
      startedAt: new Date(),
    };

    activeSessions.set(params.callId, session);

    // Log IVR start
    await db.insert(ivrCallLogs).values({
      organizationId: params.organizationId,
      callId: params.callId,
      menuId: menu.id,
      callerNumber: params.callerNumber,
      dtmfInputs: [],
    });

    return { session, menu };
  }

  // Process DTMF input
  async processDtmf(callId: string, dtmfKey: string): Promise<{
    action: IvrActionType;
    actionData: Record<string, any>;
    announcement?: string;
    nextMenu?: IvrMenu;
  } | null> {
    const session = activeSessions.get(callId);
    if (!session) {
      console.log(`No active IVR session for call ${callId}`);
      return null;
    }

    const menu = await this.getMenu(session.currentMenuId);
    if (!menu) {
      console.log(`Menu ${session.currentMenuId} not found`);
      return null;
    }

    // Record DTMF input
    session.dtmfInputs.push({
      key: dtmfKey,
      timestamp: new Date(),
      menuId: session.currentMenuId,
    });

    // Find matching option
    const option = menu.options.find((opt) => opt.dtmfKey === dtmfKey);

    if (!option) {
      // Invalid input
      session.retryCount++;
      if (session.retryCount >= menu.maxRetries) {
        // Max retries reached, hang up
        await this.endSession(callId, 'hangup', {});
        return {
          action: 'hangup',
          actionData: {},
          announcement: menu.timeoutMessage,
        };
      }
      return {
        action: 'repeat',
        actionData: {},
        announcement: menu.invalidInputMessage,
        nextMenu: menu,
      };
    }

    // Reset retry count on valid input
    session.retryCount = 0;

    // Handle submenu navigation
    if (option.actionType === 'submenu' && option.actionData.menuId) {
      const nextMenu = await this.getMenu(option.actionData.menuId);
      if (nextMenu) {
        session.currentMenuId = nextMenu.id;
        return {
          action: 'submenu',
          actionData: option.actionData,
          announcement: option.announcementText,
          nextMenu,
        };
      }
    }

    // Handle repeat
    if (option.actionType === 'repeat') {
      return {
        action: 'repeat',
        actionData: {},
        announcement: option.announcementText,
        nextMenu: menu,
      };
    }

    // For terminal actions (transfer, agent, voicemail, hangup), end session
    if (['transfer', 'agent', 'voicemail', 'hangup'].includes(option.actionType)) {
      await this.endSession(callId, option.actionType, option.actionData);
    }

    return {
      action: option.actionType,
      actionData: option.actionData,
      announcement: option.announcementText,
    };
  }

  // Handle timeout (no input received)
  async handleTimeout(callId: string): Promise<{
    action: IvrActionType;
    actionData: Record<string, any>;
    announcement?: string;
    nextMenu?: IvrMenu;
  } | null> {
    const session = activeSessions.get(callId);
    if (!session) return null;

    const menu = await this.getMenu(session.currentMenuId);
    if (!menu) return null;

    session.retryCount++;
    if (session.retryCount >= menu.maxRetries) {
      await this.endSession(callId, 'hangup', {});
      return {
        action: 'hangup',
        actionData: {},
        announcement: menu.timeoutMessage,
      };
    }

    return {
      action: 'repeat',
      actionData: {},
      announcement: 'I didn\'t receive any input. ' + this.buildMenuPrompt(menu),
      nextMenu: menu,
    };
  }

  // End IVR session
  async endSession(callId: string, finalAction: IvrActionType, finalActionData: Record<string, any>): Promise<void> {
    const session = activeSessions.get(callId);
    if (!session) return;

    // Update call log
    await db
      .update(ivrCallLogs)
      .set({
        dtmfInputs: session.dtmfInputs,
        finalAction,
        finalActionData,
        durationSeconds: Math.floor((Date.now() - session.startedAt.getTime()) / 1000),
        completedAt: new Date(),
      })
      .where(eq(ivrCallLogs.callId, callId));

    activeSessions.delete(callId);
  }

  // Get active session
  getSession(callId: string): IvrSession | undefined {
    return activeSessions.get(callId);
  }

  // Build menu prompt text from options
  buildMenuPrompt(menu: IvrMenu): string {
    const optionPrompts = menu.options
      .filter((opt) => opt.dtmfKey !== '*' && opt.dtmfKey !== '#') // Exclude special keys from main prompt
      .map((opt) => `Press ${opt.dtmfKey} for ${opt.label}`)
      .join('. ');

    return optionPrompts + '.';
  }

  // Build full greeting with menu options
  buildFullGreeting(menu: IvrMenu): string {
    const greeting = menu.greetingText || 'Welcome.';
    const menuPrompt = this.buildMenuPrompt(menu);
    return `${greeting} ${menuPrompt}`;
  }

  // Execute transfer action
  async executeTransfer(roomName: string, participantIdentity: string, transferTo: string): Promise<void> {
    await livekitService.transferCall({
      roomName,
      participantIdentity,
      transferTo,
      playDialtone: true,
    });
  }

  // Connect to AI agent
  async connectToAgent(roomName: string, agentId: string, organizationId: string): Promise<void> {
    // Get agent details
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
      .limit(1);

    if (!agent) {
      console.error(`Agent ${agentId} not found`);
      return;
    }

    // The agent should already be configured to join rooms via LiveKit dispatch rules
    // This is handled by the LiveKit Agents framework
    console.log(`Connecting call in room ${roomName} to agent ${agent.name}`);
  }
}

export const ivrService = new IvrService();
