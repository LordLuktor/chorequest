import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, CalendarDays } from 'lucide-react-native';
import { format } from 'date-fns';
import { createEvent, updateEvent, type CalendarEvent, type Member } from '../lib/api';
import MiniCalendarPicker from './MiniCalendarPicker';
import TimeInput from './TimeInput';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const ICONS = ['📅', '🏥', '🦷', '🎓', '🎉', '✈️', '🎂', '👨‍👩‍👧‍👦', '🚗', '⚽', '🎵', '📌'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const REMINDER_OPTIONS: { label: string; value: number }[] = [
  { label: '15 min before', value: 15 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
];

interface EventFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  event?: CalendarEvent;
}

function buildRecurrenceRule(selectedDays: number[]): string | null {
  if (selectedDays.length === 0) return null;
  const activeDays = [...selectedDays].sort((a, b) => a - b).map(d => DAY_CODES[d]);
  return `FREQ=WEEKLY;BYDAY=${activeDays.join(',')}`;
}

function parseRecurrenceDays(rule: string | null | undefined): number[] {
  if (!rule) return [];
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return [];
  return match[1].split(',').map(code => DAY_CODES.indexOf(code)).filter(i => i >= 0);
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateLabel(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return format(new Date(`${key}T00:00:00`), 'EEE, MMM d, yyyy');
}

function toggleInArray(arr: number[], value: number): number[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

export default function EventFormModal({ visible, onClose, onSaved, members, event }: EventFormModalProps) {
  const isEditing = !!event;

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [eventTime, setEventTime] = useState<string | null>(null);
  const [repeats, setRepeats] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [selectedReminders, setSelectedReminders] = useState<number[]>([]);
  const [pickerFor, setPickerFor] = useState<'event' | 'until' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (event) {
        setTitle(event.title);
        setIcon(event.icon || null);
        setEventDate(event.event_date.split('T')[0]);
        setAllDay(!event.event_time);
        setEventTime(event.event_time ? event.event_time.slice(0, 5) : null);
        const days = parseRecurrenceDays(event.recurrence_rule);
        setRepeats(days.length > 0);
        setSelectedDays(days);
        setRecurrenceEndDate(event.recurrence_end_date ? event.recurrence_end_date.split('T')[0] : '');
        setSelectedMemberIds(event.assigned_to);
        setSelectedReminders(event.reminder_minutes_before);
      } else {
        setTitle('');
        setIcon(null);
        setEventDate(todayISO());
        setAllDay(true);
        setEventTime(null);
        setRepeats(false);
        setSelectedDays([]);
        setRecurrenceEndDate('');
        setSelectedMemberIds([]);
        setSelectedReminders([]);
      }
      setPickerFor(null);
      setError(null);
      setSaving(false);
    }
  }, [visible, event]);

  const toggleDay = useCallback((day: number) => {
    setSelectedDays(prev => toggleInArray(prev, day));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Event name is required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setError('Pick a date.');
      return;
    }
    if (!allDay && !eventTime) {
      setError('Pick a time, or turn on All Day.');
      return;
    }
    if (repeats && selectedDays.length === 0) {
      setError('Pick at least one day for a repeating event.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: trimmed,
        icon,
        event_date: eventDate,
        event_time: allDay ? null : eventTime,
        recurrence_rule: repeats ? buildRecurrenceRule(selectedDays) : null,
        recurrence_end_date: repeats && recurrenceEndDate ? recurrenceEndDate : null,
        assigned_to: selectedMemberIds,
        reminder_minutes_before: selectedReminders,
      };

      if (isEditing && event) {
        await updateEvent(event.id, payload);
      } else {
        await createEvent(payload);
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }, [title, icon, eventDate, allDay, eventTime, repeats, selectedDays, recurrenceEndDate, selectedMemberIds, selectedReminders, isEditing, event, onSaved, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent={Platform.OS === 'web'} statusBarTranslucent>
      <View style={{
        flex: 1,
        backgroundColor: C.bg,
        ...(Platform.OS === 'web' ? {
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
        } : {}),
      }}>
        <SafeAreaView edges={['top', 'bottom']} style={{
          flex: Platform.OS === 'web' ? undefined : 1,
          width: '100%',
          maxWidth: Platform.OS === 'web' ? 500 : undefined,
          maxHeight: Platform.OS === 'web' ? '90%' : undefined,
          backgroundColor: C.bg,
          borderRadius: Platform.OS === 'web' ? 16 : 0,
          borderWidth: Platform.OS === 'web' ? 1 : 0,
          borderColor: C.border,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff' }}>
              {isEditing ? 'Edit Event' : 'New Event'}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4, borderRadius: 8 }}>
              <X size={20} color={C.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Event Name</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Dentist appointment"
                placeholderTextColor={C.dim}
                maxLength={150}
                style={{
                  backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text,
                }}
              />
            </View>

            {/* Icon picker */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Icon</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ICONS.map(emoji => (
                  <Pressable
                    key={emoji}
                    onPress={() => setIcon(icon === emoji ? null : emoji)}
                    style={{
                      width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: icon === emoji ? C.primary : C.card,
                      borderWidth: 1, borderColor: icon === emoji ? C.primaryLight : C.border,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Date</Text>
              <Pressable
                onPress={() => setPickerFor('event')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
                  paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start',
                }}
              >
                <CalendarDays size={16} color={C.primaryLight} />
                <Text style={{ fontSize: 15, color: C.text }}>
                  {eventDate ? formatDateLabel(eventDate) : 'Pick a date'}
                </Text>
              </Pressable>
            </View>

            {/* All day toggle + time */}
            <View>
              <Pressable
                onPress={() => setAllDay(!allDay)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: allDay ? 0 : 10 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: allDay ? C.primary : C.card, borderWidth: 1,
                  borderColor: allDay ? C.primaryLight : C.border,
                }}>
                  {allDay && <Text style={{ fontSize: 12, color: '#ffffff' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 14, color: C.text }}>All day</Text>
              </Pressable>
              {!allDay && <TimeInput value={eventTime} onChange={setEventTime} />}
            </View>

            {/* Repeats toggle + day chips */}
            <View>
              <Pressable
                onPress={() => setRepeats(!repeats)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: repeats ? 10 : 0 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: repeats ? C.primary : C.card, borderWidth: 1,
                  borderColor: repeats ? C.primaryLight : C.border,
                }}>
                  {repeats && <Text style={{ fontSize: 12, color: '#ffffff' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 14, color: C.text }}>Repeats weekly</Text>
              </Pressable>

              {repeats && (
                <>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                    {DAYS.map((label, i) => (
                      <Pressable
                        key={i}
                        onPress={() => toggleDay(i)}
                        style={{
                          width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: selectedDays.includes(i) ? C.primary : C.card,
                          borderWidth: 1, borderColor: selectedDays.includes(i) ? C.primaryLight : C.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selectedDays.includes(i) ? '#ffffff' : C.muted }}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Repeat until (optional)</Text>
                  <Pressable
                    onPress={() => setPickerFor('until')}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
                      paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start',
                    }}
                  >
                    <CalendarDays size={16} color={C.primaryLight} />
                    <Text style={{ fontSize: 15, color: recurrenceEndDate ? C.text : C.dim }}>
                      {recurrenceEndDate ? formatDateLabel(recurrenceEndDate) : 'No end date'}
                    </Text>
                    {recurrenceEndDate !== '' && (
                      <Pressable onPress={() => setRecurrenceEndDate('')} style={{ marginLeft: 4 }}>
                        <X size={14} color={C.muted} />
                      </Pressable>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            {/* Assign to (multi-select) */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Assign To</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Pressable
                  onPress={() => setSelectedMemberIds([])}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
                    backgroundColor: selectedMemberIds.length === 0 ? C.primary : C.card,
                    borderWidth: 1, borderColor: selectedMemberIds.length === 0 ? C.primaryLight : C.border,
                  }}
                >
                  <Text style={{ fontSize: 13, color: selectedMemberIds.length === 0 ? '#ffffff' : C.muted }}>Whole Family</Text>
                </Pressable>
                {members.map(m => {
                  const isSelected = selectedMemberIds.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setSelectedMemberIds(prev => toggleInArray(prev, m.id))}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
                        backgroundColor: isSelected ? m.avatar_color : C.card,
                        borderWidth: 1, borderColor: isSelected ? m.avatar_color : C.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: isSelected ? '#ffffff' : C.muted }}>{m.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Reminders (multi-select) */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Remind Me</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {REMINDER_OPTIONS.map(opt => {
                  const isSelected = selectedReminders.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSelectedReminders(prev => toggleInArray(prev, opt.value))}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
                        backgroundColor: isSelected ? C.primary : C.card,
                        borderWidth: 1, borderColor: isSelected ? C.primaryLight : C.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: isSelected ? '#ffffff' : C.muted }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error && <Text style={{ fontSize: 13, color: C.danger }}>{error}</Text>}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
                  backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: C.muted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
                  backgroundColor: saving ? C.surface3 : C.primary,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#ffffff' }}>
                  {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                </Text>
              </Pressable>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <MiniCalendarPicker
            visible={pickerFor !== null}
            value={pickerFor === 'event' ? eventDate : recurrenceEndDate || null}
            onChange={(date) => {
              if (pickerFor === 'event') setEventDate(date);
              else if (pickerFor === 'until') setRecurrenceEndDate(date);
            }}
            onClose={() => setPickerFor(null)}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
