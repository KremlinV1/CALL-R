import { db } from '../db/index.js';
import { crmIntegrations, crmSyncLogs, crmContactMappings, contacts, calls } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import axios from 'axios';

// ─── CRM Adapter Interface ──────────────────────────────────────────

interface CrmContact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  company?: string;
  [key: string]: any;
}

interface CrmCallLog {
  contactId: string;
  subject: string;
  description: string;
  durationSeconds: number;
  direction: string;
  outcome: string;
  timestamp: string;
}

interface CrmAdapter {
  testConnection(): Promise<boolean>;
  getContacts(limit?: number, offset?: number): Promise<CrmContact[]>;
  createContact(contact: Partial<CrmContact>): Promise<CrmContact>;
  updateContact(id: string, contact: Partial<CrmContact>): Promise<CrmContact>;
  logCall(callLog: CrmCallLog): Promise<string>; // returns activity ID
  searchContactByPhone(phone: string): Promise<CrmContact | null>;
}

// ─── Salesforce Adapter ─────────────────────────────────────────────

class SalesforceAdapter implements CrmAdapter {
  private accessToken: string;
  private instanceUrl: string;

  constructor(accessToken: string, instanceUrl: string) {
    this.accessToken = accessToken;
    this.instanceUrl = instanceUrl;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.instanceUrl}/services/data/v59.0/sobjects`, {
        headers: this.headers,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getContacts(limit = 100, offset = 0): Promise<CrmContact[]> {
    const query = `SELECT Id, FirstName, LastName, Phone, Email, Account.Name FROM Contact ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`;
    const res = await axios.get(
      `${this.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
      { headers: this.headers }
    );
    return (res.data.records || []).map((r: any) => ({
      id: r.Id,
      firstName: r.FirstName,
      lastName: r.LastName,
      phone: r.Phone,
      email: r.Email,
      company: r.Account?.Name,
    }));
  }

  async createContact(contact: Partial<CrmContact>): Promise<CrmContact> {
    const res = await axios.post(
      `${this.instanceUrl}/services/data/v59.0/sobjects/Contact`,
      {
        FirstName: contact.firstName,
        LastName: contact.lastName || 'Unknown',
        Phone: contact.phone,
        Email: contact.email,
      },
      { headers: this.headers }
    );
    return { id: res.data.id, ...contact };
  }

  async updateContact(id: string, contact: Partial<CrmContact>): Promise<CrmContact> {
    await axios.patch(
      `${this.instanceUrl}/services/data/v59.0/sobjects/Contact/${id}`,
      {
        ...(contact.firstName && { FirstName: contact.firstName }),
        ...(contact.lastName && { LastName: contact.lastName }),
        ...(contact.phone && { Phone: contact.phone }),
        ...(contact.email && { Email: contact.email }),
      },
      { headers: this.headers }
    );
    return { id, ...contact };
  }

  async logCall(callLog: CrmCallLog): Promise<string> {
    const res = await axios.post(
      `${this.instanceUrl}/services/data/v59.0/sobjects/Task`,
      {
        WhoId: callLog.contactId,
        Subject: callLog.subject,
        Description: callLog.description,
        CallDurationInSeconds: callLog.durationSeconds,
        CallType: callLog.direction === 'outbound' ? 'Outbound' : 'Inbound',
        Status: 'Completed',
        TaskSubtype: 'Call',
        ActivityDate: callLog.timestamp.split('T')[0],
      },
      { headers: this.headers }
    );
    return res.data.id;
  }

  async searchContactByPhone(phone: string): Promise<CrmContact | null> {
    const cleanPhone = phone.replace(/\D/g, '');
    const query = `SELECT Id, FirstName, LastName, Phone, Email FROM Contact WHERE Phone LIKE '%${cleanPhone.slice(-10)}%' LIMIT 1`;
    const res = await axios.get(
      `${this.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
      { headers: this.headers }
    );
    const record = res.data.records?.[0];
    if (!record) return null;
    return {
      id: record.Id,
      firstName: record.FirstName,
      lastName: record.LastName,
      phone: record.Phone,
      email: record.Email,
    };
  }
}

// ─── HubSpot Adapter ────────────────────────────────────────────────

class HubSpotAdapter implements CrmAdapter {
  private accessToken: string;
  private baseUrl = 'https://api.hubapi.com';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/crm/v3/objects/contacts?limit=1`, {
        headers: this.headers,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getContacts(limit = 100, offset = 0): Promise<CrmContact[]> {
    const res = await axios.get(
      `${this.baseUrl}/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,phone,email,company`,
      { headers: this.headers }
    );
    return (res.data.results || []).map((r: any) => ({
      id: r.id,
      firstName: r.properties.firstname,
      lastName: r.properties.lastname,
      phone: r.properties.phone,
      email: r.properties.email,
      company: r.properties.company,
    }));
  }

  async createContact(contact: Partial<CrmContact>): Promise<CrmContact> {
    const res = await axios.post(
      `${this.baseUrl}/crm/v3/objects/contacts`,
      {
        properties: {
          firstname: contact.firstName || '',
          lastname: contact.lastName || '',
          phone: contact.phone || '',
          email: contact.email || '',
          company: contact.company || '',
        },
      },
      { headers: this.headers }
    );
    return { id: res.data.id, ...contact };
  }

  async updateContact(id: string, contact: Partial<CrmContact>): Promise<CrmContact> {
    const properties: any = {};
    if (contact.firstName) properties.firstname = contact.firstName;
    if (contact.lastName) properties.lastname = contact.lastName;
    if (contact.phone) properties.phone = contact.phone;
    if (contact.email) properties.email = contact.email;

    await axios.patch(
      `${this.baseUrl}/crm/v3/objects/contacts/${id}`,
      { properties },
      { headers: this.headers }
    );
    return { id, ...contact };
  }

  async logCall(callLog: CrmCallLog): Promise<string> {
    // Create an engagement (call) in HubSpot
    const res = await axios.post(
      `${this.baseUrl}/crm/v3/objects/calls`,
      {
        properties: {
          hs_call_title: callLog.subject,
          hs_call_body: callLog.description,
          hs_call_duration: String(callLog.durationSeconds * 1000), // HubSpot uses milliseconds
          hs_call_direction: callLog.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
          hs_call_status: 'COMPLETED',
          hs_timestamp: new Date(callLog.timestamp).getTime(),
          hs_call_disposition: callLog.outcome || 'connected',
        },
      },
      { headers: this.headers }
    );

    // Associate call with contact
    const callId = res.data.id;
    if (callLog.contactId) {
      await axios.put(
        `${this.baseUrl}/crm/v3/objects/calls/${callId}/associations/contacts/${callLog.contactId}/call_to_contact`,
        {},
        { headers: this.headers }
      ).catch(() => {}); // Non-critical
    }

    return callId;
  }

  async searchContactByPhone(phone: string): Promise<CrmContact | null> {
    const cleanPhone = phone.replace(/\D/g, '');
    try {
      const res = await axios.post(
        `${this.baseUrl}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{
              propertyName: 'phone',
              operator: 'CONTAINS_TOKEN',
              value: cleanPhone.slice(-10),
            }],
          }],
          properties: ['firstname', 'lastname', 'phone', 'email', 'company'],
          limit: 1,
        },
        { headers: this.headers }
      );
      const record = res.data.results?.[0];
      if (!record) return null;
      return {
        id: record.id,
        firstName: record.properties.firstname,
        lastName: record.properties.lastname,
        phone: record.properties.phone,
        email: record.properties.email,
        company: record.properties.company,
      };
    } catch {
      return null;
    }
  }
}

// ─── Pipedrive Adapter ──────────────────────────────────────────────

class PipedriveAdapter implements CrmAdapter {
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken: string, companyDomain?: string) {
    this.apiToken = apiToken;
    this.baseUrl = companyDomain
      ? `https://${companyDomain}.pipedrive.com/api/v1`
      : 'https://api.pipedrive.com/v1';
  }

  private url(path: string) {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}api_token=${this.apiToken}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await axios.get(this.url('/users/me'));
      return res.data.success === true;
    } catch {
      return false;
    }
  }

  async getContacts(limit = 100, offset = 0): Promise<CrmContact[]> {
    const res = await axios.get(this.url(`/persons?start=${offset}&limit=${limit}`));
    return (res.data.data || []).map((r: any) => ({
      id: String(r.id),
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone?.[0]?.value,
      email: r.email?.[0]?.value,
      company: r.org_name,
    }));
  }

  async createContact(contact: Partial<CrmContact>): Promise<CrmContact> {
    const res = await axios.post(this.url('/persons'), {
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
      phone: contact.phone ? [{ value: contact.phone, primary: true }] : undefined,
      email: contact.email ? [{ value: contact.email, primary: true }] : undefined,
    });
    return { id: String(res.data.data.id), ...contact };
  }

  async updateContact(id: string, contact: Partial<CrmContact>): Promise<CrmContact> {
    const payload: any = {};
    if (contact.firstName || contact.lastName) {
      payload.name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    }
    if (contact.phone) payload.phone = [{ value: contact.phone, primary: true }];
    if (contact.email) payload.email = [{ value: contact.email, primary: true }];

    await axios.put(this.url(`/persons/${id}`), payload);
    return { id, ...contact };
  }

  async logCall(callLog: CrmCallLog): Promise<string> {
    const res = await axios.post(this.url('/activities'), {
      subject: callLog.subject,
      type: 'call',
      note: callLog.description,
      done: 1,
      duration: `${Math.floor(callLog.durationSeconds / 3600)}:${String(Math.floor((callLog.durationSeconds % 3600) / 60)).padStart(2, '0')}:${String(callLog.durationSeconds % 60).padStart(2, '0')}`,
      person_id: parseInt(callLog.contactId) || undefined,
      due_date: callLog.timestamp.split('T')[0],
    });
    return String(res.data.data.id);
  }

  async searchContactByPhone(phone: string): Promise<CrmContact | null> {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    try {
      const res = await axios.get(this.url(`/persons/search?term=${cleanPhone}&fields=phone`));
      const item = res.data.data?.items?.[0]?.item;
      if (!item) return null;
      return {
        id: String(item.id),
        firstName: item.name?.split(' ')[0],
        lastName: item.name?.split(' ').slice(1).join(' '),
        phone: item.phones?.[0],
        email: item.emails?.[0],
        company: item.organization?.name,
      };
    } catch {
      return null;
    }
  }
}

// ─── Factory & Service Functions ────────────────────────────────────

export function createCrmAdapter(
  provider: string,
  accessToken: string,
  options: { instanceUrl?: string; apiKey?: string; companyDomain?: string } = {}
): CrmAdapter {
  switch (provider) {
    case 'salesforce':
      if (!options.instanceUrl) throw new Error('Salesforce requires instanceUrl');
      return new SalesforceAdapter(accessToken, options.instanceUrl);
    case 'hubspot':
      return new HubSpotAdapter(accessToken);
    case 'pipedrive':
      return new PipedriveAdapter(options.apiKey || accessToken, options.companyDomain);
    default:
      throw new Error(`Unsupported CRM provider: ${provider}`);
  }
}

/**
 * Test a CRM connection using stored credentials.
 */
export async function testCrmConnection(integrationId: string): Promise<boolean> {
  const [integration] = await db
    .select()
    .from(crmIntegrations)
    .where(eq(crmIntegrations.id, integrationId))
    .limit(1);

  if (!integration) throw new Error('Integration not found');

  // In production, decrypt tokens here
  const token = integration.encryptedAccessToken || integration.encryptedApiKey || '';

  try {
    const adapter = createCrmAdapter(integration.provider, token, {
      instanceUrl: integration.instanceUrl || undefined,
    });
    return await adapter.testConnection();
  } catch {
    return false;
  }
}

/**
 * Sync contacts from CRM to local database.
 */
export async function syncContactsFromCrm(integrationId: string, organizationId: string) {
  const [integration] = await db
    .select()
    .from(crmIntegrations)
    .where(and(eq(crmIntegrations.id, integrationId), eq(crmIntegrations.organizationId, organizationId)))
    .limit(1);

  if (!integration) throw new Error('Integration not found');

  const token = integration.encryptedAccessToken || integration.encryptedApiKey || '';
  const adapter = createCrmAdapter(integration.provider, token, {
    instanceUrl: integration.instanceUrl || undefined,
  });

  // Create sync log
  const [syncLog] = await db.insert(crmSyncLogs).values({
    integrationId,
    organizationId,
    syncType: 'contacts',
    direction: 'pull',
    status: 'started',
  }).returning();

  let processed = 0, created = 0, updated = 0, failed = 0;
  const errors: any[] = [];

  try {
    const crmContacts = await adapter.getContacts(500);

    for (const crmContact of crmContacts) {
      processed++;
      try {
        // Check if mapping exists
        const [existing] = await db
          .select()
          .from(crmContactMappings)
          .where(and(
            eq(crmContactMappings.integrationId, integrationId),
            eq(crmContactMappings.crmRecordId, crmContact.id),
          ))
          .limit(1);

        if (existing) {
          // Update existing local contact
          await db.update(contacts)
            .set({
              firstName: crmContact.firstName || undefined,
              lastName: crmContact.lastName || undefined,
              phone: crmContact.phone || '',
              email: crmContact.email || undefined,
              company: crmContact.company || undefined,
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, existing.contactId));
          updated++;
        } else if (crmContact.phone) {
          // Create new local contact
          const [newContact] = await db.insert(contacts).values({
            organizationId,
            firstName: crmContact.firstName || null,
            lastName: crmContact.lastName || null,
            phone: crmContact.phone,
            email: crmContact.email || null,
            company: crmContact.company || null,
            tags: [integration.provider],
          }).returning();

          // Create mapping
          await db.insert(crmContactMappings).values({
            integrationId,
            contactId: newContact.id,
            crmRecordId: crmContact.id,
            crmRecordType: 'contact',
            lastSyncedAt: new Date(),
          });
          created++;
        }
      } catch (err: any) {
        failed++;
        errors.push({ record: crmContact.id, error: err.message });
      }
    }

    // Update sync log
    await db.update(crmSyncLogs)
      .set({
        status: 'completed',
        recordsProcessed: processed,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsFailed: failed,
        errors,
        completedAt: new Date(),
      })
      .where(eq(crmSyncLogs.id, syncLog.id));

    // Update integration
    await db.update(crmIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(crmIntegrations.id, integrationId));

    return { processed, created, updated, failed, errors };
  } catch (err: any) {
    await db.update(crmSyncLogs)
      .set({
        status: 'failed',
        recordsProcessed: processed,
        recordsFailed: failed,
        errors: [{ error: err.message }],
        completedAt: new Date(),
      })
      .where(eq(crmSyncLogs.id, syncLog.id));

    await db.update(crmIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: err.message,
        updatedAt: new Date(),
      })
      .where(eq(crmIntegrations.id, integrationId));

    throw err;
  }
}

/**
 * Log a completed call to CRM.
 */
export async function logCallToCrm(
  integrationId: string,
  callData: {
    contactCrmId: string;
    subject: string;
    description: string;
    durationSeconds: number;
    direction: string;
    outcome: string;
    timestamp: string;
  }
) {
  const [integration] = await db
    .select()
    .from(crmIntegrations)
    .where(eq(crmIntegrations.id, integrationId))
    .limit(1);

  if (!integration) throw new Error('Integration not found');

  const token = integration.encryptedAccessToken || integration.encryptedApiKey || '';
  const adapter = createCrmAdapter(integration.provider, token, {
    instanceUrl: integration.instanceUrl || undefined,
  });

  return adapter.logCall({
    contactId: callData.contactCrmId,
    subject: callData.subject,
    description: callData.description,
    durationSeconds: callData.durationSeconds,
    direction: callData.direction,
    outcome: callData.outcome,
    timestamp: callData.timestamp,
  });
}
