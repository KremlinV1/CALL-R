/**
 * Call Outcome Decision Engine
 * 
 * Analyzes call data to determine the appropriate outcome based on:
 * - Call status (completed, failed, voicemail, etc.)
 * - Call duration
 * - Transcript content and keywords
 * - Extracted data from the conversation
 * - Sentiment analysis
 */

export interface CallData {
  status: string;
  durationSeconds?: number;
  transcript?: string;
  summary?: string;
  sentiment?: string;
  extractedData?: Record<string, any>;
  metadata?: Record<string, any>;
}

export enum CallOutcome {
  // Positive outcomes
  APPOINTMENT_SCHEDULED = 'Appointment Scheduled',
  INTERESTED = 'Interested',
  SUCCESSFUL = 'Successful',
  CALLBACK_REQUESTED = 'Callback Requested',
  INFORMATION_PROVIDED = 'Information Provided',
  TRANSFER = 'Transfer',
  FOLLOW_UP = 'Follow Up',
  
  // Neutral outcomes
  NOT_INTERESTED = 'Not Interested',
  WRONG_NUMBER = 'Wrong Number',
  ALREADY_CUSTOMER = 'Already Customer',
  CALL_BACK_LATER = 'Call Back Later',
  
  // Negative outcomes
  NO_ANSWER = 'No Answer',
  VOICEMAIL = 'Voicemail',
  BUSY = 'Busy',
  FAILED = 'Failed',
  HUNG_UP = 'Hung Up',
  DO_NOT_CALL = 'Do Not Call',
  
  // Unknown
  UNKNOWN = 'Unknown',
}

export class OutcomeDecisionEngine {
  /**
   * Determine the call outcome based on available data
   */
  static determineOutcome(callData: CallData): string {
    // Priority 1: Check call status for technical failures
    const statusOutcome = this.checkCallStatus(callData.status);
    if (statusOutcome) {
      return statusOutcome;
    }

    // Priority 2: Check for explicit outcomes in extracted data
    if (callData.extractedData) {
      const extractedOutcome = this.checkExtractedData(callData.extractedData);
      if (extractedOutcome) {
        return extractedOutcome;
      }
    }

    // Priority 3: Analyze transcript for keywords and intent
    if (callData.transcript) {
      const transcriptOutcome = this.analyzeTranscript(
        callData.transcript,
        callData.durationSeconds,
        callData.sentiment
      );
      if (transcriptOutcome) {
        return transcriptOutcome;
      }
    }

    // Priority 4: Check summary for outcome indicators
    if (callData.summary) {
      const summaryOutcome = this.analyzeSummary(callData.summary);
      if (summaryOutcome) {
        return summaryOutcome;
      }
    }

    // Priority 5: Use duration and sentiment as fallback
    return this.fallbackOutcome(callData.durationSeconds, callData.sentiment, callData.status);
  }

  /**
   * Check call status for technical outcomes
   */
  private static checkCallStatus(status: string): string | null {
    const statusMap: Record<string, string> = {
      'failed': CallOutcome.FAILED,
      'voicemail': CallOutcome.VOICEMAIL,
      'busy': CallOutcome.BUSY,
      'no_answer': CallOutcome.NO_ANSWER,
    };

    return statusMap[status.toLowerCase()] || null;
  }

  /**
   * Check extracted data for explicit outcomes
   */
  private static checkExtractedData(extractedData: Record<string, any>): string | null {
    // Check for explicit outcome field
    if (extractedData.outcome) {
      return extractedData.outcome;
    }

    // Check for appointment data
    if (extractedData.appointment || extractedData.appointmentScheduled || extractedData.meetingBooked) {
      return CallOutcome.APPOINTMENT_SCHEDULED;
    }

    // Check for successful outcome indicators
    if (extractedData.successful || extractedData.success || extractedData.completed || extractedData.achieved) {
      return CallOutcome.SUCCESSFUL;
    }

    // Check for transfer
    if (extractedData.transferred || extractedData.transfer) {
      return CallOutcome.TRANSFER;
    }

    // Check for follow-up
    if (extractedData.followUp || extractedData.followUpScheduled) {
      return CallOutcome.FOLLOW_UP;
    }

    // Check for callback request
    if (extractedData.callbackRequested || extractedData.followUp) {
      return CallOutcome.CALLBACK_REQUESTED;
    }

    // Check for interest level
    if (extractedData.interested === true) {
      return CallOutcome.INTERESTED;
    }
    if (extractedData.interested === false || extractedData.notInterested === true) {
      return CallOutcome.NOT_INTERESTED;
    }

    // Check for DNC request
    if (extractedData.doNotCall || extractedData.removeFromList) {
      return CallOutcome.DO_NOT_CALL;
    }

    return null;
  }

