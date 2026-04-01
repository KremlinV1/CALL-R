import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { validateEnv } from './utils/validateEnv.js';
import { verifyToken } from './middleware/auth.js';
validateEnv();

const isProd = process.env.NODE_ENV === 'production';
const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, ''); // trim trailing slash
const allowedOrigins = [
  ...(frontendUrl ? [frontendUrl] : []),
  ...(!isProd ? ['http://localhost:3000', 'http://localhost:3001'] : []),
];
console.log(`🌐 CORS allowed origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(none — set FRONTEND_URL)'}`);

// Import routes
import authRoutes from './routes/auth.js';
import agentsRoutes from './routes/agents.js';
import campaignsRoutes from './routes/campaigns.js';
import contactsRoutes from './routes/contacts.js';
import callsRoutes from './routes/calls.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';
import phoneNumberPoolsRoutes from './routes/phoneNumberPools.js';
import contactListsRoutes from './routes/contactLists.js';
import phoneNumbersRoutes from './routes/phoneNumbers.js';
import livekitRoutes from './routes/livekit.js';
import voiceRoutes from './routes/voice.js';
import ivrRoutes from './routes/ivr.js';
import telnyxWebhookRoutes from './routes/webhooks/telnyx.js';
import transferRoutes from './routes/transfers.js';
import appointmentRoutes from './routes/appointments.js';
import crmRoutes from './routes/crm.js';
import workflowRoutes from './routes/workflows.js';
import notificationRoutes from './routes/notifications.js';
import callerIdRoutes from './routes/callerId.js';
import dncRoutes from './routes/dnc.js';
import messagesRoutes from './routes/messages.js';
import ringGroupRoutes from './routes/ringGroups.js';
import subscriptionRoutes from './routes/subscription.js';
import didwwRoutes from './routes/didww.js';
import escrowClaimsRoutes from './routes/escrowClaims.js';
import { campaignExecutor } from './services/campaignExecutor.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { authLimiter } from './middleware/rateLimit.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
if (isProd) app.set('trust proxy', 1); // Trust first proxy (nginx, LB)
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin) || (!isProd && origin.startsWith('http://127.0.0.1'))) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authLimiter, authRoutes);

// Public IVR verification endpoint (no auth - used by IVR agent)
import { Router } from 'express';
import { db } from './db/index.js';
import { escrowClaims } from './db/schema.js';
import { eq } from 'drizzle-orm';

