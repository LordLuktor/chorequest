import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLeaderboard, getMemberStats, getAchievements,
  getCompletionRates, getTrends,
  type LeaderboardEntry, type MemberStats, type Achievement,
  type CompletionRate, type TrendEntry,
} from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { Trophy, Flame, Sunrise, Target, RefreshCw, BarChart3 } from 'lucide-react-native';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b', gold: '#eab308',
};

type Period = 'week' | 'month' | 'all';

export default function ScoresScreen() {
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => getLeaderboard(period),
  });

  const { data: stats } = useQuery({
    queryKey: ['memberStats', member?.id],
    queryFn: () => getMemberStats(member!.id),
    enabled: !!member,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ['achievements'],
    queryFn: getAchievements,
  });

  const isParent = member?.role === 'parent';

  const { data: completionRates = [] } = useQuery({
    queryKey: ['analytics', 'completion-rates'],
    queryFn: () => getCompletionRates(7),
    enabled: isParent,
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['analytics', 'trends'],
    queryFn: () => getTrends(7),
    enabled: isParent,
  });

  // Build weekly trend data: for each of the last 7 days, aggregate total completed / total possible
  const weeklyTrend = useMemo(() => {
    if (!completionRates.length) return [];
    const days: { label: string; date: string; completed: number; total: number }[] = [];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayTrends = trends.filter(t => t.date === dateStr);
      const completed = dayTrends.reduce((sum, t) => sum + t.tasks_completed, 0);
      days.push({ label: dayLabels[d.getDay()], date: dateStr, completed, total: Math.max(completed, 1) });
    }
    // Normalize bar heights: find max completed across the 7 days
    const maxCompleted = Math.max(...days.map(d => d.completed), 1);
    return days.map(d => ({ ...d, height: Math.max((d.completed / maxCompleted) * 80, 4) }));
  }, [trends, completionRates]);

  // Per-member activity summary from completion rates + trends
  const memberActivity = useMemo(() => {
    return completionRates.map(cr => {
      const memberTrends = trends.filter(t => t.member_id === cr.member_id);
      const totalPoints = memberTrends.reduce((sum, t) => sum + t.points, 0);
      return { ...cr, points: totalPoints };
    });
  }, [completionRates, trends]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    await queryClient.invalidateQueries({ queryKey: ['memberStats'] });
    if (isParent) {
      await queryClient.invalidateQueries({ queryKey: ['analytics'] });
    }
    setRefreshing(false);
  }, [queryClient, isParent]);

  const medalColors = ['#eab308', '#94a3b8', '#cd7f32'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: 'white' }}>Leaderboard</Text>
          <Pressable onPress={onRefresh} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
            <RefreshCw size={16} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
          </Pressable>
        </View>

        {/* Period switcher */}
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 10, padding: 3, marginBottom: 20, borderWidth: 1, borderColor: C.border }}>
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                backgroundColor: period === p ? C.primary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: period === p ? 'white' : C.muted, textTransform: 'capitalize' }}>
                {p === 'all' ? 'All Time' : `This ${p.charAt(0).toUpperCase() + p.slice(1)}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Leaderboard */}
        {leaderboard.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Trophy size={40} color={C.border} />
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 12 }}>No scores yet. Complete some chores!</Text>
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 24 }}>
            {leaderboard.map((entry: LeaderboardEntry, i: number) => (
              <View
                key={entry.member_id}
                style={{
                  flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                  borderRadius: 12, padding: 14, borderWidth: 1,
                  borderColor: entry.member_id === member?.id ? C.primary : C.border,
                }}
              >
                <View style={{
                  width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: i < 3 ? medalColors[i] + '20' : C.surface3, marginRight: 12,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: i < 3 ? medalColors[i] : C.muted }}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: entry.avatar_color, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{entry.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{entry.name}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>{entry.tasks_completed} tasks</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>{entry.points}</Text>
                <Text style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>pts</Text>
              </View>
            ))}
          </View>
        )}

        {/* My Stats */}
        {stats && (
          <>
            <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 12 }}>My Stats</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {[
                { icon: <Flame size={18} color={C.warning} />, val: stats.current_streak, label: 'Streak' },
                { icon: <Target size={18} color={C.primary} />, val: stats.total_completed, label: 'Completed' },
                { icon: <Sunrise size={18} color={C.gold} />, val: stats.early_bird_count, label: 'Early Birds' },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                  {s.icon}
                  <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginTop: 4 }}>{s.val}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Achievements */}
        {stats?.achievements && stats.achievements.length > 0 && (
          <>
            <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 12 }}>Achievements</Text>
            <View style={{ gap: 8, marginBottom: 32 }}>
              {stats.achievements.filter(a => a.unlocked_at).map((ach) => (
                <View key={ach.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: 28, marginRight: 12 }}>{ach.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{ach.title}</Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>{ach.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Parent Analytics Section ─────────────────────────────── */}
        {isParent && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
              <BarChart3 size={20} color={C.primaryLight} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginLeft: 8 }}>Analytics</Text>
              <Text style={{ fontSize: 12, color: C.dim, marginLeft: 8 }}>Last 7 days</Text>
            </View>

            {/* Completion Rates */}
            {completionRates.length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 12 }}>Completion Rates</Text>
                <View style={{ gap: 12 }}>
                  {completionRates.map((cr) => {
                    const pct = Number(cr.rate) || 0;
                    const barColor = pct >= 80 ? C.success : pct >= 50 ? C.warning : C.danger;
                    return (
                      <View key={cr.member_id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: cr.avatar_color, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                              <Text style={{ color: 'white', fontWeight: '700', fontSize: 11 }}>{cr.name.charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={{ fontSize: 13, color: C.text }}>{cr.name}</Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: barColor }}>{pct}%</Text>
                        </View>
                        {/* Progress bar track */}
                        <View style={{ height: 8, backgroundColor: C.surface3, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: 8, borderRadius: 4, backgroundColor: barColor, width: `${Math.min(pct, 100)}%` }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Weekly Trend */}
            {weeklyTrend.length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 12 }}>Weekly Trend</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 }}>
                  {weeklyTrend.map((day, i) => {
                    const isToday = i === weeklyTrend.length - 1;
                    const barColor = day.completed === 0 ? C.surface3 : isToday ? C.primaryLight : C.primary;
                    return (
                      <View key={day.date} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{day.completed > 0 ? day.completed : ''}</Text>
                        <View style={{ width: 20, height: day.height, backgroundColor: barColor, borderRadius: 4 }} />
                        <Text style={{ fontSize: 10, color: isToday ? C.primaryLight : C.dim, marginTop: 4, fontWeight: isToday ? '700' : '400' }}>
                          {day.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Member Activity Summary */}
            {memberActivity.length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 32 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 12 }}>Member Activity</Text>
                <View style={{ gap: 10 }}>
                  {memberActivity.map((ma) => (
                    <View key={ma.member_id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ma.avatar_color, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>{ma.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: C.text }}>{ma.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', marginRight: 16 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>{ma.completed}</Text>
                        <Text style={{ fontSize: 10, color: C.muted }}>tasks</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: C.gold }}>{ma.points}</Text>
                        <Text style={{ fontSize: 10, color: C.muted }}>pts</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* TODO: Push notifications - install expo-notifications for native push support.
                expo-notifications requires native module linking and cannot be used in web-only builds.
                When ready for native builds, run: npx expo install expo-notifications
                Then integrate with the notification preferences in Settings. */}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
