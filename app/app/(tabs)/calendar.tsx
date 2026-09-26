import { View, Text, Pressable, ScrollView, RefreshControl, Modal } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTasks, completeTask, skipTask, undoTask, type TaskInstance,
  getEvents, getMembers, cancelEventOccurrence, deleteEvent, type CalendarEvent, type CalendarEventOccurrence,
  getMenuSelections, getMenuItems, setMenuSelection, clearMenuSelection, type Member, type MenuItem,
} from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useMemo, useCallback } from 'react';
import {
  format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isSameMonth, isSameDay, isToday, isWeekend, addMonths, subMonths, addWeeks, subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Check, SkipForward, Plus, Pencil, Trash2, Ban, RotateCcw, Coffee, Sandwich } from 'lucide-react-native';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';
import EventFormModal from '../../components/EventFormModal';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${meridiem}`;
}

type CalendarView = 'week' | 'month';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const tabBarPadding = useTabBarPadding();
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

  const { data: events = [] } = useQuery({
    queryKey: ['events', { start: rangeStart, end: rangeEnd }],
    queryFn: () => getEvents({ start: rangeStart, end: rangeEnd }),
  });

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const isParent = member?.role === 'parent';
  const isDisplay = member?.role === 'display';
  const { data: menuSelections = [] } = useQuery({
    queryKey: ['menuSelections', member?.id, rangeStart, rangeEnd],
    queryFn: () => getMenuSelections({ start: rangeStart, end: rangeEnd }),
    enabled: !isParent,
  });

  // Breakfast picker — tap a breakfast row anywhere on the calendar to pick/change it
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const insets = useSafeAreaInsets();
  const [breakfastPickerFor, setBreakfastPickerFor] = useState<{ memberId: number; memberName: string; date: string } | null>(null);
  const { data: pickerBreakfastItems = [] } = useQuery({
    queryKey: ['menuItems', 'breakfast', breakfastPickerFor?.memberId],
    queryFn: () => getMenuItems({ meal_slot: 'breakfast', member: breakfastPickerFor!.memberId }),
    enabled: !!breakfastPickerFor,
  });
  const setBreakfastMut = useMutation({
    mutationFn: (data: { member_id: number; date: string; menu_item_id: number }) =>
      setMenuSelection({ member_id: data.member_id, date: data.date, meal_slot: 'breakfast', menu_item_id: data.menu_item_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuSelections'] });
      setBreakfastPickerFor(null);
    },
  });
  const clearBreakfastMut = useMutation({
    mutationFn: (data: { member_id: number; date: string }) => clearMenuSelection({ member_id: data.member_id, date: data.date, meal_slot: 'breakfast' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuSelections'] });
      setBreakfastPickerFor(null);
    },
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventOccurrence[]>();
    for (const occurrence of events) {
      const key = occurrence.occurrence_date.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(occurrence);
    }
    return map;
  }, [events]);

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>(undefined);

  const openNewEvent = useCallback(() => { setEditingEvent(undefined); setShowEventForm(true); }, []);
  const openEditEvent = useCallback((occurrence: CalendarEventOccurrence) => {
    setEditingEvent({
      id: occurrence.event_id,
      title: occurrence.title,
      description: occurrence.description,
      icon: occurrence.icon,
      assigned_to: occurrence.assignees.map(a => a.id),
      event_date: occurrence.series_start_date,
      event_time: occurrence.event_time,
      end_time: occurrence.end_time,
      recurrence_rule: occurrence.recurrence_rule,
      recurrence_end_date: occurrence.recurrence_end_date,
      reminder_minutes_before: occurrence.reminder_minutes_before,
    });
    setShowEventForm(true);
  }, []);

  // Selected day's tasks
  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedTasks = tasksByDate.get(selectedKey) || [];
  const selectedBreakfast = menuSelections.find(s => s.date === selectedKey && s.meal_slot === 'breakfast' && s.member_id === member?.id);
  const selectedLunch = menuSelections.find(s => s.date === selectedKey && s.meal_slot === 'lunch' && s.member_id === member?.id);
  const showMenuCard = !isParent && !isWeekend(selectedDate);
  const displayMenuKids = isDisplay ? members.filter((m: Member) => m.role === 'child') : [];
  const pendingTasks = selectedTasks.filter(t => t.status === 'pending');
  const doneTasks = selectedTasks.filter(t => t.status !== 'pending');

  // Selected day's events, all-day first, then by time
  const selectedEvents = useMemo(() => {
    const list = eventsByDate.get(selectedKey) || [];
    return [...list].sort((a, b) => {
      if (!a.event_time && !b.event_time) return 0;
      if (!a.event_time) return -1;
      if (!b.event_time) return 1;
      return a.event_time.localeCompare(b.event_time);
    });
  }, [eventsByDate, selectedKey]);

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

  const toggleEventCancelMut = useMutation({
    mutationFn: (instanceId: number) => cancelEventOccurrence(instanceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });
  const deleteEventMut = useMutation({
    mutationFn: (eventId: number) => deleteEvent(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
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
              const dayEvents = (eventsByDate.get(key) || []).filter(e => !e.is_cancelled);
              const inMonth = view === 'week' || isSameMonth(day, currentDate);
              const today = isToday(day);
              const selected = isSameDay(day, selectedDate);
              const pendingCount = dayTasks.filter(t => t.status === 'pending').length;
              const doneCount = dayTasks.filter(t => t.status === 'completed').length;

              // Unique assignee colors for dots
              const colors = [...new Set(dayTasks.map(t => t.assignee_color || C.primary))];
              const eventColors = [...new Set(dayEvents.flatMap(e => e.assignees.length > 0 ? e.assignees.map(a => a.color) : [C.primaryLight]))];

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

                  {/* Task + event dots */}
                  {dayTasks.length > 0 || dayEvents.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: 3, marginTop: 4, height: 6, alignItems: 'center' }}>
                      {colors.slice(0, 3).map((c, i) => (
                        <View key={`t${i}`} style={{
                          width: 6, height: 6, borderRadius: 3,
                          backgroundColor: c,
                          opacity: doneCount === dayTasks.length ? 0.35 : 0.85,
                        }} />
                      ))}
                      {colors.length > 3 && (
                        <Text style={{ fontSize: 8, color: C.dim, marginLeft: -1 }}>+</Text>
                      )}
                      {eventColors.slice(0, 3).map((c, i) => (
                        <View key={`e${i}`} style={{
                          width: 6, height: 6, borderRadius: 1,
                          backgroundColor: c,
                          opacity: 0.9,
                        }} />
                      ))}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {selectedTasks.length > 0 && (
              <Text style={{ fontSize: 12, color: C.muted }}>
                {doneTasks.length}/{selectedTasks.length} done
              </Text>
            )}
            <Pressable
              onPress={openNewEvent}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.primary }}
            >
              <Plus size={14} color="white" />
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '500' }}>Event</Text>
            </Pressable>
          </View>
        </View>

        {showMenuCard && (
          isDisplay ? (
            <View style={{ marginHorizontal: 20, marginBottom: 10, gap: 8 }}>
              {displayMenuKids.map((m: Member) => {
                const breakfast = menuSelections.find(s => s.date === selectedKey && s.meal_slot === 'breakfast' && s.member_id === m.id);
                const lunch = menuSelections.find(s => s.date === selectedKey && s.meal_slot === 'lunch' && s.member_id === m.id);
                return (
                  <View key={m.id} style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, width: 64 }} numberOfLines={1}>{m.name}</Text>
                    <Pressable
                      disabled={selectedKey < todayStr}
                      onPress={() => setBreakfastPickerFor({ memberId: m.id, memberName: m.name, date: selectedKey })}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Coffee size={14} color={C.primaryLight} />
                      <Text style={{ fontSize: 12, color: breakfast ? C.text : C.dim, marginLeft: 6 }} numberOfLines={1}>
                        {breakfast ? breakfast.item_name : 'No breakfast set'}
                      </Text>
                    </Pressable>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <Sandwich size={14} color={C.primaryLight} />
                      <Text style={{ fontSize: 12, color: lunch ? C.text : C.dim, marginLeft: 6 }} numberOfLines={1}>
                        {lunch ? lunch.item_name : 'No lunch set'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{
              flexDirection: 'row', marginHorizontal: 20, marginBottom: 10,
              backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border,
            }}>
              <Pressable
                disabled={selectedKey < todayStr || !member}
                onPress={() => member && setBreakfastPickerFor({ memberId: member.id, memberName: member.name, date: selectedKey })}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              >
                <Coffee size={16} color={C.primaryLight} />
                <Text style={{ fontSize: 13, color: selectedBreakfast ? C.text : C.dim, marginLeft: 8 }} numberOfLines={1}>
                  {selectedBreakfast ? selectedBreakfast.item_name : 'No breakfast set'}
                </Text>
              </Pressable>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Sandwich size={16} color={C.primaryLight} />
                <Text style={{ fontSize: 13, color: selectedLunch ? C.text : C.dim, marginLeft: 8 }} numberOfLines={1}>
                  {selectedLunch ? selectedLunch.item_name : 'No lunch set'}
                </Text>
              </View>
            </View>
          )
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarPadding }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
        >
          {selectedTasks.length === 0 && selectedEvents.length === 0 ? (
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
              {selectedEvents.length > 0 && (
                <View style={{ gap: 8, marginBottom: 4 }}>
                  {selectedEvents.map(occurrence => (
                    <EventCard
                      key={occurrence.instance_id}
                      occurrence={occurrence}
                      onToggleCancel={() => toggleEventCancelMut.mutate(occurrence.instance_id)}
                      onEdit={() => openEditEvent(occurrence)}
                      onDelete={() => deleteEventMut.mutate(occurrence.event_id)}
                    />
                  ))}
                </View>
              )}

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

    <EventFormModal
      visible={showEventForm}
      onClose={() => setShowEventForm(false)}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['events'] })}
      members={members}
      event={editingEvent}
    />

    {/* ── Breakfast picker ───────────────────────────────────────── */}
    <Modal visible={!!breakfastPickerFor} transparent animationType="slide" onRequestClose={() => setBreakfastPickerFor(null)}>
      <Pressable onPress={() => setBreakfastPickerFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 + insets.bottom, maxHeight: '70%',
        }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 16, textAlign: 'center' }}>
            {breakfastPickerFor?.memberName}'s Breakfast
          </Text>
          {breakfastPickerFor && menuSelections.find(s => s.date === breakfastPickerFor.date && s.meal_slot === 'breakfast' && s.member_id === breakfastPickerFor.memberId) && (
            <Pressable
              disabled={clearBreakfastMut.isPending}
              onPress={() => breakfastPickerFor && clearBreakfastMut.mutate({ member_id: breakfastPickerFor.memberId, date: breakfastPickerFor.date })}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: 12, marginBottom: 12,
              }}
            >
              <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>
                {clearBreakfastMut.isPending ? 'Clearing…' : 'Clear this breakfast'}
              </Text>
            </Pressable>
          )}
          <ScrollView style={{ maxHeight: 360 }}>
            {pickerBreakfastItems.length === 0 ? (
              <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 20 }}>No breakfast items set up yet — add some from the Menu tab.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {pickerBreakfastItems.map((item: MenuItem) => {
                  const exhausted = item.remaining === 0;
                  return (
                    <Pressable
                      key={item.id}
                      disabled={exhausted || setBreakfastMut.isPending}
                      onPress={() => {
                        if (!breakfastPickerFor) return;
                        setBreakfastMut.mutate({ member_id: breakfastPickerFor.memberId, date: breakfastPickerFor.date, menu_item_id: item.id });
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: C.surface3, borderRadius: 10, padding: 14,
                        opacity: exhausted ? 0.4 : 1,
                      }}
                    >
                      <Text style={{ color: 'white', fontSize: 14 }}>{item.name}</Text>
                      {item.remaining !== null && item.remaining !== undefined && (
                        <Text style={{ color: exhausted ? C.danger : C.dim, fontSize: 12 }}>
                          {exhausted ? 'Used up this week' : `${item.remaining} left this week`}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
    </SafeAreaView>
  );
}

function EventCard({ occurrence, onToggleCancel, onEdit, onDelete }: {
  occurrence: CalendarEventOccurrence;
  onToggleCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCancelled = occurrence.is_cancelled;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 12,
      padding: 14, borderWidth: 1, borderColor: C.primaryLight + '40',
      opacity: isCancelled ? 0.5 : 1,
    }}>
      <Text style={{ fontSize: 20, marginRight: 12 }}>{occurrence.icon || '📅'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 14, fontWeight: '500', color: 'white',
          textDecorationLine: isCancelled ? 'line-through' : 'none',
        }}>
          {occurrence.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8, flexWrap: 'wrap' }}>
          {occurrence.assignees.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a.color }} />
              <Text style={{ fontSize: 12, color: C.muted }}>{a.name}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 12, color: C.dim }}>
            {occurrence.event_time ? formatTime12h(occurrence.event_time.slice(0, 5)) : 'All day'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={onToggleCancel} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
          {isCancelled ? <RotateCcw size={14} color={C.muted} /> : <Ban size={14} color={C.muted} />}
        </Pressable>
        <Pressable onPress={onEdit} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
          <Pencil size={14} color={C.muted} />
        </Pressable>
        <Pressable onPress={onDelete} style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' }}>
          <Trash2 size={14} color={C.danger} />
        </Pressable>
      </View>
    </View>
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
        <Pressable onPress={onUndo} style={{
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
          backgroundColor: isDone ? '#22c55e20' : '#64748b20',
        }}>
          <Text style={{ fontSize: 12, color: isDone ? C.success : '#64748b' }}>
            {isDone ? 'Done · tap to undo' : 'Skipped · tap to undo'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
