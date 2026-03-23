/**
 * Invariant Hunter API Server
 * 
 * Provides endpoints for:
 * - User authentication
 * - Job management (create, list, status, logs)
 * - Handler generation
 * - Log scraping
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth';
import { jobsRouter } from './routes/jobs';
import { toolsRouter } from './routes/tools';
import { handlersRouter } from './routes/handlers';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { JobQueue } from './services/jobQueue';
import { setSocketIo } from './socket';
import type { CorsOptions } from 'cors';

// Load environment variables
dotenv.config();

/**
 * CORS: FRONTEND_URL can be comma-separated (e.g. prod + preview).
 * In development, allow any http(s) localhost / 127.0.0.1 port so 3000, 3001, etc. all work.
 */
function buildCorsOrigin(): CorsOptions['origin'] {
  const raw = process.env.FRONTEND_URL?.split(',').map((s) => s.trim()).filter(Boolean);
  if (raw && raw.length > 0) {
    return raw.length === 1 ? raw[0]! : raw;
  }
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  if (isDev) {
    return (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const u = new URL(origin);
        const ok =
          (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
          (u.protocol === 'http:' || u.protocol === 'https:');
        callback(null, ok);
      } catch {
        callback(null, false);
      }
    };
  }
  return 'http://localhost:3000';
}

const corsOrigin = buildCorsOrigin();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});
setSocketIo(io);

const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json());

// Never cache API JSON (prevents 304 empty body + stale job lists in the browser)
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/jobs', authMiddleware, jobsRouter);
app.use('/api/tools', authMiddleware, toolsRouter);
app.use('/api/handlers', authMiddleware, handlersRouter);

// WebSocket for real-time job updates
io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe:job', (jobId: string) => {
    socket.join(`job:${jobId}`);
  });

  socket.on('unsubscribe:job', (jobId: string) => {
    socket.leave(`job:${jobId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Export io for use in job updates
export { io };

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize job queue
const jobQueue = new JobQueue();
jobQueue.initialize().then(() => {
  console.log('Job queue initialized');
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   Invariant Hunter API Server                             ║
  ║                                                           ║
  ║   Running on: http://localhost:${PORT}                      ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}                          ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
