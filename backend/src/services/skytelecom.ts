import axios, { AxiosInstance } from 'axios';

const SKYTELECOM_API_BASE = 'https://api.skytelecom.io/v1';

export interface SkyTelecomSmsOptions {
  to: string;
  from?: string;
  text: string;
}

export interface SkyTelecomSmsResult {
  id: string;
  status: string;
  to: string;
  from: string;
  text: string;
  cost?: number;
  createdAt?: string;
}

export interface SkyTelecomBalance {
  balance: number;
  currency: string;
}

export interface SkyTelecomCdr {
  id: string;
  from: string;
  to: string;
  status: string;
  duration: number;
  cost: number;
  startedAt: string;
  endedAt: string;
}

export class SkyTelecomService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: SKYTELECOM_API_BASE,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });
  }

  async sendSms(options: SkyTelecomSmsOptions): Promise<SkyTelecomSmsResult> {
    const payload: Record<string, any> = {
      to: options.to,
      text: options.text,
    };
    if (options.from) {
      payload.from = options.from;
    }

    const res = await this.client.post('/sms/send', payload);
    return res.data;
  }

  async getBalance(): Promise<SkyTelecomBalance> {
    const res = await this.client.get('/account/balance');
    return res.data;
  }

  async getCdrs(limit: number = 50, offset: number = 0): Promise<SkyTelecomCdr[]> {
    const res = await this.client.get('/cdrs', {
      params: { limit, offset },
    });
    return res.data?.data || res.data || [];
  }

  async getSmsStatus(messageId: string): Promise<SkyTelecomSmsResult> {
    const res = await this.client.get(`/sms/${messageId}`);
    return res.data;
  }
}

let cachedService: SkyTelecomService | null = null;

export function getSkyTelecomService(apiKey?: string): SkyTelecomService {
  const key = apiKey || process.env.SKYTELECOM_API_KEY;
  if (!key) {
    throw new Error('SkyTelecom API key not configured');
  }
  if (!cachedService || key !== (cachedService as any).apiKey) {
    cachedService = new SkyTelecomService(key);
  }
  return cachedService;
}
