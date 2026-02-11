import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { livekitService } from '../services/livekit.js';

const router = Router();

// ── Health / Status ───────────────────────────────────────────────────

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const configured = livekitService.isConfigured();
    if (!configured) {
      return res.json({ configured: false, message: 'LiveKit credentials not configured' });
    }

    // Quick connectivity check
    const inbound = await livekitService.listInboundTrunks();
    const outbound = await livekitService.listOutboundTrunks();

    res.json({
      configured: true,
      url: process.env.LIVEKIT_URL,
      inboundTrunks: inbound.length,
      outboundTrunks: outbound.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Inbound Trunks ────────────────────────────────────────────────────

router.get('/trunks/inbound', async (req: AuthRequest, res: Response) => {
  try {
    const trunks = await livekitService.listInboundTrunks();
    res.json({ trunks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trunks/inbound', async (req: AuthRequest, res: Response) => {
  try {
    const { name, numbers, allowedAddresses, allowedNumbers } = req.body;
    if (!name || !numbers?.length) {
      return res.status(400).json({ error: 'name and numbers are required' });
    }
    const trunk = await livekitService.createInboundTrunk({ name, numbers, allowedAddresses, allowedNumbers });
    res.json({ trunk });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/trunks/inbound/:trunkId', async (req: AuthRequest, res: Response) => {
  try {
    const trunk = await livekitService.updateInboundTrunk(req.params.trunkId, req.body);
    res.json({ trunk });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/trunks/inbound/:trunkId', async (req: AuthRequest, res: Response) => {
  try {
    await livekitService.deleteInboundTrunk(req.params.trunkId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Outbound Trunks ───────────────────────────────────────────────────

router.get('/trunks/outbound', async (req: AuthRequest, res: Response) => {
  try {
    const trunks = await livekitService.listOutboundTrunks();
    res.json({ trunks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trunks/outbound', async (req: AuthRequest, res: Response) => {
  try {
    const { name, address, numbers, authUsername, authPassword, transport } = req.body;
    if (!name || !address || !numbers?.length) {
      return res.status(400).json({ error: 'name, address, and numbers are required' });
    }
    const trunk = await livekitService.createOutboundTrunk({
      name, address, numbers, authUsername, authPassword, transport,
    });
    res.json({ trunk });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/trunks/outbound/:trunkId', async (req: AuthRequest, res: Response) => {
  try {
    const trunk = await livekitService.updateOutboundTrunk(req.params.trunkId, req.body);
    res.json({ trunk });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/trunks/outbound/:trunkId', async (req: AuthRequest, res: Response) => {
  try {
    await livekitService.deleteOutboundTrunk(req.params.trunkId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Dispatch Rules ────────────────────────────────────────────────────

router.get('/dispatch-rules', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await livekitService.listDispatchRules();
    res.json({ rules });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dispatch-rules', async (req: AuthRequest, res: Response) => {
  try {
    const { name, trunkIds, roomPrefix, roomName, pin, agentName } = req.body;
    if (!name || !trunkIds?.length) {
      return res.status(400).json({ error: 'name and trunkIds are required' });
    }
    const rule = await livekitService.createDispatchRule({
      name, trunkIds, roomPrefix, roomName, pin, agentName,
    });
    res.json({ rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/dispatch-rules/:ruleId', async (req: AuthRequest, res: Response) => {
  try {
    const rule = await livekitService.updateDispatchRule(req.params.ruleId, req.body);
    res.json({ rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/dispatch-rules/:ruleId', async (req: AuthRequest, res: Response) => {
  try {
    await livekitService.deleteDispatchRule(req.params.ruleId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Phone Numbers (LiveKit-managed) ───────────────────────────────────

router.get('/phone-numbers', async (req: AuthRequest, res: Response) => {
  try {
    const result = await livekitService.listPhoneNumbers();
    res.json(result);
  } catch (error: any) {
    // If the API isn't available, fall back to listing numbers from trunks
    try {
      const inbound = await livekitService.listInboundTrunks();
      const outbound = await livekitService.listOutboundTrunks();
      const numbers: any[] = [];

      inbound.forEach((trunk: any) => {
        (trunk.numbers || []).forEach((num: string) => {
          numbers.push({
            number: num,
            type: 'inbound',
            trunkId: trunk.sipTrunkId,
            trunkName: trunk.name,
          });
        });
      });

      outbound.forEach((trunk: any) => {
        (trunk.numbers || []).forEach((num: string) => {
          numbers.push({
            number: num,
            type: 'outbound',
            trunkId: trunk.sipTrunkId,
            trunkName: trunk.name,
          });
        });
      });

      res.json({ numbers, source: 'trunks' });
    } catch (fallbackError: any) {
      res.status(500).json({ error: fallbackError.message });
    }
  }
});

router.get('/phone-numbers/search', async (req: AuthRequest, res: Response) => {
  try {
    const { countryCode, areaCode, limit } = req.query;
    if (!countryCode) {
      return res.status(400).json({ error: 'countryCode query parameter is required' });
    }
    const result = await livekitService.searchPhoneNumbers(
      countryCode as string,
      areaCode as string | undefined,
      limit ? parseInt(limit as string) : undefined,
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/phone-numbers/purchase', async (req: AuthRequest, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }
    const result = await livekitService.purchasePhoneNumber(phoneNumber);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/phone-numbers/:phoneNumberId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await livekitService.releasePhoneNumber(req.params.phoneNumberId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Calls ─────────────────────────────────────────────────────────────

router.post('/calls/outbound', async (req: AuthRequest, res: Response) => {
  try {
    const {
      sipTrunkId,
      phoneNumber,
      roomName,
      participantIdentity,
      participantName,
      fromNumber,
      playRingtone,
      agentName,
      metadata,
    } = req.body;

    if (!phoneNumber || !roomName) {
      return res.status(400).json({ error: 'phoneNumber and roomName are required' });
    }

    const trunkId = sipTrunkId || process.env.LIVEKIT_SIP_TRUNK_OUTBOUND;
    if (!trunkId) {
      return res.status(400).json({ error: 'No outbound trunk configured. Provide sipTrunkId or set LIVEKIT_SIP_TRUNK_OUTBOUND.' });
    }

    const participant = await livekitService.createOutboundCall({
      sipTrunkId: trunkId,
      phoneNumber,
      roomName: roomName || `call-${Date.now()}`,
      participantIdentity: participantIdentity || `sip-${Date.now()}`,
      participantName,
      fromNumber,
      playRingtone,
      agentName,
      metadata,
    });

    res.json({ success: true, participant });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/calls/transfer', async (req: AuthRequest, res: Response) => {
  try {
    const { roomName, participantIdentity, transferTo, playDialtone } = req.body;
    if (!roomName || !participantIdentity || !transferTo) {
      return res.status(400).json({ error: 'roomName, participantIdentity, and transferTo are required' });
    }

    await livekitService.transferCall({ roomName, participantIdentity, transferTo, playDialtone });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Rooms ─────────────────────────────────────────────────────────────

router.get('/rooms', async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await livekitService.listRooms();
    res.json({ rooms });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rooms/:roomName/participants', async (req: AuthRequest, res: Response) => {
  try {
    const participants = await livekitService.listParticipants(req.params.roomName);
    res.json({ participants });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/rooms/:roomName/participants/:identity', async (req: AuthRequest, res: Response) => {
  try {
    await livekitService.removeParticipant(req.params.roomName, req.params.identity);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
