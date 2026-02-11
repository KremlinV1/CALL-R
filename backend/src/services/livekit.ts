import { SipClient, RoomServiceClient } from 'livekit-server-sdk';

// LiveKit SIP Service - wraps the livekit-server-sdk for telephony operations
class LiveKitService {
  private sipClient: SipClient;
  private roomClient: RoomServiceClient;
  private livekitUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.livekitUrl = process.env.LIVEKIT_URL || '';
    this.apiKey = process.env.LIVEKIT_API_KEY || '';
    this.apiSecret = process.env.LIVEKIT_API_SECRET || '';

    if (!this.livekitUrl || !this.apiKey || !this.apiSecret) {
      console.warn('⚠️  LiveKit credentials not configured. Telephony features will be unavailable.');
    }

    this.sipClient = new SipClient(this.livekitUrl, this.apiKey, this.apiSecret);
    this.roomClient = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }

  isConfigured(): boolean {
    return !!(this.livekitUrl && this.apiKey && this.apiSecret);
  }

  // ── Inbound Trunks ──────────────────────────────────────────────────

  async listInboundTrunks() {
    return this.sipClient.listSipInboundTrunk();
  }

  async createInboundTrunk(options: {
    name: string;
    numbers: string[];
    allowedAddresses?: string[];
    allowedNumbers?: string[];
  }) {
    return this.sipClient.createSipInboundTrunk(
      options.name,
      options.numbers,
      {
        allowedAddresses: options.allowedAddresses || [],
        allowedNumbers: options.allowedNumbers || [],
      }
    );
  }

  async updateInboundTrunk(trunkId: string, updates: Record<string, any>) {
    return this.sipClient.updateSipInboundTrunkFields(trunkId, updates);
  }

  async deleteInboundTrunk(trunkId: string) {
    return this.sipClient.deleteSipTrunk(trunkId);
  }

  // ── Outbound Trunks ─────────────────────────────────────────────────

  async listOutboundTrunks() {
    return this.sipClient.listSipOutboundTrunk();
  }

  async createOutboundTrunk(options: {
    name: string;
    address: string;
    numbers: string[];
    authUsername?: string;
    authPassword?: string;
    transport?: number;
  }) {
    return this.sipClient.createSipOutboundTrunk(
      options.name,
      options.address,
      options.numbers,
      {
        authUsername: options.authUsername || '',
        authPassword: options.authPassword || '',
        transport: options.transport || 0, // 0 = auto
      }
    );
  }

  async updateOutboundTrunk(trunkId: string, updates: Record<string, any>) {
    return this.sipClient.updateSipOutboundTrunkFields(trunkId, updates);
  }

  async deleteOutboundTrunk(trunkId: string) {
    return this.sipClient.deleteSipTrunk(trunkId);
  }

  // ── Dispatch Rules ──────────────────────────────────────────────────

  async listDispatchRules() {
    return this.sipClient.listSipDispatchRule();
  }

  async createDispatchRule(options: {
    name: string;
    trunkIds: string[];
    roomPrefix?: string;
    roomName?: string;
    pin?: string;
    agentName?: string;
  }) {
    let rule: any;

    if (options.roomName) {
      // Direct dispatch to a specific room
      rule = {
        type: 'directDispatch',
        roomName: options.roomName,
        pin: options.pin || '',
      };
    } else {
      // Individual dispatch (one room per caller)
      rule = {
        type: 'individualDispatch',
        roomPrefix: options.roomPrefix || '',
        pin: options.pin || '',
      };
    }

    const opts: any = {
      name: options.name,
      trunkIds: options.trunkIds,
    };

    if (options.agentName) {
      opts.roomConfig = {
        agents: [{ agentName: options.agentName, metadata: '' }],
      };
    }

    return this.sipClient.createSipDispatchRule(rule, opts);
  }

  async updateDispatchRule(ruleId: string, updates: Record<string, any>) {
    return this.sipClient.updateSipDispatchRuleFields(ruleId, updates);
  }

  async deleteDispatchRule(ruleId: string) {
    return this.sipClient.deleteSipDispatchRule(ruleId);
  }

  // ── Calls ───────────────────────────────────────────────────────────

  async createOutboundCall(options: {
    sipTrunkId: string;
    phoneNumber: string;
    roomName: string;
    participantIdentity: string;
    participantName?: string;
    fromNumber?: string;
    playRingtone?: boolean;
    agentName?: string;
    metadata?: string;
  }) {
    const callOptions: any = {
      participantIdentity: options.participantIdentity,
      participantName: options.participantName || 'SIP Call',
      playRingtone: options.playRingtone ?? false,
    };

    if (options.fromNumber) {
      callOptions.sipNumber = options.fromNumber;
    }

    if (options.metadata) {
      callOptions.participantMetadata = options.metadata;
    }

    // If an agent should handle the call, configure room with agent dispatch
    if (options.agentName) {
      callOptions.roomConfig = {
        agents: [{ agentName: options.agentName, metadata: '' }],
      };
    }

    return this.sipClient.createSipParticipant(
      options.sipTrunkId,
      options.phoneNumber,
      options.roomName,
      callOptions
    );
  }

  async transferCall(options: {
    roomName: string;
    participantIdentity: string;
    transferTo: string;
    playDialtone?: boolean;
  }) {
    return this.sipClient.transferSipParticipant(
      options.roomName,
      options.participantIdentity,
      options.transferTo,
      { playDialtone: options.playDialtone ?? true }
    );
  }

  // ── Rooms ───────────────────────────────────────────────────────────

  async listRooms() {
    return this.roomClient.listRooms();
  }

  async getRoom(roomName: string) {
    const rooms = await this.roomClient.listRooms([roomName]);
    return rooms[0] || null;
  }

  async listParticipants(roomName: string) {
    return this.roomClient.listParticipants(roomName);
  }

  async removeParticipant(roomName: string, identity: string) {
    return this.roomClient.removeParticipant(roomName, identity);
  }

  // ── Phone Numbers (via REST API since SDK doesn't support it yet) ──

  async searchPhoneNumbers(countryCode: string, areaCode?: string, limit?: number) {
    const httpUrl = this.livekitUrl.replace('wss://', 'https://');
    const url = new URL('/twirp/livekit.PhoneNumberService/SearchPhoneNumbers', httpUrl);

    const body: any = { country_code: countryCode };
    if (areaCode) body.area_code = areaCode;
    if (limit) body.limit = limit;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.generateToken()}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to search phone numbers: ${response.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Phone number search is not available on this LiveKit instance. Use the LiveKit Cloud Dashboard to manage numbers.');
    }
  }

  async purchasePhoneNumber(phoneNumber: string) {
    const httpUrl = this.livekitUrl.replace('wss://', 'https://');
    const url = new URL('/twirp/livekit.PhoneNumberService/PurchasePhoneNumber', httpUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.generateToken()}`,
      },
      body: JSON.stringify({ phone_numbers: [phoneNumber] }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to purchase phone number: ${response.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Phone number purchase is not available on this LiveKit instance. Use the LiveKit Cloud Dashboard to buy numbers.');
    }
  }

  async listPhoneNumbers() {
    const httpUrl = this.livekitUrl.replace('wss://', 'https://');
    const url = new URL('/twirp/livekit.PhoneNumberService/ListPhoneNumbers', httpUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.generateToken()}`,
      },
      body: JSON.stringify({}),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to list phone numbers: ${response.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      // API not available on this instance - will fall back to trunk-based listing
      throw new Error('Phone number listing not available via REST API');
    }
  }

  async releasePhoneNumber(phoneNumberId: string) {
    const httpUrl = this.livekitUrl.replace('wss://', 'https://');
    const url = new URL('/twirp/livekit.PhoneNumberService/ReleasePhoneNumbers', httpUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.generateToken()}`,
      },
      body: JSON.stringify({ ids: [phoneNumberId] }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to release phone number: ${response.status} ${text}`);
    }

    return response.json();
  }

  // Generate a short-lived access token for REST API calls
  private async generateToken(): Promise<string> {
    const { AccessToken } = await import('livekit-server-sdk');
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      ttl: '1m',
    });
    token.addGrant({ roomAdmin: true, roomCreate: true, sipAdmin: true } as any);
    return await token.toJwt();
  }
}

// Singleton instance
export const livekitService = new LiveKitService();
