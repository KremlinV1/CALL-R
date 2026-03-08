import OpenAI from 'openai';
import { db } from '../db';
import { calls } from '../db/schema';
import { eq } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface CallAnalysisResult {
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  outcome: string;
  qualityScore: number;
  extractedData: Record<string, any>;
}

/**
 * Analyze a completed call using GPT-4o.
 * Expects the call to have a transcript. If no transcript, returns a minimal result.
 */
export async function analyzeCall(callId: string): Promise<CallAnalysisResult | null> {
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);

  if (!call) {
    console.error(`[CallAnalysis] Call ${callId} not found`);
    return null;
  }

  if (!call.transcript || call.transcript.trim().length === 0) {
    console.log(`[CallAnalysis] Call ${callId} has no transcript, skipping analysis`);
    return null;
  }

  const systemPrompt = `You are an expert call analyst for an enterprise voice AI platform. 
Analyze the following phone call transcript and return a JSON object with these fields:

1. "summary" (string): A concise 2-3 sentence summary of what happened on the call.
2. "sentiment" (string): One of "positive", "negative", "neutral", or "mixed".
3. "outcome" (string): A short label for the call result, e.g. "appointment_set", "callback_requested", "not_interested", "voicemail_left", "sale_completed", "information_provided", "transferred", "no_answer", "hung_up", or a custom outcome.
4. "qualityScore" (number 1-10): Rate the overall quality of the AI agent's performance. Consider: did it follow the script, handle objections, maintain professionalism, achieve the goal?
5. "extractedData" (object): Extract any structured data mentioned: names, emails, phone numbers, dates, appointment times, addresses, company names, dollar amounts, or any other notable data points. Use descriptive keys.

Return ONLY valid JSON, no markdown fences, no explanation.`;

  const userPrompt = `Call Direction: ${call.direction}
From: ${call.fromNumber}
To: ${call.toNumber}
Duration: ${call.durationSeconds ? `${call.durationSeconds} seconds` : 'unknown'}
Status: ${call.status}

--- TRANSCRIPT ---
${call.transcript}
--- END TRANSCRIPT ---`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error(`[CallAnalysis] Empty response from OpenAI for call ${callId}`);
      return null;
    }

    const result: CallAnalysisResult = JSON.parse(content);

    // Clamp quality score
    result.qualityScore = Math.max(1, Math.min(10, Math.round(result.qualityScore)));

    // Normalize sentiment
    const validSentiments = ['positive', 'negative', 'neutral', 'mixed'];
    if (!validSentiments.includes(result.sentiment)) {
      result.sentiment = 'neutral';
    }

    // Save to database
    await db
      .update(calls)
      .set({
        summary: result.summary,
        sentiment: result.sentiment,
        outcome: result.outcome,
        qualityScore: result.qualityScore,
        extractedData: result.extractedData || {},
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    console.log(`[CallAnalysis] ✅ Call ${callId} analyzed: sentiment=${result.sentiment}, score=${result.qualityScore}, outcome=${result.outcome}`);
    return result;
  } catch (error: any) {
    console.error(`[CallAnalysis] ❌ Failed to analyze call ${callId}:`, error.message);
    return null;
  }
}

/**
 * Batch analyze all completed calls that don't have a summary yet.
 */
export async function analyzeUnprocessedCalls(): Promise<number> {
  const { and, isNull, isNotNull, inArray } = await import('drizzle-orm');

  const unprocessed = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        isNull(calls.summary),
        isNotNull(calls.transcript),
        inArray(calls.status, ['completed', 'ended'])
      )
    )
    .limit(50);

  console.log(`[CallAnalysis] Found ${unprocessed.length} unprocessed calls`);

  let analyzed = 0;
  for (const call of unprocessed) {
    const result = await analyzeCall(call.id);
    if (result) analyzed++;
    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  return analyzed;
}
