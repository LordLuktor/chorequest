/**
 * Data layer for the ChoreQuest Android home-screen widget.
 *
 * This runs in a *headless* JS context (a background task spun up by Android
 * when the widget is added, refreshed, or clicked). It does NOT share the
 * running app's in-memory state, so it reads the auth token straight from
 * expo-secure-store (the same keys the app writes via lib/storage.ts) and talks
 * to the API directly rather than reusing lib/api.ts (whose token cache would be
 * empty here).
 *
 * Everything is best-effort and defensive: a network failure or missing token
 * must degrade to a sensible widget, never throw out of the task handler.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  format, addDays, startOfWeek, parseISO, isSameDay, isToday,
} from 'date-fns';
import { API_BASE } from '../lib/constants';

// SecureStore keys — must match lib/api.ts saveTokens()/loadTokens().
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

// AsyncStorage keys owned by the widget.
const K_DAY_OFFSET = 'widget:dayOffset'; // selected day, in days from "today"
const K_TASKS_CACHE = 'widget:tasksCache'; // last successful /tasks response + range
const K_MEMBER = 'widget:member'; // { id, name } of the logged-in member

// How wide a window of tasks we fetch/cache so day-to-day nav needs no refetch.
// One full week starting from the most recent Sunday.
const WINDOW_DAYS = 7;

export interface WidgetTask {
  id: number;
  title: string;
  icon: string | null;
  status: 'pending' | 'completed' | 'skipped';
  points: number;
  assigneeName: string | null;
  assigneeColor: string | null;
  dueKey: string; // yyyy-MM-dd
}

export interface DayCell {
  key: string; // yyyy-MM-dd
  offset: number; // days from today (can be negative)
  weekday: string; // 'Sun'..'Sat'
  dayNum: string; // '1'..'31'
  isToday: boolean;
  isSelected: boolean;
  total: number;
  pending: number;
  dotColors: string[]; // up to 3 assignee colors
}

export interface WidgetViewModel {
  loggedIn: boolean;
  error: boolean; // a fetch failed and we have no cache to fall back on
  stale: boolean; // showing cached data because the latest refresh failed
  dateLabel: string; // 'Today' | 'Tomorrow' | 'Wed, Jun 4'
  dayOffset: number;
  week: DayCell[];
  tasks: WidgetTask[]; // tasks for the selected day, pending first
  doneCount: number;
  totalCount: number;
}

interface TasksCache {
  rangeStart: string;
  rangeEnd: string;
  fetchedAt: number;
  tasks: WidgetTask[];
}

// ── token + http ─────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_KEY);
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  let refresh: string | null = null;
  try {
    refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    if (!data.accessToken) return null;
    try { await SecureStore.setItemAsync(ACCESS_KEY, data.accessToken); } catch { /* ignore */ }
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch that transparently refreshes the access token once on 401.
 * Returns the parsed JSON, or throws on a non-OK response / network error so the
 * caller can fall back to cache.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let token = await getAccessToken();
  if (!token) {
    token = await refreshAccessToken();
    if (!token) throw new Error('no-auth');
  }

  const doFetch = (t: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${t}`,
      },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (!fresh) throw new Error('session-expired');
    res = await doFetch(fresh);
  }
  if (!res.ok) throw new Error(`http-${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── auth helpers ─────────────────────────────────────────────────

export async function isLoggedIn(): Promise<boolean> {
  const t = await getAccessToken();
  if (t) return true;
  // No access token, but a refresh token may still let us in.
  try { return !!(await SecureStore.getItemAsync(REFRESH_KEY)); } catch { return false; }
}

export interface WidgetMember { id: number; name: string }

/**
 * The member id is needed to attribute completions. The app persists it on
 * login (see lib/widget-bridge.ts); if it's not there yet (e.g. widget added
 * before the app wrote it) we resolve it from /auth/me and cache it.
 */
export async function getMember(): Promise<WidgetMember | null> {
  try {
    const raw = await AsyncStorage.getItem(K_MEMBER);
    if (raw) {
      const m = JSON.parse(raw) as WidgetMember;
      if (m && typeof m.id === 'number') return m;
    }
  } catch { /* fall through to network */ }

  try {
    const me = await apiFetch<{ member: { id: number; name: string } }>('/auth/me');
    const member: WidgetMember = { id: me.member.id, name: me.member.name };
    try { await AsyncStorage.setItem(K_MEMBER, JSON.stringify(member)); } catch { /* ignore */ }
    return member;
  } catch {
    return null;
  }
}

// ── selected-day state ───────────────────────────────────────────

export async function getDayOffset(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(K_DAY_OFFSET);
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function setDayOffset(offset: number): Promise<void> {
  // Clamp to the cached window so navigation never points outside loaded data.
  const clamped = Math.max(weekStartOffset(), Math.min(weekStartOffset() + WINDOW_DAYS - 1, offset));
  try { await AsyncStorage.setItem(K_DAY_OFFSET, String(clamped)); } catch { /* ignore */ }
}

// Offset (in days from today) of the Sunday that begins the visible week.
function weekStartOffset(): number {
  const today = new Date();
  const ws = startOfWeek(today); // Sunday
  return Math.round((stripTime(ws).getTime() - stripTime(today).getTime()) / 86400000);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── task fetching + cache ────────────────────────────────────────

function normalizeTask(t: any): WidgetTask {
  return {
    id: t.id,
    title: t.title,
    icon: t.icon ?? null,
    status: t.status,
    points: typeof t.template_points === 'number' ? t.template_points : (t.points_awarded ?? 0),
    assigneeName: t.assignee_name ?? null,
    assigneeColor: t.assignee_color ?? null,
    dueKey: String(t.due_date).split('T')[0],
  };
}

async function readCache(): Promise<TasksCache | null> {
  try {
    const raw = await AsyncStorage.getItem(K_TASKS_CACHE);
    return raw ? (JSON.parse(raw) as TasksCache) : null;
  } catch {
    return null;
  }
}

async function writeCache(cache: TasksCache): Promise<void> {
  try { await AsyncStorage.setItem(K_TASKS_CACHE, JSON.stringify(cache)); } catch { /* ignore */ }
}

/** Fetch the current week's tasks and update the cache. Throws on failure. */
async function fetchWeek(): Promise<TasksCache> {
  const today = new Date();
  const ws = startOfWeek(today);
  const rangeStart = format(ws, 'yyyy-MM-dd');
  const rangeEnd = format(addDays(ws, WINDOW_DAYS), 'yyyy-MM-dd'); // exclusive upper bound
  const raw = await apiFetch<any[]>(`/tasks?start=${rangeStart}&end=${rangeEnd}`);
  const cache: TasksCache = {
    rangeStart,
    rangeEnd,
    fetchedAt: Date.now(),
    tasks: Array.isArray(raw) ? raw.map(normalizeTask) : [],
  };
  await writeCache(cache);
  return cache;
}

// ── completing a task ────────────────────────────────────────────

/**
 * Mark a task complete. Optimistically flips the cached copy so the immediate
 * re-render shows the check, then fires the API call and refreshes from the
 * server. Returns true if the optimistic update was applied.
 */
export async function completeTask(taskId: number): Promise<boolean> {
  // Defense in depth: only a positive integer id may reach the URL path, even
  // though the task handler already validates click payloads.
  if (!Number.isInteger(taskId) || taskId <= 0) return false;
  const member = await getMember();
  if (!member) return false;

  // Optimistic cache update for snappy feedback.
  const cache = await readCache();
  if (cache) {
    const t = cache.tasks.find((x) => x.id === taskId);
    if (t && t.status === 'pending') {
      t.status = 'completed';
      await writeCache(cache);
    }
  }

  try {
    await apiFetch(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ member_id: member.id }),
    });
    // Re-sync from the server (points, achievements, other devices' changes).
    await fetchWeek().catch(() => undefined);
    return true;
  } catch {
    // Leave the optimistic state in place; next refresh will reconcile.
    return true;
  }
}

// ── view-model assembly ──────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateLabelFor(offset: number): string {
  const d = addDays(new Date(), offset);
  if (isToday(d)) return 'Today';
  if (isSameDay(d, addDays(new Date(), 1))) return 'Tomorrow';
  if (isSameDay(d, addDays(new Date(), -1))) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}

