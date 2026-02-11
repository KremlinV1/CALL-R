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
import vogentRoutes from './routes/vogent.js';
import { campaignExecutor } from './services/campaignExecutor.js';
import { vogentDialPoller } from './services/vogentDialPoller.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { authLimiter } from './middleware/rateLimit.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: isProd
      ? process.env.FRONTEND_URL || ''
      : [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
if (isProd) app.set('trust proxy', 1); // Trust first proxy (nginx, LB)
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      ...(!isProd ? ['http://localhost:3000', 'http://localhost:3001'] : []),
    ];
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) {
      callback(null, true);
    } else if (allowed.includes(origin) || (!isProd && origin.startsWith('http://127.0.0.1'))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
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
app.use('/api/vogent', vogentRoutes); // Webhook endpoint is public; other routes check auth internally

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

  // Start Vogent dial status poller
  vogentDialPoller.start(io);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  campaignExecutor.stop();
  vogentDialPoller.stop();
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