const publicIvrRouter = Router();
publicIvrRouter.post('/verify', async (req, res) => {
  try {
    const { claimCode, pin } = req.body;
    
    if (!claimCode || !pin) {
      return res.status(400).json({ error: 'Claim code and PIN are required', verified: false });
    }
    
    // Select only columns that exist in production database
    const claim = await db
      .select({
        id: escrowClaims.id,
        claimCode: escrowClaims.claimCode,
        pin: escrowClaims.pin,
        firstName: escrowClaims.firstName,
        lastName: escrowClaims.lastName,
        escrowAmount: escrowClaims.escrowAmount,
        paymentFeeCents: escrowClaims.paymentFeeCents,
        escrowType: escrowClaims.escrowType,
        escrowDescription: escrowClaims.escrowDescription,
        status: escrowClaims.status,
        disbursementMethod: escrowClaims.disbursementMethod,
        originatingEntity: escrowClaims.originatingEntity,
        address: escrowClaims.address,
        city: escrowClaims.city,
        state: escrowClaims.state,
        zipCode: escrowClaims.zipCode,
        ssn4: escrowClaims.ssn4,
        dateOfBirth: escrowClaims.dateOfBirth,
        expiresAt: escrowClaims.expiresAt,
        isLocked: escrowClaims.isLocked,
        failedVerificationAttempts: escrowClaims.failedVerificationAttempts,
        totalCalls: escrowClaims.totalCalls,
      })
      .from(escrowClaims)
      .where(eq(escrowClaims.claimCode, claimCode))
      .limit(1);
    
    if (claim.length === 0) {
      return res.status(404).json({ error: 'Claim not found', verified: false });
    }
    
    const claimData = claim[0];
    
    if (claimData.isLocked) {
      return res.status(403).json({ error: 'Account is locked', verified: false });
    }
    
    if (claimData.pin !== pin) {
      await db
        .update(escrowClaims)
        .set({
          failedVerificationAttempts: (claimData.failedVerificationAttempts || 0) + 1,
          isLocked: (claimData.failedVerificationAttempts || 0) >= 4,
          updatedAt: new Date(),
        })
        .where(eq(escrowClaims.id, claimData.id));
      
      return res.status(401).json({ error: 'Invalid PIN', verified: false });
    }
    
    await db
      .update(escrowClaims)
      .set({
        lastCallAt: new Date(),
        totalCalls: (claimData.totalCalls || 0) + 1,
        failedVerificationAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(escrowClaims.id, claimData.id));
    
    res.json({
      verified: true,
      claim: {
        id: claimData.id,
        claimCode: claimData.claimCode,
        firstName: claimData.firstName,
        lastName: claimData.lastName,
        escrowAmount: claimData.escrowAmount,
        paymentFee: claimData.paymentFeeCents || 0,
        escrowType: claimData.escrowType,
        escrowDescription: claimData.escrowDescription,
        status: claimData.status,
        disbursementMethod: claimData.disbursementMethod,
        originatingEntity: claimData.originatingEntity,
        address: claimData.address,
        city: claimData.city,
        state: claimData.state,
        zipCode: claimData.zipCode,
        ssn4: claimData.ssn4,
        dateOfBirth: claimData.dateOfBirth,
        expiresAt: claimData.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('Error verifying claim:', error?.message || error);
    console.error('Full error:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Failed to verify claim', verified: false, details: error?.message });
  }
});
app.use('/api/ivr-verify', publicIvrRouter);

// Webhook routes (no auth - verified by provider signatures)
app.use('/api/webhooks/telnyx', telnyxWebhookRoutes);

// Protected routes
app.use('/api/agents', authMiddleware, agentsRoutes);
app.use('/api/campaigns', authMiddleware, campaignsRoutes);
app.use('/api/contacts', authMiddleware, contactsRoutes);
app.use('/api/calls', authMiddleware, callsRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/phone-pools', authMiddleware, phoneNumberPoolsRoutes);
app.use('/api/contact-lists', authMiddleware, contactListsRoutes);
app.use('/api/phone-numbers', authMiddleware, phoneNumbersRoutes);
app.use('/api/livekit', authMiddleware, livekitRoutes);
app.use('/api/voice', authMiddleware, voiceRoutes);
app.use('/api/ivr', authMiddleware, ivrRoutes);
app.use('/api/transfers', authMiddleware, transferRoutes);
app.use('/api/appointments', authMiddleware, appointmentRoutes);
app.use('/api/crm', authMiddleware, crmRoutes);
app.use('/api/workflows', authMiddleware, workflowRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/caller-id', authMiddleware, callerIdRoutes);
app.use('/api/dnc', authMiddleware, dncRoutes);
app.use('/api/messages', authMiddleware, messagesRoutes);
app.use('/api/ring-groups', authMiddleware, ringGroupRoutes);
app.use('/api/subscription', authMiddleware, subscriptionRoutes);
app.use('/api/didww', authMiddleware, didwwRoutes);
app.use('/api/escrow-claims', authMiddleware, escrowClaimsRoutes);

// Socket.IO connection handling
io.on('connection', async (socket) => {
  if (!isProd) console.log('Client connected:', socket.id);

  // Authenticate socket connections
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  let userOrg: string | null = null;
  if (token) {
    try {
      const payload = await verifyToken(token as string);
      userOrg = payload.organizationId as string;
      (socket as any).organizationId = userOrg;
    } catch {
      // Invalid token — socket can connect but can't join rooms
    }
  }

  socket.on('join-room', (roomId: string) => {
    // Only allow joining own organization's room
    if (userOrg && roomId === userOrg) {
      socket.join(roomId);
      if (!isProd) console.log(`Socket ${socket.id} joined room ${roomId}`);
    } else {
      if (!isProd) console.warn(`Socket ${socket.id} denied join to room ${roomId}`);
    }
  });

  socket.on('leave-room', (roomId: string) => {
    socket.leave(roomId);
  });

  socket.on('disconnect', () => {
    if (!isProd) console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);
// Also expose globally for webhook routes that don't have req.app
(globalThis as any).__socketIO = io;

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`
🚀 Pon E Line API Server running on port ${PORT}
📊 Health check: http://localhost:${PORT}/health
🔌 Socket.IO enabled
  `);
  
  // Start campaign executor service
  campaignExecutor.start();
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  campaignExecutor.stop();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit if graceful shutdown takes too long
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, io };
