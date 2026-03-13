import axios, { AxiosInstance } from 'axios';

const DIDWW_API_BASE = process.env.DIDWW_API_BASE || 'https://api.didww.com/v3';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface DIDWWVoiceInTrunkConfig {
  name: string;
  priority?: number;
  weight?: number;
  capacityLimit?: number;
  ringingTimeout?: number;
  cliFormat?: 'raw' | 'e164' | 'local';
  cliPrefix?: string;
  description?: string;
  configuration: {
    type: 'sip_configurations';
    attributes: {
      username: string;
      host: string;
      port?: number;
      transportProtocolId?: number; // 1=UDP, 2=TCP, 3=TLS
      authEnabled?: boolean;
      authUser?: string;
      authPassword?: string;
      authFromUser?: string;
      authFromDomain?: string;
      codecIds?: number[];
      rxDtmfFormatId?: number;
      txDtmfFormatId?: number;
      resolveRuri?: boolean;
      rtpPing?: boolean;
      rtpTimeout?: number;
      forceSymmetricRtp?: boolean;
      mediaEncryptionMode?: 'disabled' | 'srtp_sdes' | 'srtp_dtls' | 'zrtp';
      stirShakenMode?: 'disabled' | 'original' | 'pai' | 'original_pai' | 'verstat';
    };
  };
}

export interface DIDWWVoiceOutTrunkConfig {
  name: string;
  allowedSipIps: string[];
  allowedRtpIps?: string[];
  onCliMismatchAction: 'send_original_cli' | 'reject_call';
  allowAnyDidAsCli?: boolean;
  capacityLimit?: number;
  status?: 'active' | 'blocked';
  thresholdAmount?: string;
  defaultDstAction?: 'allow_all' | 'reject_all';
  dstPrefixes?: string[];
  mediaEncryptionMode?: 'disabled' | 'srtp_sdes' | 'srtp_dtls' | 'zrtp';
  forceSymmetricRtp?: boolean;
  rtpPing?: boolean;
  callbackUrl?: string;
}

export interface DIDWWOrderItem {
  type: 'did_order_items';
  attributes: {
    qty: number;
    sku_id?: string;
  };
  relationships: {
    did_group: { data: { type: 'did_groups'; id: string } };
  };
}

// ─── Service Class ───────────────────────────────────────────────────

