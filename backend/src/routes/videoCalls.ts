import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const router = Router();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// In-memory store for customer join tokens (roomName -> { token, expiresAt, customerName })
// In production, use Redis or DB for multi-instance deployments
const customerTokens = new Map<
  string,
  { roomName: string; customerName: string; expiresAt: number }
>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of customerTokens.entries()) {
    if (data.expiresAt < now) customerTokens.delete(token);
  }
}, 5 * 60 * 1000);

function getRoomService() {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials not configured');
  }
  return new RoomServiceClient(
    LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://'),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
}

// POST /api/video-calls/create
// Create a new video call room, return agent token + customer join URL
router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({
        error: 'LiveKit not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.',
      });
    }

    const { customerName, customerPhone, agentDisplayName, enableFaceSwap } = req.body;

    if (!customerName) {
      return res.status(400).json({ error: 'customerName is required' });
    }

    // Create a unique room name
    const roomName = `video-${crypto.randomUUID().slice(0, 12)}`;

    // Create the room on LiveKit
    try {
      const roomService = getRoomService();
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60, // Close after 10 minutes of empty room
        maxParticipants: 10,
        metadata: JSON.stringify({
          organizationId,
          createdBy: userId,
          customerName,
          customerPhone,
          enableFaceSwap: !!enableFaceSwap,
        }),
      });
    } catch (e) {
      console.error('Failed to create LiveKit room:', e);
      // Room may still work if auto-created on join, continue
    }

    // Generate agent token
    // Use the "agent-video-" prefix so the face swap agent picks it up
    const agentIdentity = `agent-video-${userId}`;
    const agentToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: agentIdentity,
      name: agentDisplayName || 'Agent',
      ttl: '2h',
    });
    agentToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const agentJwt = await agentToken.toJwt();

    // Generate customer join token (opaque, used to fetch LiveKit token later)
    const customerJoinToken = crypto.randomBytes(24).toString('hex');
    customerTokens.set(customerJoinToken, {
      roomName,
      customerName,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    });

    const customerJoinUrl = `${FRONTEND_URL}/video-join/${customerJoinToken}`;

    res.json({
      roomName,
      livekitUrl: LIVEKIT_URL,
      agentToken: agentJwt,
      agentIdentity,
      customerJoinUrl,
      customerJoinToken,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    });
  } catch (error: any) {
    console.error('Error creating video call:', error);
    res.status(500).json({ error: error.message || 'Failed to create video call' });
  }
});

// GET /api/video-calls/customer/:joinToken
// Public endpoint: validates a customer join token and returns a LiveKit token
router.get('/customer/:joinToken', async (req: Request, res: Response) => {
  try {
    const { joinToken } = req.params;
    const data = customerTokens.get(joinToken);

    if (!data) {
      return res.status(404).json({ error: 'Invalid or expired join link' });
    }

    if (data.expiresAt < Date.now()) {
      customerTokens.delete(joinToken);
      return res.status(410).json({ error: 'Join link has expired' });
    }

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({ error: 'LiveKit not configured' });
    }

    // Generate customer token
    const customerIdentity = `customer-${crypto.randomUUID().slice(0, 8)}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: customerIdentity,
      name: data.customerName,
      ttl: '2h',
    });
    token.addGrant({
      roomJoin: true,
      room: data.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await token.toJwt();

    res.json({
      token: jwt,
      livekitUrl: LIVEKIT_URL,
      roomName: data.roomName,
      customerName: data.customerName,
      identity: customerIdentity,
    });
  } catch (error: any) {
    console.error('Error joining video call:', error);
    res.status(500).json({ error: error.message || 'Failed to join video call' });
  }
});

// POST /api/video-calls/:roomName/end
// End a video call room (kicks all participants)
router.post('/:roomName/end', async (req: AuthRequest, res: Response) => {
  try {
    const { roomName } = req.params;
    const roomService = getRoomService();
    await roomService.deleteRoom(roomName);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error ending video call:', error);
    res.status(500).json({ error: error.message || 'Failed to end video call' });
  }
});

export default router;
