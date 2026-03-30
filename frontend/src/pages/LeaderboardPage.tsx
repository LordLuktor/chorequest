import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard, getAchievements, getMembers, getMemberStats, type LeaderboardEntry, type Achievement, type Member } from '../api/client';
import { Trophy, Flame, Medal } from 'lucide-react';
import { cn } from '../lib/utils';

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => getLeaderboard(period),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const { data: memberStats } = useQuery({
    queryKey: ['member-stats', selectedMemberId],
    queryFn: () => getMemberStats(selectedMemberId!),
    enabled: !!selectedMemberId,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Trophy className="text-yellow-400" size={22} />
        Leaderboard
      </h2>

      {/* Period selector */}
      <div className="flex gap-1 bg-surface-raised border border-border rounded-lg p-1">
        {(['week', 'month', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
              period === p
                ? 'bg-primary-600 text-white'
                : 'text-text-muted hover:text-text'
            )}
          >
            {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Rankings */}
      <div className="space-y-2">
        {leaderboard.length === 0 ? (
          <p className="text-center text-text-muted py-8">No activity yet this period</p>
        ) : (
          leaderboard.map((entry: LeaderboardEntry, i: number) => (
            <button
              key={entry.member_id}
              onClick={() => setSelectedMemberId(entry.member_id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                selectedMemberId === entry.member_id
                  ? 'bg-primary-950/50 border-primary-500'
                  : 'bg-surface-raised border-border hover:border-primary-500/50'
              )}
            >
              {/* Rank */}
              <span className="w-8 text-center shrink-0">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                  <span className="text-text-muted font-bold">{i + 1}</span>
                )}
              </span>

              {/* Avatar */}
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: entry.avatar_color }}
              >
                {entry.name[0].toUpperCase()}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium">{entry.name}</div>
                <div className="text-xs text-text-muted">{entry.tasks_completed} tasks done</div>
              </div>

              {/* Points */}
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-primary-400">{entry.points}</div>
                <div className="text-xs text-text-muted">pts</div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Member detail */}
      {selectedMemberId && memberStats && (
        <div className="bg-surface-raised border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Flame className="text-orange-400" size={18} />
              <span className="text-sm">
                <span className="font-bold">{memberStats.current_streak}</span> day streak
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Medal className="text-primary-400" size={18} />
              <span className="text-sm">
                <span className="font-bold">
                  {memberStats.achievements.filter((a) => a.unlocked_at).length}
                </span> achievements
              </span>
            </div>
          </div>

          {/* Achievements */}
          <div>
            <h4 className="text-sm text-text-muted mb-2">Achievements</h4>
            <div className="grid grid-cols-2 gap-2">
              {memberStats.achievements.map((a) => (
                <div
                  key={a.key}
                  className={cn(
                    'p-2.5 rounded-lg border text-sm',
                    a.unlocked_at
                      ? 'bg-primary-950/30 border-primary-500/30'
                      : 'bg-surface border-border opacity-40'
                  )}
                >
                  <span className="text-lg mr-1.5">{a.icon}</span>
                  <span className="font-medium">{a.title}</span>
                  <p className="text-xs text-text-muted mt-0.5">{a.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
