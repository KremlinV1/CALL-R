import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { aiProviderKeys } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { decryptApiKey } from '../utils/crypto.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

async function getApiKey(organizationId: string, provider: string): Promise<string | null> {
  const result = await db
    .select({ encryptedKey: aiProviderKeys.encryptedKey })
    .from(aiProviderKeys)
    .where(
      and(
        eq(aiProviderKeys.organizationId, organizationId),
        eq(aiProviderKeys.provider, provider as any),
        eq(aiProviderKeys.isConfigured, true)
      )
    )
    .limit(1);

  if (result.length === 0) return null;
  return decryptApiKey(result[0].encryptedKey);
}

const PREVIEW_TEXT = "Hi there! I'm your AI voice agent. How can I help you today?";

// POST /api/voice/preview - Generate voice preview audio
router.post('/preview', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { provider, voiceId, text, voiceSettings } = req.body;
    if (!provider || !voiceId) {
      return res.status(400).json({ error: 'provider and voiceId are required' });
    }

    const sampleText = text || PREVIEW_TEXT;
    const settings = voiceSettings || {};

    const apiKey = await getApiKey(organizationId, provider);
    if (!apiKey) {
      return res.status(400).json({ error: `${provider} API key not configured. Add it in Settings → API Keys.` });
    }

    switch (provider) {
      case 'cartesia': {
        // Build Cartesia request with speed and emotion controls
        const voiceObj: Record<string, any> = { mode: 'id', id: voiceId };

        // Build __experimental_controls for speed and emotion
        const controls: Record<string, any> = {};

        // Apply speed setting (map slider value to Cartesia speed enum)
        if (settings.speed && settings.speed !== 1.0) {
          controls.speed = settings.speed <= 0.7 ? 'slowest' : settings.speed <= 0.9 ? 'slow' : settings.speed >= 1.5 ? 'fastest' : settings.speed >= 1.2 ? 'fast' : 'normal';
        }

        // Apply emotion settings — map UI labels to Cartesia API emotion names
        if (settings.emotion && Array.isArray(settings.emotion) && settings.emotion.length > 0) {
          // Valid Cartesia emotions: positivity, negativity, anger, sadness, surprise, curiosity
          const emotionMap: Record<string, string> = {
            happy: 'positivity',
            sad: 'sadness',
            angry: 'anger',
            fearful: '', // not supported by Cartesia
            surprised: 'surprise',
            curious: 'curiosity',
            neutral: '', // skip neutral
          };
          const mapped = settings.emotion
            .map((e: string) => emotionMap[e] || e)
            .filter((e: string) => e.length > 0);
          if (mapped.length > 0) {
            controls.emotion = mapped.map((e: string) => `${e}:high`);
          }
        }

        // Only add controls if there are any
        if (Object.keys(controls).length > 0) {
          voiceObj.__experimental_controls = controls;
        }

        const cartesiaBody = {
          model_id: 'sonic-english',
          transcript: sampleText,
          voice: voiceObj,
          output_format: {
            container: 'mp3',
            bit_rate: 128000,
            sample_rate: 44100,
          },
        };

        console.log('📢 Cartesia TTS request:', JSON.stringify(cartesiaBody, null, 2));

        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Cartesia-Version': '2024-11-13',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cartesiaBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('Cartesia TTS error:', response.status, errText);
          return res.status(502).json({ error: `Cartesia API error: ${response.status}` });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', String(audioBuffer.length));
        return res.send(audioBuffer);
      }

      case 'elevenlabs': {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: sampleText,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: settings.stability ?? 0.5,
              similarity_boost: settings.similarityBoost ?? 0.75,
              style: settings.style ?? 0,
              use_speaker_boost: settings.speakerBoost ?? true,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('ElevenLabs TTS error:', response.status, errText);
          return res.status(502).json({ error: `ElevenLabs API error: ${response.status}` });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', String(audioBuffer.length));
        return res.send(audioBuffer);
      }

      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: sampleText,
            voice: voiceId,
            response_format: 'mp3',
            speed: settings.speed ?? 1.0,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('OpenAI TTS error:', response.status, errText);
          return res.status(502).json({ error: `OpenAI API error: ${response.status}` });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', String(audioBuffer.length));
        return res.send(audioBuffer);
      }

      default:
        return res.status(400).json({ error: `Unsupported voice provider: ${provider}` });
    }
  } catch (error) {
    console.error('Voice preview error:', error);
    res.status(500).json({ error: 'Failed to generate voice preview' });
  }
});

export default router;
