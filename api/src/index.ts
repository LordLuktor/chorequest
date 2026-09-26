import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { membersRouter } from './routes/members';
import { templatesRouter } from './routes/templates';
import { tasksRouter } from './routes/tasks';
import { gamificationRouter } from './routes/gamification';
import { pushRouter } from './routes/push';
import { auditRouter } from './routes/audit';
import { settingsRouter } from './routes/settings';
import { allowanceRouter } from './routes/allowance';
import { analyticsRouter } from './routes/analytics';
import { templateLibraryRouter } from './routes/template-library';
import { authRouter } from './routes/auth';
import { locationsRouter } from './routes/locations';
import { shoppingRouter } from './routes/shopping';
import { rewardsRouter } from './routes/rewards';
import { safetyRouter } from './routes/safety';
import { eventsRouter } from './routes/events';
import { menuRouter } from './routes/menu';
import { startScheduler } from './scheduler';
import { cleanExpiredTokens } from './services/auth';
import { setupWebSocket } from './websocket';
import { verifyToken } from './services/auth';
import db from './db';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (nginx/Traefik)
const PORT = parseInt(process.env.PORT || '4000');
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://chores.steinmetz.ltd',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
// Auth routes are exempt from this shared bucket and rely on their own
// stricter limiters (see routes/auth.ts) — otherwise a retry storm on any other
// endpoint from the same key can exhaust the bucket and lock out login too.
//
// Household members typically share one home-network IP, so keying purely by
// IP means one busy device (background location polling, multiple open tabs)
// can exhaust the bucket for everyone else in the house. Identify the caller
// from their JWT when present and key on that instead; only fall back to IP
// for unauthenticated requests. This is a soft check — it never rejects a
// request itself, that's still requireAuth's job inside each router.
function identifyForRateLimit(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(authHeader.slice(7));
    } catch {
      // Invalid/expired token — requireAuth will reject it downstream; fall back to IP for the key.
    }
  }
  next();
}

const limiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.startsWith('/api/v1/auth') || req.originalUrl.startsWith('/api/auth'),
  keyGenerator: (req) => req.user?.sub ?? ipKeyGenerator(req.ip!),
});
app.use('/api', identifyForRateLimit, limiter);

// Health check (unauthenticated)
app.get('/api/health', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Auth routes (mostly unauthenticated)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter); // alias for backward compat

// Authenticated routes (auth middleware applied inside each router)
app.use('/api/v1/members', membersRouter);
app.use('/api/v1/templates', templatesRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1', gamificationRouter);
app.use('/api/v1/push', pushRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/allowance', allowanceRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/template-library', templateLibraryRouter);
app.use('/api/v1/locations', locationsRouter);
app.use('/api/v1/shopping', shoppingRouter);
app.use('/api/v1/rewards', rewardsRouter);
app.use('/api/v1/safety', safetyRouter);
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/menu', menuRouter);

// Legacy routes (same routers, old paths — for current frontend until it's rebuilt)
app.use('/api/members', membersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api', gamificationRouter);
app.use('/api/push', pushRouter);
app.use('/api/audit', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/allowance', allowanceRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/template-library', templateLibraryRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/events', eventsRouter);
app.use('/api/menu', menuRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

async function waitForDb(maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.raw('SELECT 1');
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(`Database not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function start() {
  // Swarm restarts all services together on reboot; wait out the race
  // where the API container comes up before Postgres accepts connections.
  await waitForDb();

  // Run migrations
  console.log('Running migrations...');
  await db.migrate.latest({
    directory: './migrations',
    extension: 'ts',
  });
  console.log('Migrations complete.');

  // Start task instance scheduler
  startScheduler();

  // Clean expired refresh tokens every hour
  setInterval(() => {
    cleanExpiredTokens().catch(err => console.error('Token cleanup error:', err));
  }, 60 * 60 * 1000);

  // Attach WebSocket server before listening
  setupWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ChoreQuest API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
