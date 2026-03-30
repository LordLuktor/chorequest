import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, getMembers, completeTask, skipTask, undoTask, type TaskInstance, type Member } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { Check, SkipForward, Undo2, Flame, Star, CheckCircle, RefreshCw } from 'lucide-react-native';

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

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { start: today, end: today }],
    queryFn: () => getTasks({ start: today, end: today }),
  });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['members'] });
    setRefreshing(false);
  }, [queryClient]);

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

  const myTasks = tasks.filter(t => t.assigned_to === member?.id);
  const otherTasks = tasks.filter(t => t.assigned_to !== member?.id);
  const myPending = myTasks.filter(t => t.status === 'pending');
  const myCompleted = myTasks.filter(t => t.status === 'completed');
  const me = members.find((m: Member) => m.id === member?.id);

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
            <Text style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{household?.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={onRefresh} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
              <RefreshCw size={16} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
            </Pressable>
            <View style={{ backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>{me?.points_total ?? 0}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>points</Text>
            </View>
          </View>
        </View>

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
            <View style={{ gap: 8, marginBottom: 32 }}>
              {otherTasks.map(t => (
                <TaskRow key={t.id} task={t} onComplete={() => completeMut.mutate(t.id)} onSkip={() => skipMut.mutate(t.id)} onUndo={() => undoMut.mutate(t.id)} />
              ))}
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
