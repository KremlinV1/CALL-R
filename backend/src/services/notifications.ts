import { db } from '../db/index.js';
import { notificationChannels, notificationLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';

// ─── Types ──────────────────────────────────────────────────────────

interface NotificationEvent {
  type: string;            // e.g. 'call.completed', 'campaign.completed'
  organizationId: string;
  agentId?: string;
  campaignId?: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

interface ChannelConfig {
  webhookUrl?: string;
  channel?: string;
  botToken?: string;
  provider?: string;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  fromNumber?: string;
  toNumber?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  secret?: string;
}

// ─── Channel Dispatchers ────────────────────────────────────────────

async function sendSlack(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  if (!config.webhookUrl) throw new Error('Slack webhookUrl not configured');

  const payload: any = {
    text: `*${event.title}*\n${event.message}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: event.title },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: event.message },
      },
    ],
  };

  if (config.channel) payload.channel = config.channel;

  const res = await axios.post(config.webhookUrl, payload, { timeout: 10000 });
  return { status: res.status };
}

async function sendTeams(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  if (!config.webhookUrl) throw new Error('Teams webhookUrl not configured');

  const payload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '0076D7',
    summary: event.title,
    sections: [{
      activityTitle: event.title,
      activitySubtitle: event.type,
      text: event.message,
      facts: event.data ? Object.entries(event.data).slice(0, 5).map(([name, value]) => ({
        name,
        value: String(value),
      })) : [],
    }],
  };

  const res = await axios.post(config.webhookUrl, payload, { timeout: 10000 });
  return { status: res.status };
}

async function sendDiscord(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  if (!config.webhookUrl) throw new Error('Discord webhookUrl not configured');

  const payload = {
    embeds: [{
      title: event.title,
      description: event.message,
      color: event.type.includes('failed') ? 0xff0000 : 0x00ff00,
      timestamp: new Date().toISOString(),
      fields: event.data ? Object.entries(event.data).slice(0, 10).map(([name, value]) => ({
        name,
        value: String(value),
        inline: true,
      })) : [],
    }],
  };

  const res = await axios.post(config.webhookUrl, payload, { timeout: 10000 });
  return { status: res.status };
}

async function sendEmail(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  const provider = config.provider || 'sendgrid';
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error('Email API key not configured');

  if (provider === 'sendgrid') {
    const res = await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{
        to: [{ email: event.data?.recipientEmail || config.fromEmail }],
      }],
      from: {
        email: config.fromEmail || 'noreply@poneline.com',
        name: config.fromName || 'Pon-E-Line',
      },
      subject: event.title,
      content: [{
        type: 'text/html',
        value: `<h2>${event.title}</h2><p>${event.message}</p>${
          event.data ? `<pre>${JSON.stringify(event.data, null, 2)}</pre>` : ''
        }`,
      }],
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return { status: res.status };
  }

  if (provider === 'postmark') {
    const res = await axios.post('https://api.postmarkapp.com/email', {
      From: `${config.fromName || 'Pon-E-Line'} <${config.fromEmail || 'noreply@poneline.com'}>`,
      To: event.data?.recipientEmail || config.fromEmail,
      Subject: event.title,
      HtmlBody: `<h2>${event.title}</h2><p>${event.message}</p>`,
    }, {
      headers: { 'X-Postmark-Server-Token': apiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return { status: res.status };
  }

  throw new Error(`Unsupported email provider: ${provider}`);
}

async function sendSms(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  const provider = config.provider || 'telnyx';
  const toNumber = event.data?.recipientPhone || config.toNumber;
  if (!toNumber) throw new Error('No recipient phone number');

  if (provider === 'telnyx') {
    const apiKey = config.apiKey || process.env.TELNYX_API_KEY;
    if (!apiKey) throw new Error('Telnyx API key not configured');

    const res = await axios.post('https://api.telnyx.com/v2/messages', {
      from: config.fromNumber,
      to: toNumber,
      text: `${event.title}: ${event.message}`,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return { status: res.status };
  }

  if (provider === 'twilio') {
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error('Twilio credentials not configured');
    // apiKey expected as "accountSid:authToken"
    const [accountSid, authToken] = apiKey.split(':');

    const params = new URLSearchParams();
    params.append('From', config.fromNumber || '');
    params.append('To', toNumber);
    params.append('Body', `${event.title}: ${event.message}`);

    const res = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      params,
      {
        auth: { username: accountSid, password: authToken },
        timeout: 10000,
      }
    );
    return { status: res.status };
  }

  throw new Error(`Unsupported SMS provider: ${provider}`);
}

async function sendWebhook(config: ChannelConfig, event: NotificationEvent): Promise<{ status: number }> {
  if (!config.url) throw new Error('Webhook URL not configured');

  const method = (config.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  };

  // Add HMAC signature if secret is set
  if (config.secret) {
    const crypto = await import('crypto');
    const body = JSON.stringify({ event: event.type, title: event.title, message: event.message, data: event.data });
    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    headers['X-Signature'] = signature;
  }

  const res = await axios({
    method,
    url: config.url,
    headers,
    data: { event: event.type, title: event.title, message: event.message, data: event.data },
    timeout: 10000,
  });

  return { status: res.status };
}

// ─── Main Dispatch Function ─────────────────────────────────────────

const dispatchers: Record<string, (config: ChannelConfig, event: NotificationEvent) => Promise<{ status: number }>> = {
  slack: sendSlack,
  teams: sendTeams,
  discord: sendDiscord,
  email: sendEmail,
  sms: sendSms,
  webhook: sendWebhook,
};

/**
 * Send a notification event to all matching active channels for the organization.
 */
export async function dispatchNotification(event: NotificationEvent): Promise<void> {
  // Find all active channels for this organization that subscribe to this event type
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(and(
      eq(notificationChannels.organizationId, event.organizationId),
      eq(notificationChannels.isActive, true),
    ));

  for (const channel of channels) {
    // Check event subscription
    const subscribedEvents = (channel.subscribedEvents as string[]) || [];
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(event.type)) {
      continue; // Not subscribed to this event
    }

    // Check agent filter
    const agentIds = (channel.agentIds as string[]) || [];
    if (agentIds.length > 0 && event.agentId && !agentIds.includes(event.agentId)) {
      continue;
    }

    // Check campaign filter
    const campaignIds = (channel.campaignIds as string[]) || [];
    if (campaignIds.length > 0 && event.campaignId && !campaignIds.includes(event.campaignId)) {
      continue;
    }

    // Dispatch
    const config = (channel.config as ChannelConfig) || {};
    const dispatcher = dispatchers[channel.channelType];

    if (!dispatcher) {
      console.warn(`[Notifications] Unknown channel type: ${channel.channelType}`);
      continue;
    }

    try {
      const result = await dispatcher(config, event);

      // Log success
      await db.insert(notificationLogs).values({
        channelId: channel.id,
        organizationId: event.organizationId,
        eventType: event.type,
        payload: { title: event.title, message: event.message, data: event.data },
        status: 'sent',
        responseCode: result.status,
      });

      console.log(`[Notifications] ✅ Sent ${event.type} to ${channel.channelType}:${channel.name}`);
    } catch (err: any) {
      // Log failure
      await db.insert(notificationLogs).values({
        channelId: channel.id,
        organizationId: event.organizationId,
        eventType: event.type,
        payload: { title: event.title, message: event.message, data: event.data },
        status: 'failed',
        error: err.message,
        responseCode: err.response?.status || null,
      });

      console.error(`[Notifications] ❌ Failed to send ${event.type} to ${channel.channelType}:${channel.name}: ${err.message}`);
    }
  }
}

/**
 * Send a test notification to a specific channel.
 */
export async function sendTestNotification(channelId: string, organizationId: string): Promise<boolean> {
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.organizationId, organizationId)))
    .limit(1);

  if (!channel) throw new Error('Channel not found');

  const config = (channel.config as ChannelConfig) || {};
  const dispatcher = dispatchers[channel.channelType];
  if (!dispatcher) throw new Error(`Unknown channel type: ${channel.channelType}`);

  const testEvent: NotificationEvent = {
    type: 'test',
    organizationId,
    title: '🔔 Test Notification',
    message: `This is a test notification from Pon-E-Line sent to your ${channel.channelType} channel "${channel.name}".`,
    data: { timestamp: new Date().toISOString(), channelType: channel.channelType },
  };

  try {
    await dispatcher(config, testEvent);
    return true;
  } catch {
    return false;
  }
}
