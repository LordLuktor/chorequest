import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, completeTask, skipTask, undoTask, type TaskInstance } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useMemo, useCallback } from 'react';
import {
  format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, addWeeks, subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Check, SkipForward, Undo2 } from 'lucide-react-native';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

type CalendarView = 'week' | 'month';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Fetch a range that covers the visible grid
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return {
        rangeStart: format(startOfWeek(ms), 'yyyy-MM-dd'),
        rangeEnd: format(addDays(endOfWeek(me), 1), 'yyyy-MM-dd'),
      };
    }
    const ws = startOfWeek(currentDate);
    return {
      rangeStart: format(ws, 'yyyy-MM-dd'),
      rangeEnd: format(addDays(ws, 7), 'yyyy-MM-dd'),
    };
  }, [view, currentDate]);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { start: rangeStart, end: rangeEnd }],
    queryFn: () => getTasks({ start: rangeStart, end: rangeEnd }),
  });

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskInstance[]>();
    for (const task of tasks) {
      const key = task.due_date.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return map;
  }, [tasks]);

  // Selected day's tasks
  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedTasks = tasksByDate.get(selectedKey) || [];
  const pendingTasks = selectedTasks.filter(t => t.status === 'pending');
  const doneTasks = selectedTasks.filter(t => t.status !== 'pending');

  // Build week rows for the grid
  const weeks = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const cs = startOfWeek(ms);
      const ce = endOfWeek(me);
      const result: Date[][] = [];
      let day = cs;
      while (day <= ce) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
        result.push(week);
      }
      return result;
    }
    const ws = startOfWeek(currentDate);
    return [[...Array(7)].map((_, i) => addDays(ws, i))];
  }, [view, currentDate]);

  const goPrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const goNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };
  const goToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const headerLabel = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    setRefreshing(false);
  }, [queryClient]);

  const completeMut = useMutation({
    mutationFn: (id: number) => completeTask(id, member!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
  const skipMut = useMutation({
    mutationFn: (id: number) => skipTask(id, member?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const undoMut = useMutation({
    mutationFn: (id: number) => undoTask(id, member?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: 'white' }}>Calendar</Text>
          <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: C.border }}>
            {(['week', 'month'] as CalendarView[]).map(v => (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 7,
                  backgroundColor: view === v ? C.primary : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: view === v ? 'white' : C.muted, textTransform: 'capitalize' }}>{v}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Navigation */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={goPrev} style={{ padding: 8 }}>
            <ChevronLeft size={22} color={C.muted} />
          </Pressable>
          <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>{headerLabel}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable onPress={goToday} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: C.surface3 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.primaryLight }}>Today</Text>
            </Pressable>
            <Pressable onPress={goNext} style={{ padding: 8 }}>
              <ChevronRight size={22} color={C.muted} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Weekday headers */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 8, marginBottom: 4 }}>
        {WEEKDAYS.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.dim, letterSpacing: 0.5 }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={{ paddingHorizontal: 16 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row', marginBottom: view === 'week' ? 0 : 2 }}>
            {week.map((day, di) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate.get(key) || [];
              const inMonth = view === 'week' || isSameMonth(day, currentDate);
              const today = isToday(day);
              const selected = isSameDay(day, selectedDate);
              const pendingCount = dayTasks.filter(t => t.status === 'pending').length;
              const doneCount = dayTasks.filter(t => t.status === 'completed').length;

              // Unique assignee colors for dots
              const colors = [...new Set(dayTasks.map(t => t.assignee_color || C.primary))];

              return (
                <Pressable
                  key={di}
                  onPress={() => setSelectedDate(day)}
                  style={{
                    flex: 1, alignItems: 'center',
                    paddingVertical: view === 'week' ? 10 : 6,
                    marginHorizontal: 1,
                    borderRadius: 12,
                    backgroundColor: selected ? `${C.primary}25` : 'transparent',
                    borderWidth: selected ? 1 : 0,
                    borderColor: selected ? `${C.primary}60` : 'transparent',
                  }}
                >
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: today ? C.primary : 'transparent',
                  }}>
                    <Text style={{
                      fontSize: 14, fontWeight: today || selected ? '700' : '400',
                      color: today ? 'white' : !inMonth ? '#3a3758' : selected ? C.primaryLight : C.text,
                    }}>
                      {format(day, 'd')}
                    </Text>
                  </View>

                  {/* Task dots */}
                  {dayTasks.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: 3, marginTop: 4, height: 6, alignItems: 'center' }}>
                      {colors.slice(0, 3).map((c, i) => (
                        <View key={i} style={{
                          width: 6, height: 6, borderRadius: 3,
                          backgroundColor: c,
                          opacity: doneCount === dayTasks.length ? 0.35 : 0.85,
                        }} />
                      ))}
                      {colors.length > 3 && (
                        <Text style={{ fontSize: 8, color: C.dim, marginLeft: -1 }}>+</Text>
                      )}
                    </View>
                  ) : (
                    <View style={{ height: 10 }} />
                  )}

                  {/* Pending badge for week view */}
                  {view === 'week' && pendingCount > 0 && (
                    <View style={{
                      marginTop: 3, paddingHorizontal: 6, paddingVertical: 1,
                      borderRadius: 8, backgroundColor: `${C.primary}20`,
                    }}>
                      <Text style={{ fontSize: 10, color: C.primaryLight, fontWeight: '600' }}>
                        {pendingCount} left
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Selected day agenda */}
      <View style={{
        flex: 1, marginTop: 12, borderTopWidth: 1, borderTopColor: C.border,
        backgroundColor: C.bg,
      }}>
        {/* Agenda header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>
            {isToday(selectedDate)
              ? 'Today'
              : isSameDay(selectedDate, addDays(new Date(), 1))
                ? 'Tomorrow'
                : format(selectedDate, 'EEEE, MMM d')}
          </Text>
          {selectedTasks.length > 0 && (
            <Text style={{ fontSize: 12, color: C.muted }}>
              {doneTasks.length}/{selectedTasks.length} done
            </Text>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
        >
          {selectedTasks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>
                {isToday(selectedDate) ? '🎉' : '📅'}
              </Text>
              <Text style={{ color: C.muted, fontSize: 14 }}>
                {isToday(selectedDate) ? 'No tasks today!' : 'Nothing scheduled.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {pendingTasks.length > 0 && pendingTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => completeMut.mutate(task.id)}
                  onSkip={() => skipMut.mutate(task.id)}
                />
              ))}

              {doneTasks.length > 0 && (
                <>
                  {pendingTasks.length > 0 && (
                    <Text style={{ fontSize: 12, color: C.dim, marginTop: 8, marginBottom: 2 }}>Completed</Text>
                  )}
                  {doneTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onUndo={() => undoMut.mutate(task.id)}
                    />
                  ))}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
    </SafeAreaView>
  );
}

function TaskCard({ task, onComplete, onSkip, onUndo }: {
  task: TaskInstance;
  onComplete?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
}) {
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const isPending = task.status === 'pending';

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 12,
      padding: 14, borderWidth: 1, borderColor: C.border,
      opacity: isDone ? 0.5 : isSkipped ? 0.4 : 1,
    }}>
      <Text style={{ fontSize: 20, marginRight: 12 }}>{task.icon || '📋'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 14, fontWeight: '500', color: 'white',
          textDecorationLine: isDone || isSkipped ? 'line-through' : 'none',
        }}>
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          {task.assignee_name && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: task.assignee_color || C.primary, marginRight: 4 }} />
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
          <View style={{
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
            backgroundColor: isDone ? '#22c55e20' : '#64748b20',
          }}>
            <Text style={{ fontSize: 12, color: isDone ? C.success : '#64748b' }}>
              {isDone ? 'Done' : 'Skipped'}
            </Text>
          </View>
          <Pressable onPress={onUndo} style={{ padding: 8, borderRadius: 8 }}>
            <Undo2 size={14} color="#64748b" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
