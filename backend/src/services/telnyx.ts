import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

export interface TelnyxCallOptions {
  to: string;
  from: string;
  connectionId: string;
  webhookUrl?: string;
  webhookUrlMethod?: 'POST' | 'GET';
  answeringMachineDetection?: 'detect' | 'detect_beep' | 'detect_words' | 'greeting_end' | 'disabled';
  clientState?: string;
  commandId?: string;
  customHeaders?: Array<{ name: string; value: string }>;
  sipAuthUsername?: string;
  sipAuthPassword?: string;
  timeout?: number;
}

export interface TelnyxCall {
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  is_alive: boolean;
  record_type: string;
}

export interface TelnyxSpeakOptions {
  callControlId: string;
  payload: string;
  voice: string;
  language?: string;
  payloadType?: 'text' | 'ssml';
  clientState?: string;
  commandId?: string;
}

export interface TelnyxTransferOptions {
  callControlId: string;
  to: string;
  from?: string;
  audioUrl?: string;
  clientState?: string;
  commandId?: string;
  sipAuthUsername?: string;
  sipAuthPassword?: string;
  timeout?: number;
  webhookUrl?: string;
}

export interface TelnyxDtmfOptions {
  callControlId: string;
  digits: string;
  durationMillis?: number;
  clientState?: string;
  commandId?: string;
}

