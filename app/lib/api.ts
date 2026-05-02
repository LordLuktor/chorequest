import { API_BASE } from './constants';
import { getItem, setItem, removeItem } from './storage';

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;

// ── Token management ─────────────────────────────────────────────
export async function loadTokens() {
  accessToken = await getItem('accessToken');
  refreshTokenValue = await getItem('refreshToken');
}

export async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshTokenValue = refresh;
  await setItem('accessToken', access);
  await setItem('refreshToken', refresh);
}

export async function clearTokens() {
  accessToken = null;
  refreshTokenValue = null;
  await removeItem('accessToken');
  await removeItem('refreshToken');
}

export function getAccessToken() {
  return accessToken;
}

// ── Core request function ────────────────────────────────────────
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // If 401 and we have a refresh token, try to refresh
  if (res.status === 401 && refreshTokenValue) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (refreshRes.ok) {
      const { accessToken: newToken } = await refreshRes.json();
      accessToken = newToken;
      await setItem('accessToken', newToken);
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      // Refresh failed — force logout
      await clearTokens();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth API ─────────────────────────────────────────────────────
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; username: string | null; displayName: string };
  household: { id: string; name: string };
  member: { id: number; role: string };
}

export const authSignup = (data: {
  email?: string; username?: string; password: string; displayName: string; householdName: string;
}) => request<AuthResult>('/auth/signup', { method: 'POST', body: JSON.stringify(data) });

export const authLogin = (data: { identifier: string; password: string }) =>
  request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(data) });

export const authJoin = (data: {
  inviteCode: string; email?: string; username?: string; password: string; displayName: string;
}) => request<AuthResult>('/auth/join', { method: 'POST', body: JSON.stringify(data) });

export const authLogout = (refreshToken: string) =>
  request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });

export const requestPasswordReset = (email: string) =>
  request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });

export const resetPasswordWithToken = (token: string, newPassword: string) =>
  request<{ message: string }>('/auth/reset-password-token', { method: 'POST', body: JSON.stringify({ token, newPassword }) });

export const authMe = () => request<{
  user: { id: string; email: string | null; username: string | null; displayName: string; isManaged: boolean };
  household: { id: string; name: string; inviteCode?: string; inviteExpiresAt?: string };
  member: { id: number; name: string; role: string; avatarColor: string };
}>('/auth/me');

export const resetMemberPassword = (memberId: number, newPassword: string) =>
  request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ memberId, newPassword }) });

export const updateMemberEmail = (memberId: number, email: string) =>
  request('/auth/update-email', { method: 'POST', body: JSON.stringify({ memberId, email }) });

export const deleteMember = (id: number) =>
  request<void>(`/members/${id}`, { method: 'DELETE' });

export const authCreateChild = (data: {
  username: string; password: string; displayName: string; avatarColor?: string;
}) => request('/auth/create-child', { method: 'POST', body: JSON.stringify(data) });

// ── Members API ──────────────────────────────────────────────────
export interface Member {
  id: number;
  name: string;
  avatar_color: string;
  points_total: number;
  role: string;
  is_parent?: boolean;
  allowance_balance: number;
  easy_mode?: boolean;
  pin_hash?: string;
  email?: string | null;
  username?: string | null;
}

export const getMembers = () => request<Member[]>('/members');
export const createMember = (data: { name: string; avatar_color: string }) =>
  request<Member>('/members', { method: 'POST', body: JSON.stringify(data) });
export const updateMember = (id: number, data: Partial<Member>) =>
  request<Member>(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// ── Task Templates API ───────────────────────────────────────────
export interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  points: number;
  assigned_to: number | null;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  weekly_assignments: Record<string, number[]> | null;
  repeat_interval: number;
  assignee_name?: string;
  assignee_color?: string;
}

export const getTemplates = () => request<TaskTemplate[]>('/templates');
export const createTemplate = (data: Record<string, any>) =>
  request<TaskTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) });
