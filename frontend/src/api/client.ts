const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Members
export interface Member {
  id: number;
  name: string;
  avatar_color: string;
  points_total: number;
  is_parent: boolean;
  allowance_balance: number;
  created_at: string;
}

export const getMembers = () => request<Member[]>('/members');
export const createMember = (data: { name: string; avatar_color: string }) =>
  request<Member>('/members', { method: 'POST', body: JSON.stringify(data) });
export const updateMember = (id: number, data: Partial<Pick<Member, 'name' | 'avatar_color'>>) =>
  request<Member>(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMember = (id: number) =>
  request<void>(`/members/${id}`, { method: 'DELETE' });

// Task Templates
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
  created_by: number | null;
  is_active: boolean;
  weekly_assignments: Record<string, number[]> | null;
  repeat_interval: number;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  assignee_color?: string;
}

export const getTemplates = () => request<TaskTemplate[]>('/templates');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createTemplate = (data: Record<string, any>) =>
  request<TaskTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) });
export const updateTemplate = (id: number, data: Partial<TaskTemplate>) =>
  request<TaskTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTemplate = (id: number) =>
  request<void>(`/templates/${id}`, { method: 'DELETE' });

// Task Instances
export interface TaskInstance {
  id: number;
  template_id: number;
  due_date: string;
  assigned_to: number | null;
  status: 'pending' | 'completed' | 'skipped';
  completed_by: number | null;
  completed_at: string | null;
  points_awarded: number;
  notes: string | null;
  created_at: string;
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
  request<TaskInstance & { new_achievements?: Achievement[] }>(`/tasks/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId }),
  });

export const skipTask = (id: number, memberId?: number) =>
  request<TaskInstance>(`/tasks/${id}/skip`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId }),
  });

export const undoTask = (id: number, memberId?: number) =>
  request<TaskInstance>(`/tasks/${id}/undo`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId }),
  });

export const updateTask = (id: number, data: Partial<TaskInstance>) =>
  request<TaskInstance>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Gamification
export interface LeaderboardEntry {
  member_id: number;
  name: string;
  avatar_color: string;
  points: number;
  tasks_completed: number;
}

export interface MemberStats {
  current_streak: number;
  longest_streak: number;
  total_completed: number;
  total_skipped: number;
  total_points: number;
  early_bird_count: number;
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

// Audit
export interface AuditEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  member_id: number | null;
  member_name: string | null;
  member_color: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Allowance
export interface AllowanceSettings {
  id: number;
  rate_per_point: number;
  all_or_nothing: boolean;
  enabled: boolean;
}

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
  created_at: string;
}

export const getAllowanceSettings = () => request<AllowanceSettings>('/allowance/settings');
export const updateAllowanceSettings = (data: Partial<AllowanceSettings> & { member_id: number }) =>
  request<AllowanceSettings>('/allowance/settings', { method: 'PUT', body: JSON.stringify(data) });
export const getAllowanceBalances = () => request<AllowanceBalance[]>('/allowance/balances');
export const getAllowanceLedger = (params: { member?: number; start?: string; end?: string; limit?: number }) => {
  const search = new URLSearchParams();
  if (params.member) search.set('member', String(params.member));
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.limit) search.set('limit', String(params.limit));
  return request<AllowanceLedgerEntry[]>(`/allowance/ledger?${search.toString()}`);
};
export const recordPayout = (data: { member_id: number; amount: number; note: string; parent_id: number }) =>
  request<{ message: string; balance: number }>('/allowance/payout', { method: 'POST', body: JSON.stringify(data) });

// Audit
export const getAuditLog = (params: { member?: number; action?: string; start?: string; end?: string; limit?: number }) => {
  const search = new URLSearchParams();
  if (params.member) search.set('member', String(params.member));
  if (params.action) search.set('action', params.action);
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.limit) search.set('limit', String(params.limit));
  return request<AuditEntry[]>(`/audit?${search.toString()}`);
};
