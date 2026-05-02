import { View, Text, Pressable, ScrollView, RefreshControl, Alert, Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, getMembers, completeTask, skipTask, undoTask, triggerSOS, requestCheckin, getLocations, type TaskInstance, type Member, type MemberLocation } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { Check, SkipForward, Undo2, Flame, Star, CheckCircle, RefreshCw, ShieldAlert, MapPin, Send } from 'lucide-react-native';
import { format as formatDate } from 'date-fns';
import { EasyModeView } from '../../components/EasyModeView';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

export default function DashboardScreen() {
  const { member, household } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const isDisplay = member?.role === 'display';

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { start: today, end: today }],
    queryFn: () => getTasks({ start: today, end: today }),
  });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const isParent = member?.role === 'parent';

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    enabled: isParent,
    refetchInterval: 30_000,
  });

  const [checkinSent, setCheckinSent] = useState<number | null>(null);
  const checkinMut = useMutation({
    mutationFn: (memberId: number) => requestCheckin(memberId),
    onSuccess: (_data, memberId) => {
      setCheckinSent(memberId);
      setTimeout(() => setCheckinSent(null), 3000);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['members'] });
    if (isParent) await queryClient.invalidateQueries({ queryKey: ['locations'] });
    setRefreshing(false);
  }, [queryClient, isParent]);

  const completeMut = useMutation({
    mutationFn: (id: number) => completeTask(id, member!.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); queryClient.invalidateQueries({ queryKey: ['members'] }); },
  });
  const skipMut = useMutation({
    mutationFn: (id: number) => skipTask(id, member?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const undoMut = useMutation({
    mutationFn: (id: number) => undoTask(id, member?.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); queryClient.invalidateQueries({ queryKey: ['members'] }); },
  });

  const [sosSent, setSosSent] = useState(false);
  const [sosSending, setSosSending] = useState(false);

  const handleSOS = useCallback(() => {
    Alert.alert(
      'Send SOS Alert',
      'This will alert all household members. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            setSosSending(true);
            try {
              let latitude: number | undefined;
              let longitude: number | undefined;
              // Try to get location on web
              if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
                try {
                  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
                  );
                  latitude = pos.coords.latitude;
                  longitude = pos.coords.longitude;
                } catch {
                  // Location unavailable — send without it
                }
              }
              await triggerSOS({ latitude, longitude });
              setSosSent(true);
              setTimeout(() => setSosSent(false), 3000);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to send SOS');
            } finally {
              setSosSending(false);
            }
          },
        },
      ],
    );
  }, []);

  const myTasks = tasks.filter(t => t.assigned_to === member?.id);
  const otherTasks = tasks.filter(t => t.assigned_to !== member?.id);
  const allTasks = tasks; // For display mode — all tasks in one list
  const myPending = myTasks.filter(t => t.status === 'pending');
  const myCompleted = myTasks.filter(t => t.status === 'completed');
  const allPending = allTasks.filter(t => t.status === 'pending');
  const allCompleted = allTasks.filter(t => t.status === 'completed');
  const me = members.find((m: Member) => m.id === member?.id);

  // Group tasks by member for display mode
  const tasksByMember = isDisplay
    ? members
        .filter((m: Member) => m.role !== 'display')
        .map((m: Member) => ({
          member: m,
          tasks: tasks.filter(t => t.assigned_to === m.id),
        }))
        .filter(g => g.tasks.length > 0)
    : [];

  // Easy Mode — show simplified view for this user
  const isEasyMode = member?.easyMode && !isDisplay && !isParent;
  if (isEasyMode) {
    const myTasksEasy = tasks.filter(t => t.assigned_to === member?.id);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <EasyModeView
          memberName={member?.name || 'You'}
          memberColor={me?.avatar_color || C.primary}
          tasks={myTasksEasy}
          onComplete={(id) => completeMut.mutate(id)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: 'white' }}>
              Chore<Text style={{ color: C.primaryLight }}>Quest</Text>
            </Text>
            <Text style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>
              {household?.name}{isDisplay ? ' — Display' : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={onRefresh} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
              <RefreshCw size={16} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
            </Pressable>
            {!isDisplay && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>{me?.points_total ?? 0}</Text>
                <Text style={{ fontSize: 11, color: C.muted }}>points</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Display Mode View ─────────────────────────────────── */}
        {isDisplay ? (
          <>
            {/* Stats row for display mode */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {[
                { icon: <Flame size={20} color={C.warning} />, num: allPending.length, label: 'Pending' },
                { icon: <CheckCircle size={20} color={C.success} />, num: allCompleted.length, label: 'Done Today' },
                { icon: <Star size={20} color={C.primary} />, num: allTasks.length, label: 'Total Tasks' },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                  {s.icon}
                  <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginTop: 4 }}>{s.num}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Tasks grouped by member */}
            {tasksByMember.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
                <Text style={{ color: C.muted, fontSize: 14 }}>No tasks today!</Text>
              </View>
            ) : (
              tasksByMember.map(({ member: m, tasks: memberTasks }) => {
                const done = memberTasks.filter(t => t.status === 'completed').length;
                return (
                  <View key={m.id} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: m.avatar_color, alignItems: 'center', justifyContent: 'center',
                        marginRight: 10,
                      }}>
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                          {m.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: 'white', flex: 1 }}>{m.name}</Text>
                      <Text style={{ fontSize: 12, color: done === memberTasks.length ? C.success : C.muted }}>
                        {done}/{memberTasks.length} done
                      </Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      {memberTasks.map(t => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onComplete={() => completeMut.mutate(t.id)}
                          onSkip={() => skipMut.mutate(t.id)}
                          onUndo={() => undoMut.mutate(t.id)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* ── Normal View (non-display) ──────────────────────── */}

            {/* SOS Button */}
            <Pressable
              onPress={handleSOS}
              disabled={sosSending || sosSent}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                backgroundColor: sosSent ? '#16a34a' : '#dc2626',
                borderRadius: 12,
                paddingVertical: 14,
                marginBottom: 16,
                opacity: sosSending ? 0.6 : 1,
              }}
            >
              <ShieldAlert size={22} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', letterSpacing: 1 }}>
                {sosSent ? 'Alert Sent!' : sosSending ? 'Sending...' : 'SOS'}
              </Text>
            </Pressable>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {[
                { icon: <Flame size={20} color={C.warning} />, num: myPending.length, label: 'Pending' },
                { icon: <Star size={20} color={C.primary} />, num: me?.points_total ?? 0, label: 'Total Points' },
                { icon: <CheckCircle size={20} color={C.success} />, num: myCompleted.length, label: 'Done Today' },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                  {s.icon}
                  <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginTop: 4 }}>{s.num}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* My Tasks */}
            <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 12 }}>Today's Tasks</Text>
            {myTasks.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
                <Text style={{ color: C.muted, fontSize: 14 }}>No tasks today! Enjoy your free time.</Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginBottom: 24 }}>
                {myTasks.map(t => (
                  <TaskRow key={t.id} task={t} onComplete={() => completeMut.mutate(t.id)} onSkip={() => skipMut.mutate(t.id)} onUndo={() => undoMut.mutate(t.id)} />
                ))}
              </View>
            )}

            {/* Others */}
            {otherTasks.length > 0 && (
              <>
                <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 12, marginTop: 16 }}>Other Members</Text>
                <View style={{ gap: 8, marginBottom: 24 }}>
                  {otherTasks.map(t => (
                    <TaskRow key={t.id} task={t} onComplete={() => completeMut.mutate(t.id)} onSkip={() => skipMut.mutate(t.id)} onUndo={() => undoMut.mutate(t.id)} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Family Location (parents only) */}
        {isParent && !isDisplay && members.length > 1 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MapPin size={18} color={C.primaryLight} />
                <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginLeft: 8 }}>Family Location</Text>
              </View>
            </View>
            {/* Location list with map links */}
            {locations.length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 12 }}>
                {locations.map((l: MemberLocation, i: number) => {
                  const m = members.find((mb: Member) => mb.id === l.member_id);
                  return (
                    <Pressable
                      key={l.member_id}
                      onPress={() => { try { const { Linking } = require('react-native'); Linking.openURL(`https://www.google.com/maps?q=${l.latitude},${l.longitude}`); } catch {} }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', padding: 12,
                        ...(i < locations.length - 1 ? { borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.3)' } : {}),
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m?.avatar_color || C.primary, marginRight: 10 }} />
                      <Text style={{ fontSize: 13, color: '#e0e7ff', flex: 1 }}>{l.member_name}</Text>
                      <Text style={{ fontSize: 11, color: C.muted, marginRight: 8 }}>
                        {formatDate(new Date(l.updated_at), 'h:mm a')}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.primaryLight }}>Map</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={{ gap: 8, marginBottom: 32 }}>
              {members.filter((m: Member) => m.id !== member?.id).map((m: Member) => {
                const loc = locations.find((l: MemberLocation) => l.member_id === m.id);
                const isSent = checkinSent === m.id;
                return (
                  <View key={m.id} style={{
                    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border,
                  }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: m.avatar_color, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{m.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{m.name}</Text>
                      {loc ? (
                        <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`)}>
                          <Text style={{ fontSize: 11, color: C.primaryLight, marginTop: 2, textDecorationLine: 'underline' }}>
                            Last seen {formatDate(new Date(loc.updated_at), 'h:mm a')}
                            {loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : ''}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>No location shared</Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => !isSent && checkinMut.mutate(m.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: isSent ? C.success + '20' : C.primary + '20',
                      }}
                    >
                      {isSent ? (
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.success }}>Sent</Text>
                      ) : (
                        <>
                          <Send size={13} color={C.primaryLight} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: C.primaryLight }}>Check In</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({ task, onComplete, onSkip, onUndo }: { task: TaskInstance; onComplete: () => void; onSkip: () => void; onUndo: () => void }) {
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const isPending = task.status === 'pending';

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12,
      padding: 14, borderWidth: 1, borderColor: C.border, opacity: isDone ? 0.5 : isSkipped ? 0.4 : 1,
    }}>
      <Text style={{ fontSize: 20, marginRight: 12 }}>{task.icon || '📋'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: 'white', textDecorationLine: isDone || isSkipped ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          {task.assignee_name && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: task.assignee_color || C.primary, marginRight: 4 }} />
              <Text style={{ fontSize: 12, color: C.muted }}>{task.assignee_name}</Text>
            </View>
          )}
          <Text style={{ fontSize: 12, color: C.dim }}>{task.template_points}pt</Text>
        </View>
      </View>
      {isPending ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={onSkip} style={{ padding: 10, borderRadius: 8, backgroundColor: C.surface3 }}>
            <SkipForward size={16} color={C.muted} />
          </Pressable>
          <Pressable onPress={onComplete} style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(22,101,52,0.4)' }}>
            <Check size={16} color={C.success} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: isDone ? '#22c55e20' : '#64748b20' }}>
            <Text style={{ fontSize: 12, color: isDone ? C.success : '#64748b' }}>{isDone ? 'Done' : 'Skipped'}</Text>
          </View>
          <Pressable onPress={onUndo} style={{ padding: 8, borderRadius: 8 }}>
            <Undo2 size={14} color="#64748b" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