export const updateTemplate = (id: number, data: Partial<TaskTemplate>) =>
  request<TaskTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTemplate = (id: number) =>
  request<void>(`/templates/${id}`, { method: 'DELETE' });

// ── Task Instances API ───────────────────────────────────────────
export interface TaskInstance {
  id: number;
  template_id: number;
  due_date: string;
  assigned_to: number | null;
  status: 'pending' | 'completed' | 'skipped';
  completed_by: number | null;
  completed_at: string | null;
  points_awarded: number;
  title: string;
  icon: string | null;
  description: string | null;
  template_points: number;
  assignee_name: string | null;
  assignee_color: string | null;
}

export const getTasks = (params: { start?: string; end?: string; member?: number; status?: string }) => {
  const search = new URLSearchParams();
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.member) search.set('member', String(params.member));
  if (params.status) search.set('status', params.status);
  return request<TaskInstance[]>(`/tasks?${search.toString()}`);
};

export const completeTask = (id: number, memberId: number) =>
  request<TaskInstance & { new_achievements?: any[] }>(`/tasks/${id}/complete`, {
    method: 'POST', body: JSON.stringify({ member_id: memberId }),
  });

export const skipTask = (id: number, memberId?: number) =>
  request<TaskInstance>(`/tasks/${id}/skip`, {
    method: 'POST', body: JSON.stringify({ member_id: memberId }),
  });

export const undoTask = (id: number, memberId?: number) =>
  request<TaskInstance>(`/tasks/${id}/undo`, {
    method: 'POST', body: JSON.stringify({ member_id: memberId }),
  });

// ── Locations API ────────────────────────────────────────────────
export interface MemberLocation {
  member_id: number;
  member_name: string;
  avatar_color: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
}

export const reportLocation = (data: { latitude: number; longitude: number; accuracy?: number }) =>
  request('/locations', { method: 'POST', body: JSON.stringify(data) });

export const getLocations = () => request<MemberLocation[]>('/locations');

export const stopSharing = () => request('/locations', { method: 'DELETE' });

// ── Leaderboard & Stats API ──────────────────────────────────────
export interface LeaderboardEntry {
  member_id: number;
  name: string;
  avatar_color: string;
  points: number;
  tasks_completed: number;
}

export interface MemberStats {
  total_completed: number;
  total_points: number;
  early_bird_count: number;
  current_streak: number;
  longest_streak: number;
  total_skipped: number;
  achievements: (Achievement & { unlocked_at: string | null })[];
}

export interface Achievement {
  id: number;
  key: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  category: string;
}

export const getLeaderboard = (period: 'week' | 'month' | 'all' = 'all') =>
  request<LeaderboardEntry[]>(`/leaderboard?period=${period}`);

export const getMemberStats = (memberId: number) =>
  request<MemberStats>(`/members/${memberId}/stats`);

export const getAchievements = () => request<Achievement[]>('/achievements');

// ── Allowance API ────────────────────────────────────────────────
export interface AllowanceSettings {
  id: number;
  rate_per_point: number;
  all_or_nothing: boolean;
  enabled: boolean;
  reward_mode: 'allowance' | 'points_economy';
  bonus_early_bird: boolean;
  bonus_early_bird_amount: number;
  bonus_daily_completion: boolean;
  bonus_daily_completion_amount: number;
  bonus_weekly_streak: boolean;
  bonus_weekly_streak_amount: number;
}

export const cashOutPoints = (memberId: number, points: number) =>
  request<{ message: string; points_remaining: number; allowance_balance: number }>(
    '/allowance/cashout', { method: 'POST', body: JSON.stringify({ member_id: memberId, points }) }
  );

export interface AllowanceBalance {
  id: number;
  name: string;
  avatar_color: string;
  allowance_balance: number;
  is_parent: boolean;
}

export interface AllowanceLedgerEntry {
  id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  date: string;
  type: 'earned' | 'payout' | 'adjustment';
  amount: number;
  points_basis: number | null;
  note: string | null;
}