export class DIDWWService {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: DIDWW_API_BASE,
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
      },
    });
  }

  // ─── Account ─────────────────────────────────────────────────────

  async getBalance(): Promise<any> {
    const res = await this.client.get('/balance');
    return res.data;
  }

  // ─── DID Numbers ─────────────────────────────────────────────────

  async listDIDs(params?: { pageSize?: number; pageNumber?: number }): Promise<any> {
    const queryParams: Record<string, any> = {};
    if (params?.pageSize) queryParams['page[size]'] = params.pageSize;
    if (params?.pageNumber) queryParams['page[number]'] = params.pageNumber;

    const res = await this.client.get('/dids', { params: queryParams });
    return res.data;
  }

  async getDID(id: string): Promise<any> {
    const res = await this.client.get(`/dids/${id}`);
    return res.data;
  }

  async updateDID(id: string, attributes: Record<string, any>, relationships?: Record<string, any>): Promise<any> {
    const payload: any = {
      data: {
        id,
        type: 'dids',
        attributes,
      },
    };
    if (relationships) payload.data.relationships = relationships;

    const res = await this.client.patch(`/dids/${id}`, payload);
    return res.data;
  }

  // ─── Available DIDs / Search ─────────────────────────────────────

  async searchAvailableDIDs(params: {
    didGroupId?: string;
    countryId?: string;
    cityId?: string;
    areaCode?: string;
    contains?: string;
    pageSize?: number;
  } = {}): Promise<any> {
    const queryParams: Record<string, any> = {};
    if (params.didGroupId) queryParams['filter[did_group.id]'] = params.didGroupId;
    if (params.countryId) queryParams['filter[did_group.country.id]'] = params.countryId;
    if (params.cityId) queryParams['filter[did_group.city.id]'] = params.cityId;
    if (params.pageSize) queryParams['page[size]'] = params.pageSize;

    const res = await this.client.get('/available_dids', { params: queryParams });
    return res.data;
  }

  // ─── DID Groups (coverage/inventory) ─────────────────────────────

  async listDIDGroups(params: {
    countryId?: string;
    cityId?: string;
    didGroupTypeId?: string;
    areaCode?: string;
    prefix?: string;
    pageSize?: number;
  } = {}): Promise<any> {
    const queryParams: Record<string, any> = {};
    if (params.countryId) queryParams['filter[country.id]'] = params.countryId;
    if (params.cityId) queryParams['filter[city.id]'] = params.cityId;
    if (params.didGroupTypeId) queryParams['filter[did_group_type.id]'] = params.didGroupTypeId;
    if (params.areaCode) queryParams['filter[area_code]'] = params.areaCode;
    if (params.prefix) queryParams['filter[prefix]'] = params.prefix;
    if (params.pageSize) queryParams['page[size]'] = params.pageSize;

    const res = await this.client.get('/did_groups', { params: queryParams });
    return res.data;
  }

  // ─── Countries ───────────────────────────────────────────────────

  async listCountries(): Promise<any> {
    const res = await this.client.get('/countries');
    return res.data;
  }

  // ─── Orders ──────────────────────────────────────────────────────

  async createOrder(items: DIDWWOrderItem[]): Promise<any> {
    const payload = {
      data: {
        type: 'orders',
        attributes: {
          allow_back_ordering: false,
        },
        relationships: {
          items: {
            data: items,
          },
        },
      },
    };

    const res = await this.client.post('/orders', payload);
    return res.data;
  }

  async listOrders(params?: { pageSize?: number }): Promise<any> {
    const queryParams: Record<string, any> = {};
    if (params?.pageSize) queryParams['page[size]'] = params.pageSize;

    const res = await this.client.get('/orders', { params: queryParams });
    return res.data;
  }

  // ─── Voice IN Trunks (Inbound) ──────────────────────────────────

  async listVoiceInTrunks(): Promise<any> {
    const res = await this.client.get('/voice_in_trunks');
    return res.data;
  }

  async getVoiceInTrunk(id: string): Promise<any> {
    const res = await this.client.get(`/voice_in_trunks/${id}`);
    return res.data;
  }

  async createVoiceInTrunk(config: DIDWWVoiceInTrunkConfig): Promise<any> {
    const payload = {
      data: {
        type: 'voice_in_trunks',
        attributes: {
          name: config.name,
          priority: config.priority || 1,
          weight: config.weight || 1,
          capacity_limit: config.capacityLimit || 10,
          ringing_timeout: config.ringingTimeout || 30,
          cli_format: config.cliFormat || 'e164',
          cli_prefix: config.cliPrefix || '',
          description: config.description || '',
          configuration: {
            type: config.configuration.type,
            attributes: {
              username: config.configuration.attributes.username,
              host: config.configuration.attributes.host,
              port: config.configuration.attributes.port || 5060,
              transport_protocol_id: config.configuration.attributes.transportProtocolId || 1,
              auth_enabled: config.configuration.attributes.authEnabled || false,
              auth_user: config.configuration.attributes.authUser || '',
              auth_password: config.configuration.attributes.authPassword || '',
              auth_from_user: config.configuration.attributes.authFromUser || '',
              auth_from_domain: config.configuration.attributes.authFromDomain || '',
              codec_ids: config.configuration.attributes.codecIds || [9, 7],
              rx_dtmf_format_id: config.configuration.attributes.rxDtmfFormatId || 1,
              tx_dtmf_format_id: config.configuration.attributes.txDtmfFormatId || 1,
              resolve_ruri: config.configuration.attributes.resolveRuri ?? true,
              rtp_ping: config.configuration.attributes.rtpPing || false,
              rtp_timeout: config.configuration.attributes.rtpTimeout || 30,
              force_symmetric_rtp: config.configuration.attributes.forceSymmetricRtp || false,
              media_encryption_mode: config.configuration.attributes.mediaEncryptionMode || 'disabled',
              stir_shaken_mode: config.configuration.attributes.stirShakenMode || 'disabled',
            },
          },
        },
      },
    };

    const res = await this.client.post('/voice_in_trunks', payload);
    return res.data;
  }

  async updateVoiceInTrunk(id: string, attributes: Record<string, any>): Promise<any> {
    const payload = {
      data: {
        id,
        type: 'voice_in_trunks',
        attributes,
      },
    };

    const res = await this.client.patch(`/voice_in_trunks/${id}`, payload);
    return res.data;
  }

  async deleteVoiceInTrunk(id: string): Promise<void> {
    await this.client.delete(`/voice_in_trunks/${id}`);
  }

  // ─── Voice OUT Trunks (Outbound) ────────────────────────────────

  async listVoiceOutTrunks(): Promise<any> {
    const res = await this.client.get('/voice_out_trunks');
    return res.data;
  }

  async getVoiceOutTrunk(id: string): Promise<any> {
    const res = await this.client.get(`/voice_out_trunks/${id}`);
    return res.data;
  }

  async createVoiceOutTrunk(config: DIDWWVoiceOutTrunkConfig): Promise<any> {
    const payload = {
      data: {
        type: 'voice_out_trunks',
        attributes: {
          name: config.name,
          allowed_sip_ips: config.allowedSipIps,
          allowed_rtp_ips: config.allowedRtpIps || null,
          on_cli_mismatch_action: config.onCliMismatchAction,
          allow_any_did_as_cli: config.allowAnyDidAsCli ?? true,
          capacity_limit: config.capacityLimit || 100,
          status: config.status || 'active',
          threshold_amount: config.thresholdAmount || '1000.0',
          default_dst_action: config.defaultDstAction || 'allow_all',
          dst_prefixes: config.dstPrefixes || [],
          media_encryption_mode: config.mediaEncryptionMode || 'disabled',
          force_symmetric_rtp: config.forceSymmetricRtp || false,
          rtp_ping: config.rtpPing || false,
          callback_url: config.callbackUrl || null,
        },
      },
    };

    const res = await this.client.post('/voice_out_trunks', payload);
    return res.data;
  }

  async updateVoiceOutTrunk(id: string, attributes: Record<string, any>): Promise<any> {
    const payload = {
      data: {
        id,
        type: 'voice_out_trunks',
        attributes,
      },
    };

    const res = await this.client.patch(`/voice_out_trunks/${id}`, payload);
    return res.data;
  }

  async deleteVoiceOutTrunk(id: string): Promise<void> {
    await this.client.delete(`/voice_out_trunks/${id}`);
  }

  // ─── Voice IN Trunk Groups ──────────────────────────────────────

  async listVoiceInTrunkGroups(): Promise<any> {
    const res = await this.client.get('/voice_in_trunk_groups');
    return res.data;
  }

  async createVoiceInTrunkGroup(name: string, trunkIds: string[]): Promise<any> {
    const payload = {
      data: {
        type: 'voice_in_trunk_groups',
        attributes: { name },
        relationships: {
          voice_in_trunks: {
            data: trunkIds.map((id) => ({ type: 'voice_in_trunks', id })),
          },
        },
      },
    };

    const res = await this.client.post('/voice_in_trunk_groups', payload);
    return res.data;
  }

  // ─── Assign trunk to DID ────────────────────────────────────────

  async assignTrunkToDID(didId: string, trunkId: string, trunkType: 'voice_in_trunks' | 'voice_in_trunk_groups'): Promise<any> {
    const relationshipKey = trunkType === 'voice_in_trunks' ? 'voice_in_trunk' : 'voice_in_trunk_group';
    const payload = {
      data: {
        id: didId,
        type: 'dids',
        relationships: {
          [relationshipKey]: {
            data: { type: trunkType, id: trunkId },
          },
        },
      },
    };

    const res = await this.client.patch(`/dids/${didId}`, payload);
    return res.data;
  }

  async unassignTrunkFromDID(didId: string): Promise<any> {
    const payload = {
      data: {
        id: didId,
        type: 'dids',
        relationships: {
          voice_in_trunk: { data: null },
          voice_in_trunk_group: { data: null },
        },
      },
    };

    const res = await this.client.patch(`/dids/${didId}`, payload);
    return res.data;
  }
}

// Factory
export function createDIDWWService(apiKey?: string): DIDWWService {
  const key = apiKey || process.env.DIDWW_API_KEY || '';
  if (!key) throw new Error('DIDWW API key not configured');
  return new DIDWWService(key);
}
