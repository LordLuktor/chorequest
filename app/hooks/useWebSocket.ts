import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { io as socketIO, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import { getAccessToken } from '../lib/api';

/**
 * Resolve the Socket.IO server URL.
 * On web, connect to the same origin (nginx proxies the WS upgrade).
 * On native, connect to the full API URL (strip /api/v1 suffix).
 */
function getSocketUrl(): string {
  if (Platform.OS === 'web') {
    // Same origin -- socket.io handles the path automatically
    return '/';
  }
  // Native: use the API host without the /api/v1 path
  const base = __DEV__
    ? 'http://192.168.1.100:4000'
    : 'https://chores.steinmetz.ltd';
  return base;
}

/**
 * Hook that maintains a Socket.IO connection while the user is authenticated.
 * Listens for server-pushed events and invalidates the relevant React Query caches
 * so the UI stays in sync across devices.
 */
export function useWebSocket() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if we were connected and auth was lost
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    const socket = socketIO(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('connect_error', (err) => {
      console.warn('WebSocket connection error:', err.message);
    });

    // ── Event handlers ────────────────────────────────────────────
    socket.on('task:updated', (_data: { taskId: number }) => {
      // Invalidate all task-related queries so they refetch
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['memberStats'] });
    });

    socket.on('location:updated', (_data: { memberId: number }) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    });

    socket.on('shopping:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, queryClient]);
}