export const getAllowanceSettings = () => request<AllowanceSettings>('/allowance/settings');
export const updateAllowanceSettings = (data: Partial<AllowanceSettings>) =>
  request<AllowanceSettings>('/allowance/settings', { method: 'PUT', body: JSON.stringify(data) });
export const getAllowanceBalances = () => request<AllowanceBalance[]>('/allowance/balances');
export const getAllowanceLedger = (params: { member?: number; limit?: number }) => {
  const search = new URLSearchParams();
  if (params.member) search.set('member', String(params.member));
  if (params.limit) search.set('limit', String(params.limit));
  return request<AllowanceLedgerEntry[]>(`/allowance/ledger?${search.toString()}`);
};

// ── Analytics API ───────────────────────────────────────────────
export interface CompletionRate {
  member_id: number;
  name: string;
  avatar_color: string;
  total: number;
  completed: number;
  skipped: number;
  rate: number; // percentage 0-100
}

export interface TrendEntry {
  date: string;
  member_id: number;
  name: string;
  avatar_color: string;
  points: number;
  tasks_completed: number;
}

export const getCompletionRates = (period = 7) =>
  request<CompletionRate[]>(`/analytics/completion-rates?period=${period}`);

export const getTrends = (period = 7) =>
  request<TrendEntry[]>(`/analytics/trends?period=${period}`);

// ── Household API ────────────────────────────────────────────────
export const regenerateInvite = () => request<{ code: string; expiresAt: string }>('/auth/invite', { method: 'POST' });

// ── Shopping List API ───────────────────────────────────────────
export interface ShoppingItem {
  id: number;
  text: string;
  category: string;
  added_by: number | null;
  added_by_name: string | null;
  is_checked: boolean;
  checked_by: number | null;
  checked_by_name: string | null;
  created_at: string;
  checked_at: string | null;
}

export const getShoppingList = () => request<ShoppingItem[]>('/shopping');

export const addShoppingItem = (text: string, category?: string) =>
  request<ShoppingItem>('/shopping', { method: 'POST', body: JSON.stringify({ text, category }) });

export const toggleShoppingItem = (id: number) =>
  request<ShoppingItem>(`/shopping/${id}/check`, { method: 'PUT' });

export const deleteShoppingItem = (id: number) =>
  request<void>(`/shopping/${id}`, { method: 'DELETE' });

export const clearCheckedItems = () =>
  request<void>('/shopping/checked', { method: 'DELETE' });

// ── Rewards API ─────────────────────────────────────────────────
export interface Reward {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  cost_points: number;
  is_active: boolean;
}

export interface RewardRedemption {
  id: number;
  reward_id: number;
  reward_title: string;
  member_id: number;
  member_name: string;
  points_spent: number;
  status: string;
  redeemed_at: string;
}

export const getRewards = () => request<Reward[]>('/rewards');

export const createReward = (data: { title: string; description?: string; icon?: string; cost_points: number }) =>
  request<Reward>('/rewards', { method: 'POST', body: JSON.stringify(data) });

