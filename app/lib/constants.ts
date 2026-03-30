import { Platform } from 'react-native';

// API base URL — in production this points to the deployed API
// On web, we use relative URLs (nginx proxies /api/ to the backend)
// On native, we need the full URL
export const API_BASE = Platform.select({
  web: '/api/v1',
  default: __DEV__ ? 'http://192.168.1.100:4000/api/v1' : 'https://chores.steinmetz.ltd/api/v1',
}) as string;

export const COLORS = {
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',
  surface0: '#07060f',
  surface1: '#0f0e1a',
  surface2: '#1a1830',
  surface3: '#252244',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#e0e7ff',
  textMuted: '#94a3b8',
  border: '#312e5a',
};

export const MEMBER_COLORS = ['#F97316', '#8B5CF6', '#22C55E', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6'];