function buildWeek(tasks: WidgetTask[], selectedOffset: number): DayCell[] {
  const today = new Date();
  const startOff = weekStartOffset();
  const byDay = new Map<string, WidgetTask[]>();
  for (const t of tasks) {
    if (!byDay.has(t.dueKey)) byDay.set(t.dueKey, []);
    byDay.get(t.dueKey)!.push(t);
  }

  const cells: DayCell[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const offset = startOff + i;
    const d = addDays(today, offset);
    const key = format(d, 'yyyy-MM-dd');
    const dayTasks = byDay.get(key) ?? [];
    const colors = [...new Set(dayTasks.map((t) => t.assigneeColor || '#6366f1'))].slice(0, 3);
    cells.push({
      key,
      offset,
      weekday: WEEKDAYS[d.getDay()],
      dayNum: format(d, 'd'),
      isToday: isToday(d),
      isSelected: offset === selectedOffset,
      total: dayTasks.length,
      pending: dayTasks.filter((t) => t.status === 'pending').length,
      dotColors: colors,
    });
  }
  return cells;
}

/**
 * Build everything the widget needs to render.
 * @param forceRefresh fetch fresh tasks (ADDED/UPDATE/COMPLETE); when false
 *        (RESIZED / pure navigation) we render from cache to avoid a network hit.
 */
export async function buildViewModel(forceRefresh: boolean): Promise<WidgetViewModel> {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    return {
      loggedIn: false, error: false, stale: false,
      dateLabel: dateLabelFor(0), dayOffset: 0,
      week: [], tasks: [], doneCount: 0, totalCount: 0,
    };
  }

  // Resolve selected day, clamped into the current week window.
  let offset = await getDayOffset();
  const startOff = weekStartOffset();
  if (offset < startOff || offset > startOff + WINDOW_DAYS - 1) {
    offset = 0; // default back to today if the cached selection rolled out of range
    await setDayOffset(0);
  }

  let cache = await readCache();
  let stale = false;
  let error = false;

  if (forceRefresh || !cache || cache.rangeStart !== format(startOfWeek(new Date()), 'yyyy-MM-dd')) {
    try {
      cache = await fetchWeek();
    } catch {
      if (cache) stale = true; // keep showing cached data
      else error = true;
    }
  }

  const allTasks = cache?.tasks ?? [];
  const week = buildWeek(allTasks, offset);
  const selectedKey = format(addDays(new Date(), offset), 'yyyy-MM-dd');
  const dayTasks = allTasks.filter((t) => t.dueKey === selectedKey);

  // Pending first, then completed, then skipped; stable within groups.
  const rank = (s: WidgetTask['status']) => (s === 'pending' ? 0 : s === 'completed' ? 1 : 2);
  dayTasks.sort((a, b) => rank(a.status) - rank(b.status));

  return {
    loggedIn: true,
    error,
    stale,
    dateLabel: dateLabelFor(offset),
    dayOffset: offset,
    week,
    tasks: dayTasks,
    doneCount: dayTasks.filter((t) => t.status === 'completed').length,
    totalCount: dayTasks.length,
  };
}

// Re-export for callers that want to parse ISO without importing date-fns again.
export { parseISO };