export const updateReward = (id: number, data: Partial<Reward>) =>
  request<Reward>(`/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteReward = (id: number) => request<void>(`/rewards/${id}`, { method: 'DELETE' });

export const redeemReward = (id: number) => request(`/rewards/${id}/redeem`, { method: 'POST' });

export const getRedemptions = () => request<RewardRedemption[]>('/rewards/redemptions');

export const resolveRedemption = (id: number, status: 'approved' | 'denied') =>
  request(`/rewards/redemptions/${id}/approve`, { method: 'PUT', body: JSON.stringify({ status }) });

// Reward Requests (kids suggest, parents approve)
export interface RewardRequest {
  id: number; title: string; description: string | null; icon: string | null;
  suggested_points: number | null; status: string;
  requested_by: number; requested_by_name: string; avatar_color: string;
  created_at: string;
}
export const submitRewardRequest = (data: { title: string; description?: string; icon?: string; suggested_points?: number }) =>
  request<RewardRequest>('/rewards/requests', { method: 'POST', body: JSON.stringify(data) });
export const getRewardRequests = () => request<RewardRequest[]>('/rewards/requests');
export const resolveRewardRequest = (id: number, status: 'approved' | 'denied', cost_points?: number) =>
  request(`/rewards/requests/${id}`, { method: 'PUT', body: JSON.stringify({ status, cost_points }) });

// ── Safety API ─────────────────────────────────────────────────
export interface SOSAlert {
  id: number;
  member_id: number;
  member_name?: string;
  latitude: number | null;
  longitude: number | null;
  message: string | null;
  is_resolved: boolean;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CheckinRequest {
  id: number;
  requested_by: number;
  requested_by_name?: string;
  requested_of: number;
  requested_of_name?: string;
  status: string;
  response_latitude: number | null;
  response_longitude: number | null;
  created_at: string;
  responded_at: string | null;
}

export interface Geofence {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  notify_on_enter: boolean;
  notify_on_exit: boolean;
  is_active: boolean;
  member_ids?: number[];
}

export const triggerSOS = (data: { latitude?: number; longitude?: number; message?: string }) =>
  request<SOSAlert>('/safety/sos', { method: 'POST', body: JSON.stringify(data) });

export const getSOSAlerts = () => request<SOSAlert[]>('/safety/sos');

export const resolveSOS = (id: number) =>
  request<SOSAlert>(`/safety/sos/${id}/resolve`, { method: 'PUT' });

export const requestCheckin = (memberId: number) =>
  request<CheckinRequest>('/safety/checkin/request', { method: 'POST', body: JSON.stringify({ memberId }) });

export const respondCheckin = (requestId: number, latitude: number, longitude: number) =>
  request<CheckinRequest>('/safety/checkin/respond', { method: 'POST', body: JSON.stringify({ requestId, latitude, longitude }) });

export const getCheckins = () => request<CheckinRequest[]>('/safety/checkin');

export const getGeofences = () => request<Geofence[]>('/safety/geofences');

export const createGeofence = (data: {
  name: string; latitude: number; longitude: number; radius_meters?: number;
  notify_on_enter?: boolean; notify_on_exit?: boolean; memberIds?: number[];
}) => request<Geofence>('/safety/geofences', { method: 'POST', body: JSON.stringify(data) });

export const updateGeofence = (id: number, data: Partial<Geofence & { memberIds?: number[] }>) =>
  request<Geofence>(`/safety/geofences/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteGeofence = (id: number) =>
  request<void>(`/safety/geofences/${id}`, { method: 'DELETE' });

// ── Data Export & Account Deletion ─────────────────────────────
export const exportUserData = () => request<any>('/auth/export');

export const deleteAccount = (confirmPassword: string) =>
  request('/auth/account', { method: 'DELETE', body: JSON.stringify({ confirmPassword }) });

// ── Display Account API ─────────────────────────────────────────
export const authPinLogin = (data: { householdId: string; pin: string }) =>
  request<AuthResult>('/auth/pin-login', { method: 'POST', body: JSON.stringify(data) });

export const authCreateDisplay = (data: { name: string; pin: string }) =>
  request<{ user: any; member: any }>('/auth/create-display', { method: 'POST', body: JSON.stringify(data) });

export const resetDisplayPin = (memberId: number, pin: string) =>
  request<{ message: string }>('/auth/reset-display-pin', { method: 'POST', body: JSON.stringify({ memberId, pin }) });

export const setUserPin = (memberId: number, pin: string) =>
  request<{ message: string }>('/auth/set-user-pin', { method: 'POST', body: JSON.stringify({ memberId, pin }) });

export const verifyUserPin = (memberId: number, pin: string) =>
  request<{ message: string; memberId: number; memberName: string }>('/auth/verify-pin', { method: 'POST', body: JSON.stringify({ memberId, pin }) });

export const getPinStatus = () =>
  request<{ id: number; name: string; avatar_color: string; role: string; has_pin: boolean }[]>('/auth/pin-status');
