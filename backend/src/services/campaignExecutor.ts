import { db } from '../db/index.js';
import { campaigns, campaignContacts, calls, contacts, agents } from '../db/schema.js';
import { eq, and, inArray, sql, lte, gte } from 'drizzle-orm';
import axios from 'axios';
import { io } from '../index.js';
import { phoneNumberRotation } from './phoneNumberRotation.js';
import { generateToken } from '../middleware/auth.js';

interface CampaignExecution {
  campaignId: string;
  isRunning: boolean;
  activeCallCount: number;
  lastCallTime: Date | null;
  callQueue: string[]; // contact IDs
}

// Track active campaign executions
const activeCampaigns = new Map<string, CampaignExecution>();

// Throttling configuration
interface ThrottleConfig {
  callsPerMinute: number;
  maxConcurrentCalls: number;
}

/**
 * Campaign Executor Service
 * Manages automated campaign execution with throttling and retry logic
 */
export class CampaignExecutor {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
  
  /**
   * Start the campaign executor service
   */
  start() {
    console.log('🚀 Campaign Executor Service starting...');
    
    // Check for campaigns to start immediately
    this.checkCampaigns();
    
    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkCampaigns();
    }, this.CHECK_INTERVAL_MS);
    
    console.log('✅ Campaign Executor Service started');
  }
  
  /**
   * Stop the campaign executor service
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Stop all active campaigns
    activeCampaigns.forEach((execution, campaignId) => {
      execution.isRunning = false;
    });
    activeCampaigns.clear();
    
    console.log('🛑 Campaign Executor Service stopped');
  }
  
  /**
   * Check for campaigns that should be started
   */
  private async checkCampaigns() {
    try {
      const now = new Date();
      
      // Find campaigns that should be running
      const campaignsToStart = await db.select()
        .from(campaigns)
        .where(
          sql`(
            ${campaigns.status} = 'scheduled' AND 
            (
              ${campaigns.scheduleType} = 'immediate' OR
              (${campaigns.scheduleType} = 'scheduled' AND ${campaigns.scheduledStartAt} <= ${now}) OR
              (${campaigns.scheduleType} = 'recurring' AND ${this.shouldRunRecurring(campaigns)})
            )
          ) OR (
            ${campaigns.status} = 'running'
          )`
        );
      
      for (const campaign of campaignsToStart) {
        if (!activeCampaigns.has(campaign.id)) {
          // Start new campaign execution
          await this.startCampaignExecution(campaign.id);
        } else {
          // Continue existing campaign execution
          await this.processCampaignQueue(campaign.id);
        }
      }
      
      // Stop campaigns that are no longer active
      for (const [campaignId, execution] of activeCampaigns.entries()) {
        const campaign = campaignsToStart.find(c => c.id === campaignId);
        if (!campaign || campaign.status === 'paused' || campaign.status === 'completed') {
          execution.isRunning = false;
          activeCampaigns.delete(campaignId);
        }
      }
      
    } catch (error) {
      console.error('Error checking campaigns:', error);
    }
  }
  
  /**
   * Check if a recurring campaign should run now
   */
  private shouldRunRecurring(campaign: any): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if within time window
    if (campaign.timeWindowStart && campaign.timeWindowEnd) {
      if (currentTime < campaign.timeWindowStart || currentTime > campaign.timeWindowEnd) {
        return false;
      }
    }
    
    // Check recurring pattern
    if (campaign.recurringPattern === 'daily') {
      return true;
    }
    
    if (campaign.recurringPattern === 'weekly') {
      const recurringDays = campaign.recurringDays || [];
      return recurringDays.includes(dayOfWeek);
    }
    
    if (campaign.recurringPattern === 'monthly') {
      // Run on the first day of the month
      return now.getDate() === 1;
    }
    
    return false;
  }
  
  /**
   * Start executing a campaign
   */
  private async startCampaignExecution(campaignId: string) {
    try {
      console.log(`📞 Starting campaign execution: ${campaignId}`);
      
      // Get pending contacts for this campaign
      const pendingContacts = await db.select({
        contactId: campaignContacts.contactId,
      })
      .from(campaignContacts)
      .where(and(
        eq(campaignContacts.campaignId, campaignId),
        eq(campaignContacts.status, 'pending')
      ));
      
      if (pendingContacts.length === 0) {
        console.log(`⚠️ No pending contacts for campaign ${campaignId}`);
        // Mark campaign as completed
        await db.update(campaigns)
          .set({ 
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));
        return;
      }
      
      // Update campaign status to running
      await db.update(campaigns)
        .set({ 
          status: 'running',
          startedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
      
      // Initialize campaign execution
      const execution: CampaignExecution = {
        campaignId,
        isRunning: true,
        activeCallCount: 0,
        lastCallTime: null,
        callQueue: pendingContacts.map(c => c.contactId),
      };
      
      activeCampaigns.set(campaignId, execution);
      
      // Emit socket event
      io.emit('campaign:started', { campaignId });
      
      // Start processing the queue
      await this.processCampaignQueue(campaignId);
      
    } catch (error) {
      console.error(`Error starting campaign ${campaignId}:`, error);
    }
  }
  
  /**
   * Process the campaign contact queue with throttling
   */
  private async processCampaignQueue(campaignId: string) {
    const execution = activeCampaigns.get(campaignId);
    if (!execution || !execution.isRunning) {
      return;
    }
    
    try {
      // Get campaign config
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (!campaign || campaign.status !== 'running') {
        execution.isRunning = false;
        activeCampaigns.delete(campaignId);
        return;
      }
      
      const throttle: ThrottleConfig = {
        callsPerMinute: campaign.callsPerMinute || 10,
        maxConcurrentCalls: campaign.maxConcurrentCalls || 5,
      };
      
      // Check if we can make more calls
      const canMakeCall = this.canMakeCall(execution, throttle);
      
      if (canMakeCall && execution.callQueue.length > 0) {
        // Get next contact from queue
        const contactId = execution.callQueue.shift()!;
        
        // Update counters before the call
        execution.lastCallTime = new Date();
        execution.activeCallCount++;
        
        // Make the call and WAIT for it to complete before scheduling the next
        try {
          await this.makeCall(campaignId, contactId, campaign.agentId);
        } catch (error) {
          console.error(`Error making call for contact ${contactId}:`, error);
        }
        
        // Continue processing if there are more contacts
        if (execution.callQueue.length > 0 && execution.isRunning) {
          // Delay between calls: at least 5s, or throttle-based delay, whichever is longer
          const throttleDelayMs = 60000 / throttle.callsPerMinute;
          const delayMs = Math.max(throttleDelayMs, 5000);
          setTimeout(() => {
            this.processCampaignQueue(campaignId);
          }, delayMs);
        }
      }
      
      // Check if campaign is complete
      if (execution.callQueue.length === 0 && execution.activeCallCount === 0) {
        await this.completeCampaign(campaignId);
      }
      
    } catch (error) {
      console.error(`Error processing queue for campaign ${campaignId}:`, error);
    }
  }
  
  /**
   * Check if we can make another call based on throttling rules
   */
  private canMakeCall(execution: CampaignExecution, throttle: ThrottleConfig): boolean {
    // Check concurrent limit
    if (execution.activeCallCount >= throttle.maxConcurrentCalls) {
      return false;
    }
    
    // Check calls per minute limit
    if (execution.lastCallTime) {
      const timeSinceLastCall = Date.now() - execution.lastCallTime.getTime();
      const minTimeBetweenCalls = 60000 / throttle.callsPerMinute;
      
      if (timeSinceLastCall < minTimeBetweenCalls) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Make a call to a contact
   */
  private async makeCall(campaignId: string, contactId: string, agentId: string) {
    try {
      // Get campaign details for phone number pool
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (!campaign) {
        console.error(`Campaign ${campaignId} not found`);
        return;
      }
      
      // Get contact details
      const [contact] = await db.select()
        .from(contacts)
        .where(eq(contacts.id, contactId));
      
      if (!contact) {
        console.error(`Contact ${contactId} not found`);
        return;
      }
      
      // Determine which phone number to use
      let fromNumber = process.env.VONAGE_PHONE_NUMBER || '';
      
      if (campaign.phoneNumberPoolId) {
        // Use phone number pool rotation
        const poolNumber = await phoneNumberRotation.getNextNumber(campaign.phoneNumberPoolId);
        if (poolNumber) {
          fromNumber = poolNumber.phoneNumber;
          console.log(`📞 Using rotated number from pool: ${fromNumber}`);
        } else {
          console.warn(`⚠️ No available numbers in pool ${campaign.phoneNumberPoolId}, using default`);
        }
      } else if (campaign.singlePhoneNumber) {
        // Use campaign-specific single number
        fromNumber = campaign.singlePhoneNumber;
      }
      
      // fromNumber may be empty for Vogent campaigns — the outbound endpoint
      // resolves the from number via Vogent's phoneNumberId config
      
      // Update contact status to in_progress
      await db.update(campaignContacts)
        .set({ 
          status: 'in_progress',
          attemptedAt: new Date(),
          attempts: sql`${campaignContacts.attempts} + 1`,
        })
        .where(and(
          eq(campaignContacts.campaignId, campaignId),
          eq(campaignContacts.contactId, contactId)
        ));
      
      // Make the call via API
      const API_URL = process.env.API_URL || 'http://localhost:4000';
      
      // Generate a valid internal JWT for the campaign's organization
      const internalToken = await generateToken({
        sub: 'campaign-executor',
        email: 'system@internal',
        organizationId: campaign.organizationId,
        role: 'admin',
      });
      
      const response = await axios.post(
        `${API_URL}/api/calls/outbound`,
        {
          agentId,
          toNumber: contact.phone,
          fromNumber, // Use the determined phone number (from pool or campaign)
          campaignId,
          contactId,
          // Add any custom fields as metadata
          metadata: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            company: contact.company,
            customFields: contact.customFields,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${internalToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      console.log(`✅ Call initiated for contact ${contactId}: ${response.data.call?.id}`);
      
      // Emit socket event
      io.emit('campaign:call_started', { 
        campaignId, 
        contactId, 
        callId: response.data.call?.id 
      });
      
    } catch (error: any) {
      console.error(`❌ Failed to make call for contact ${contactId}:`, error.message);
      
      // Handle retry logic
      await this.handleCallFailure(campaignId, contactId, error);
    } finally {
      // Decrement active call count
      const execution = activeCampaigns.get(campaignId);
      if (execution) {
        execution.activeCallCount--;
      }
    }
  }
  
  /**
   * Handle call failure and implement retry logic
   */
  private async handleCallFailure(campaignId: string, contactId: string, error: any) {
    try {
      // Get current attempt count
      const [campaignContact] = await db.select()
        .from(campaignContacts)
        .where(and(
          eq(campaignContacts.campaignId, campaignId),
          eq(campaignContacts.contactId, contactId)
        ));
      
      if (!campaignContact) {
        return;
      }
      
      const maxRetries = 3;
      const currentAttempts = campaignContact.attempts || 0;
      
      if (currentAttempts < maxRetries) {
        // Schedule retry - add back to queue
        const execution = activeCampaigns.get(campaignId);
        if (execution) {
          // Use exponential backoff: 1 min, 5 min, 15 min
          const retryDelayMs = Math.pow(5, currentAttempts) * 60 * 1000;
          
          setTimeout(() => {
            execution.callQueue.push(contactId);
            this.processCampaignQueue(campaignId);
          }, retryDelayMs);
          
          // Update status to retry_scheduled
          await db.update(campaignContacts)
            .set({ 
              status: 'pending', // Will retry
              lastError: error.message,
            })
            .where(and(
              eq(campaignContacts.campaignId, campaignId),
              eq(campaignContacts.contactId, contactId)
            ));
          
          console.log(`🔄 Retry scheduled for contact ${contactId} (attempt ${currentAttempts + 1}/${maxRetries})`);
        }
      } else {
        // Max retries reached, mark as failed
        await db.update(campaignContacts)
          .set({ 
            status: 'failed',
            lastError: error.message,
            completedAt: new Date(),
          })
          .where(and(
            eq(campaignContacts.campaignId, campaignId),
            eq(campaignContacts.contactId, contactId)
          ));
        
        // Update campaign failed count
        await db.update(campaigns)
          .set({ 
            failedCalls: sql`${campaigns.failedCalls} + 1`,
          })
          .where(eq(campaigns.id, campaignId));
        
        console.log(`❌ Contact ${contactId} marked as failed after ${maxRetries} attempts`);
      }
      
    } catch (err) {
      console.error('Error handling call failure:', err);
    }
  }
  
  /**
   * Complete a campaign
   */
  private async completeCampaign(campaignId: string) {
    try {
      console.log(`✅ Completing campaign: ${campaignId}`);
      
      // Update campaign status
      await db.update(campaigns)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
      
      // Remove from active campaigns
      activeCampaigns.delete(campaignId);
      
      // Emit socket event
      io.emit('campaign:completed', { campaignId });
      
    } catch (error) {
      console.error(`Error completing campaign ${campaignId}:`, error);
    }
  }
  
  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string) {
    try {
      // Update campaign status
      await db.update(campaigns)
        .set({ status: 'paused' })
        .where(eq(campaigns.id, campaignId));
      
      // Stop execution
      const execution = activeCampaigns.get(campaignId);
      if (execution) {
        execution.isRunning = false;
        activeCampaigns.delete(campaignId);
      }
      
      // Emit socket event
      io.emit('campaign:paused', { campaignId });
      
      console.log(`⏸️ Campaign paused: ${campaignId}`);
    } catch (error) {
      console.error(`Error pausing campaign ${campaignId}:`, error);
      throw error;
    }
  }
  
  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId: string) {
    try {
      // Update campaign status
      await db.update(campaigns)
        .set({ status: 'running' })
        .where(eq(campaigns.id, campaignId));
      
      // Start execution
      await this.startCampaignExecution(campaignId);
      
      // Emit socket event
      io.emit('campaign:resumed', { campaignId });
      
      console.log(`▶️ Campaign resumed: ${campaignId}`);
    } catch (error) {
      console.error(`Error resuming campaign ${campaignId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get campaign execution status
   */
  getCampaignStatus(campaignId: string): CampaignExecution | null {
    return activeCampaigns.get(campaignId) || null;
  }
}

// Export singleton instance
export const campaignExecutor = new CampaignExecutor();
