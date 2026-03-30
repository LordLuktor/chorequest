import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyToken } from './services/auth';

let io: SocketIOServer | null = null;

/**
 * Create and configure the Socket.IO server.
 * Authenticates connections via JWT and joins clients to their household room.
 */
export function setupWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyToken(token);
      socket.data.user = payload;
      socket.data.householdId = payload.hid;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const householdId = socket.data.householdId;
    if (householdId) {
      const room = `household:${householdId}`;
      socket.join(room);
      console.log(`WS client joined ${room} (socket ${socket.id})`);
    }

    socket.on('disconnect', (reason) => {
      console.log(`WS client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('WebSocket server initialized');
  return io;
}

/**
 * Get the Socket.IO server instance for emitting events from route handlers.
 * Returns null if WebSocket has not been initialized yet.
 */
export function getIO(): SocketIOServer | null {
  return io;
}
