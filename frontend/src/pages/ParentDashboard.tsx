import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog, type AuditEntry } from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { cn } from '../lib/utils';
import { BarChart3, Clock, CheckCircle2, SkipForward, Undo2 } from 'lucide-react';

const API_BASE = '/api';

interface AnalyticsRate {
  member_id: number;
  name: string;
  avatar_color: string;
  total: number;
  completed: number;
  skipped: number;
  rate: number;
}

interface TrendEntry {
  date: string;
  member_id: number;
  name: string;
  avatar_color: string;
  points: number;
  tasks_completed: number;
}

interface SkippedTask {
  template_id: number;
  title: string;
  icon: string;
  skip_count: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

export default function ParentDashboard() {
  const [period, setPeriod] = useState<7 | 30>(7);

  const { data: rates = [] } = useQuery<AnalyticsRate[]>({
    queryKey: ['analytics-rates', period],
    queryFn: () => fetchJson(`${API_BASE}/analytics/completion-rates?period=${period}`),
  });

  const { data: trends = [] } = useQuery<TrendEntry[]>({
    queryKey: ['analytics-trends', period],
    queryFn: () => fetchJson(`${API_BASE}/analytics/trends?period=${period}`),
  });

  const { data: skipped = [] } = useQuery<SkippedTask[]>({
    queryKey: ['analytics-skipped'],
    queryFn: () => fetchJson(`${API_BASE}/analytics/most-skipped?limit=10`),
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ['audit-log-recent'],
    queryFn: () => getAuditLog({ limit: 20 }),
  });

  // Transform trends for recharts: pivot to { date, [memberName]: points }
  const trendsByDate = new Map<string, Record<string, number>>();
  const memberNames = new Set<string>();
  const memberColors = new Map<string, string>();
  for (const t of trends) {
    memberNames.add(t.name);
    memberColors.set(t.name, t.avatar_color);
    const dateStr = typeof t.date === 'string' ? t.date.split('T')[0] : t.date;
    if (!trendsByDate.has(dateStr)) trendsByDate.set(dateStr, { date: dateStr } as any);
    const row = trendsByDate.get(dateStr)!;
    row[t.name] = (row[t.name] || 0) + t.points;
  }
  const trendData = Array.from(trendsByDate.values()).sort((a, b) =>
    (a as any).date.localeCompare((b as any).date)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="text-primary-400" size={22} />
          Parent Dashboard
        </h2>
        <div className="flex gap-1 bg-surface-raised border border-border rounded-lg p-1">
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                period === p ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text'
              )}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Completion Rates */}
      <section className="bg-surface-raised border border-border rounded-xl p-4">
        <h3 className="text-sm text-text-muted mb-3">Completion Rates</h3>
        {rates.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rates} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#94a3b8" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={60} />
              <Tooltip
                contentStyle={{ background: 'var(--theme-surface-raised)', border: '1px solid var(--theme-border)', borderRadius: 8, color: 'var(--theme-text)' }}
                formatter={(value: number) => [`${value}%`, 'Completion Rate']}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]} fill="#818cf8">
                {rates.map((entry, i) => (
                  <rect key={i} fill={entry.avatar_color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          {rates.map((r) => (
            <div key={r.member_id} className="flex items-center gap-2 p-2 rounded-lg bg-surface text-sm">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.avatar_color }} />
              <span className="truncate">{r.name}</span>
              <span className="ml-auto font-mono text-xs">{r.completed}/{r.total}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Points Trend */}
      <section className="bg-surface-raised border border-border rounded-xl p-4">
        <h3 className="text-sm text-text-muted mb-3">Points Trend</h3>
        {trendData.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(d) => d.slice(5)} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ background: 'var(--theme-surface-raised)', border: '1px solid var(--theme-border)', borderRadius: 8, color: 'var(--theme-text)' }}
              />
              {Array.from(memberNames).map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={memberColors.get(name) || '#818cf8'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Most Skipped */}
      <section className="bg-surface-raised border border-border rounded-xl p-4">
        <h3 className="text-sm text-text-muted mb-3">Most Skipped Tasks</h3>
        {skipped.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No skips yet</p>
        ) : (
          <div className="space-y-1.5">
            {skipped.map((s) => (
              <div key={s.template_id} className="flex items-center gap-2 text-sm">
                <span>{s.icon || '📋'}</span>
                <span className="flex-1 truncate">{s.title}</span>
                <span className="font-mono text-warning text-xs">{s.skip_count} skips</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Audit Log */}
      <section className="bg-surface-raised border border-border rounded-xl p-4">
        <h3 className="text-sm text-text-muted mb-3">Recent Activity</h3>
        {auditLog.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No activity yet</p>
        ) : (
          <div className="space-y-1.5">
            {auditLog.map((entry: AuditEntry) => (
              <div key={entry.id} className="flex items-center gap-2 text-sm">
                {entry.action === 'task_completed' && <CheckCircle2 size={14} className="text-success shrink-0" />}
                {entry.action === 'task_skipped' && <SkipForward size={14} className="text-warning shrink-0" />}
                {entry.action === 'task_undone' && <Undo2 size={14} className="text-primary-400 shrink-0" />}
                {!['task_completed', 'task_skipped', 'task_undone'].includes(entry.action) && <Clock size={14} className="text-text-muted shrink-0" />}
                <span className="flex items-center gap-1">
                  {entry.member_name && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.member_color || '#6366f1' }} />
                  )}
                  <span className="font-medium">{entry.member_name || 'System'}</span>
                </span>
                <span className="text-text-muted">{entry.action.replace(/_/g, ' ')}</span>
                <span className="ml-auto text-xs text-text-muted shrink-0">
                  {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