  /**
   * Analyze transcript for keywords and patterns
   */
  private static analyzeTranscript(
    transcript: string,
    durationSeconds?: number,
    sentiment?: string
  ): string | null {
    const lowerTranscript = transcript.toLowerCase();

    // Check for appointment/scheduling keywords
    if (this.containsKeywords(lowerTranscript, [
      'schedule', 'appointment', 'book', 'meeting', 'calendar',
      'available', 'time slot', 'confirm', 'reservation'
    ])) {
      return CallOutcome.APPOINTMENT_SCHEDULED;
    }

    // Check for successful outcome keywords
    if (this.containsKeywords(lowerTranscript, [
      'successful', 'success', 'completed', 'achieved', 'accomplished',
      'done', 'finished', 'resolved', 'confirmed', 'agreed'
    ])) {
      return CallOutcome.SUCCESSFUL;
    }

    // Check for transfer keywords
    if (this.containsKeywords(lowerTranscript, [
      'transfer', 'transferring', 'connect you', 'put you through',
      'forward you', 'speak to someone', 'another department', 'supervisor'
    ])) {
      return CallOutcome.TRANSFER;
    }

    // Check for follow-up keywords
    if (this.containsKeywords(lowerTranscript, [
      'follow up', 'followup', 'touch base', 'check in',
      'reach out again', 'circle back', 'get back to you'
    ])) {
      return CallOutcome.FOLLOW_UP;
    }

    // Check for callback request
    if (this.containsKeywords(lowerTranscript, [
      'call back', 'callback', 'call me back', 'reach out later',
      'follow up', 'contact me', 'get back to'
    ])) {
      return CallOutcome.CALLBACK_REQUESTED;
    }

    // Check for interest indicators
    if (this.containsKeywords(lowerTranscript, [
      'interested', 'sounds good', 'tell me more', 'learn more',
      'information', 'details', 'curious', 'want to know'
    ]) && sentiment !== 'negative') {
      return CallOutcome.INTERESTED;
    }

    // Check for not interested
    if (this.containsKeywords(lowerTranscript, [
      'not interested', 'no thank', 'not right now', 'maybe later',
      'don\'t need', 'already have', 'not looking'
    ])) {
      return CallOutcome.NOT_INTERESTED;
    }

    // Check for wrong number
    if (this.containsKeywords(lowerTranscript, [
      'wrong number', 'who is this', 'don\'t know you',
      'never heard of', 'not the person'
    ])) {
      return CallOutcome.WRONG_NUMBER;
    }

    // Check for DNC request
    if (this.containsKeywords(lowerTranscript, [
      'do not call', 'don\'t call', 'remove from list', 'take me off',
      'stop calling', 'never call again', 'unsubscribe'
    ])) {
      return CallOutcome.DO_NOT_CALL;
    }

    // Check for hang up indicators (short call + negative sentiment)
    if (durationSeconds && durationSeconds < 30 && sentiment === 'negative') {
      return CallOutcome.HUNG_UP;
    }

    return null;
  }

  /**
   * Analyze summary for outcome indicators
   */
  private static analyzeSummary(summary: string): string | null {
    const lowerSummary = summary.toLowerCase();

    // Check summary for key outcome phrases
    if (lowerSummary.includes('appointment') || lowerSummary.includes('scheduled')) {
      return CallOutcome.APPOINTMENT_SCHEDULED;
    }

    if (lowerSummary.includes('successful') || lowerSummary.includes('success') || lowerSummary.includes('completed')) {
      return CallOutcome.SUCCESSFUL;
    }

    if (lowerSummary.includes('transfer') || lowerSummary.includes('transferred')) {
      return CallOutcome.TRANSFER;
    }

    if (lowerSummary.includes('follow up') || lowerSummary.includes('followup')) {
      return CallOutcome.FOLLOW_UP;
    }

    if (lowerSummary.includes('callback') || lowerSummary.includes('follow up')) {
      return CallOutcome.CALLBACK_REQUESTED;
    }

    if (lowerSummary.includes('interested')) {
      return CallOutcome.INTERESTED;
    }

    if (lowerSummary.includes('not interested') || lowerSummary.includes('declined')) {
      return CallOutcome.NOT_INTERESTED;
    }

    if (lowerSummary.includes('wrong number')) {
      return CallOutcome.WRONG_NUMBER;
    }

    if (lowerSummary.includes('do not call') || lowerSummary.includes('remove from list')) {
      return CallOutcome.DO_NOT_CALL;
    }

    return null;
  }

  /**
   * Fallback outcome based on duration and sentiment
   */
  private static fallbackOutcome(
    durationSeconds?: number,
    sentiment?: string,
    status?: string
  ): string {
    // If call completed but very short, likely hung up
    if (status === 'completed' && durationSeconds && durationSeconds < 15) {
      return CallOutcome.HUNG_UP;
    }

    // If call completed with good duration and positive sentiment
    if (status === 'completed' && durationSeconds && durationSeconds > 60) {
      if (sentiment === 'positive') {
        return CallOutcome.INTERESTED;
      }
      if (sentiment === 'neutral') {
        return CallOutcome.INFORMATION_PROVIDED;
      }
    }

    // If call completed with negative sentiment
    if (status === 'completed' && sentiment === 'negative') {
      return CallOutcome.NOT_INTERESTED;
    }

    // Default to unknown if we can't determine
    return CallOutcome.UNKNOWN;
  }

  /**
   * Helper to check if text contains any of the keywords
   */
  private static containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Get outcome category (positive, neutral, negative)
   */
  static getOutcomeCategory(outcome: string): 'positive' | 'neutral' | 'negative' {
    const positiveOutcomes = [
      CallOutcome.APPOINTMENT_SCHEDULED,
      CallOutcome.INTERESTED,
      CallOutcome.SUCCESSFUL,
      CallOutcome.CALLBACK_REQUESTED,
      CallOutcome.INFORMATION_PROVIDED,
      CallOutcome.TRANSFER,
      CallOutcome.FOLLOW_UP,
    ];

    const negativeOutcomes = [
      CallOutcome.NO_ANSWER,
      CallOutcome.VOICEMAIL,
      CallOutcome.BUSY,
      CallOutcome.FAILED,
      CallOutcome.HUNG_UP,
      CallOutcome.DO_NOT_CALL,
    ];

    if (positiveOutcomes.includes(outcome as CallOutcome)) {
      return 'positive';
    }
    if (negativeOutcomes.includes(outcome as CallOutcome)) {
      return 'negative';
    }
    return 'neutral';
  }

  /**
   * Get all possible outcomes
   */
  static getAllOutcomes(): string[] {
    return Object.values(CallOutcome);
  }
}