export class TelnyxService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: TELNYX_API_BASE,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Create an outbound call
   */
  async createCall(options: TelnyxCallOptions): Promise<TelnyxCall> {
    const payload: Record<string, any> = {
      to: options.to,
      from: options.from,
      connection_id: options.connectionId,
    };

    if (options.webhookUrl) payload.webhook_url = options.webhookUrl;
    if (options.webhookUrlMethod) payload.webhook_url_method = options.webhookUrlMethod;
    if (options.answeringMachineDetection) payload.answering_machine_detection = options.answeringMachineDetection;
    if (options.clientState) payload.client_state = Buffer.from(options.clientState).toString('base64');
    if (options.commandId) payload.command_id = options.commandId;
    if (options.customHeaders) payload.custom_headers = options.customHeaders;
    if (options.sipAuthUsername) payload.sip_auth_username = options.sipAuthUsername;
    if (options.sipAuthPassword) payload.sip_auth_password = options.sipAuthPassword;
    if (options.timeout) payload.timeout_secs = options.timeout;

    const response = await this.client.post('/calls', payload);
    return response.data.data;
  }

  /**
   * Answer an incoming call
   */
  async answerCall(callControlId: string, clientState?: string, commandId?: string): Promise<void> {
    const payload: Record<string, any> = {};
    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/answer`, payload);
  }

  /**
   * Hang up a call
   */
  async hangupCall(callControlId: string, clientState?: string, commandId?: string): Promise<void> {
    const payload: Record<string, any> = {};
    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/hangup`, payload);
  }

  /**
   * Speak text on a call (TTS)
   */
  async speak(options: TelnyxSpeakOptions): Promise<void> {
    const payload: Record<string, any> = {
      payload: options.payload,
      voice: options.voice,
      payload_type: options.payloadType || 'text',
    };

    if (options.language) payload.language = options.language;
    if (options.clientState) payload.client_state = Buffer.from(options.clientState).toString('base64');
    if (options.commandId) payload.command_id = options.commandId;

    await this.client.post(`/calls/${options.callControlId}/actions/speak`, payload);
  }

  /**
   * Play audio file on a call
   */
  async playAudio(callControlId: string, audioUrl: string, clientState?: string, commandId?: string): Promise<void> {
    const payload: Record<string, any> = {
      audio_url: audioUrl,
    };

    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/playback_start`, payload);
  }

  /**
   * Stop audio playback
   */
  async stopAudio(callControlId: string, clientState?: string, commandId?: string): Promise<void> {
    const payload: Record<string, any> = {};
    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/playback_stop`, payload);
  }

  /**
   * Transfer a call to another destination
   */
  async transferCall(options: TelnyxTransferOptions): Promise<void> {
    const payload: Record<string, any> = {
      to: options.to,
    };

    if (options.from) payload.from = options.from;
    if (options.audioUrl) payload.audio_url = options.audioUrl;
    if (options.clientState) payload.client_state = Buffer.from(options.clientState).toString('base64');
    if (options.commandId) payload.command_id = options.commandId;
    if (options.sipAuthUsername) payload.sip_auth_username = options.sipAuthUsername;
    if (options.sipAuthPassword) payload.sip_auth_password = options.sipAuthPassword;
    if (options.timeout) payload.timeout_secs = options.timeout;
    if (options.webhookUrl) payload.webhook_url = options.webhookUrl;

    await this.client.post(`/calls/${options.callControlId}/actions/transfer`, payload);
  }

  /**
   * Send DTMF tones
   */
  async sendDtmf(options: TelnyxDtmfOptions): Promise<void> {
    const payload: Record<string, any> = {
      digits: options.digits,
    };

    if (options.durationMillis) payload.duration_millis = options.durationMillis;
    if (options.clientState) payload.client_state = Buffer.from(options.clientState).toString('base64');
    if (options.commandId) payload.command_id = options.commandId;

    await this.client.post(`/calls/${options.callControlId}/actions/send_dtmf`, payload);
  }

  /**
   * Start call recording
   */
  async startRecording(
    callControlId: string,
    channels: 'single' | 'dual' = 'single',
    format: 'wav' | 'mp3' = 'mp3',
    clientState?: string,
    commandId?: string
  ): Promise<void> {
    const payload: Record<string, any> = {
      channels,
      format,
    };

    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/record_start`, payload);
  }

  /**
   * Stop call recording
   */
  async stopRecording(callControlId: string, clientState?: string, commandId?: string): Promise<void> {
    const payload: Record<string, any> = {};
    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/record_stop`, payload);
  }

  /**
   * Gather DTMF input from caller
   */
  async gatherDtmf(
    callControlId: string,
    options: {
      minimumDigits?: number;
      maximumDigits?: number;
      timeoutMillis?: number;
      interDigitTimeoutMillis?: number;
      terminatingDigit?: string;
      validDigits?: string;
      clientState?: string;
      commandId?: string;
    } = {}
  ): Promise<void> {
    const payload: Record<string, any> = {};

    if (options.minimumDigits) payload.minimum_digits = options.minimumDigits;
    if (options.maximumDigits) payload.maximum_digits = options.maximumDigits;
    if (options.timeoutMillis) payload.timeout_millis = options.timeoutMillis;
    if (options.interDigitTimeoutMillis) payload.inter_digit_timeout_millis = options.interDigitTimeoutMillis;
    if (options.terminatingDigit) payload.terminating_digit = options.terminatingDigit;
    if (options.validDigits) payload.valid_digits = options.validDigits;
    if (options.clientState) payload.client_state = Buffer.from(options.clientState).toString('base64');
    if (options.commandId) payload.command_id = options.commandId;

    await this.client.post(`/calls/${callControlId}/actions/gather`, payload);
  }

  /**
   * Bridge two calls together
   */
  async bridgeCalls(
    callControlId: string,
    targetCallControlId: string,
    clientState?: string,
    commandId?: string
  ): Promise<void> {
    const payload: Record<string, any> = {
      call_control_id: targetCallControlId,
    };

    if (clientState) payload.client_state = Buffer.from(clientState).toString('base64');
    if (commandId) payload.command_id = commandId;

    await this.client.post(`/calls/${callControlId}/actions/bridge`, payload);
  }

  /**
   * Get call details
   */
  async getCall(callControlId: string): Promise<any> {
    const response = await this.client.get(`/calls/${callControlId}`);
    return response.data.data;
  }

  /**
   * List phone numbers
   */
  async listPhoneNumbers(options: { pageSize?: number; pageNumber?: number } = {}): Promise<any> {
    const params: Record<string, any> = {};
    if (options.pageSize) params['page[size]'] = options.pageSize;
    if (options.pageNumber) params['page[number]'] = options.pageNumber;

    const response = await this.client.get('/phone_numbers', { params });
    return response.data;
  }

  /**
   * Search available phone numbers
   */
  async searchPhoneNumbers(options: {
    countryCode?: string;
    areaCode?: string;
    contains?: string;
    limit?: number;
  } = {}): Promise<any> {
    const params: Record<string, any> = {};
    if (options.countryCode) params['filter[country_code]'] = options.countryCode;
    if (options.areaCode) params['filter[national_destination_code]'] = options.areaCode;
    if (options.contains) params['filter[phone_number][contains]'] = options.contains;
    if (options.limit) params['page[size]'] = options.limit;

    const response = await this.client.get('/available_phone_numbers', { params });
    return response.data;
  }

  /**
   * Order a phone number
   */
  async orderPhoneNumber(phoneNumber: string, connectionId: string): Promise<any> {
    const response = await this.client.post('/number_orders', {
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: connectionId,
    });
    return response.data;
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string,
    publicKey: string
  ): boolean {
    try {
      const signedPayload = `${timestamp}|${payload}`;
      const verify = crypto.createVerify('SHA256');
      verify.update(signedPayload);
      return verify.verify(publicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  /**
   * Parse client state from webhook
   */
  static parseClientState(encodedState: string): string {
    try {
      return Buffer.from(encodedState, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }
}

// Factory function to create TelnyxService instance
export function createTelnyxService(apiKey: string): TelnyxService {
  return new TelnyxService(apiKey);
}
