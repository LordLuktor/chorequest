import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { createTemplate, updateTemplate, type TaskTemplate, type Member } from '../lib/api';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const ICONS = ['🧹', '🗑️', '🍽️', '🧺', '🛏️', '🐱', '🚿', '🌿', '📦', '🏠', '✏️', '💻'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  template?: TaskTemplate;
}

function buildRecurrenceRule(
  weeklyAssignments: Record<string, number[]>,
  repeatInterval: 1 | 2,
): string {
  const activeDays = Object.entries(weeklyAssignments)
    .filter(([, ids]) => ids.length > 0)
    .map(([day]) => DAY_CODES[Number(day)]);

  const interval = repeatInterval === 2 ? ';INTERVAL=2' : '';
  if (activeDays.length === 0) return `FREQ=WEEKLY${interval}`;
  return `FREQ=WEEKLY${interval};BYDAY=${activeDays.join(',')}`;
}

function todayISO(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

export default function TaskFormModal({ visible, onClose, onSaved, members, template }: TaskFormModalProps) {
  const isEditing = !!template;

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [points, setPoints] = useState('2');
  const [repeatInterval, setRepeatInterval] = useState<1 | 2>(1);
  const [weeklyAssignments, setWeeklyAssignments] = useState<Record<string, number[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens / template changes
  useEffect(() => {
    if (visible) {
      if (template) {
        setTitle(template.title);
        setIcon(template.icon || null);
        setPoints(String(template.points));
        setRepeatInterval((template.repeat_interval === 2 ? 2 : 1) as 1 | 2);
        // Deep-clone weekly_assignments, normalizing values to arrays
        const wa: Record<string, number[]> = {};
        for (let i = 0; i < 7; i++) {
          const raw = template.weekly_assignments?.[String(i)];
          wa[String(i)] = Array.isArray(raw) ? [...raw] : raw != null ? [raw as unknown as number] : [];
        }
        setWeeklyAssignments(wa);
      } else {
        setTitle('');
        setIcon(null);
        setPoints('2');
        setRepeatInterval(1);
        const empty: Record<string, number[]> = {};
        for (let i = 0; i < 7; i++) empty[String(i)] = [];
        setWeeklyAssignments(empty);
      }
      setError(null);
      setSaving(false);
    }
  }, [visible, template]);

  const toggleMemberOnDay = useCallback((day: number, memberId: number) => {
    setWeeklyAssignments(prev => {
      const dayKey = String(day);
      const current = prev[dayKey] || [];
      const next = current.includes(memberId)
        ? current.filter(id => id !== memberId)
        : [...current, memberId];
      return { ...prev, [dayKey]: next };
    });
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Task name is required.');
      return;
    }

    const pts = parseInt(points, 10);
    if (isNaN(pts) || pts < 0 || pts > 100) {
      setError('Points must be 0-100.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: trimmed,
        icon,
        points: pts,
        repeat_interval: repeatInterval,
        weekly_assignments: weeklyAssignments,
        recurrence_rule: buildRecurrenceRule(weeklyAssignments, repeatInterval),
        start_date: template?.start_date || todayISO(),
      };

      if (isEditing && template) {
        await updateTemplate(template.id, payload);
      } else {
        await createTemplate(payload);
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }, [title, icon, points, repeatInterval, weeklyAssignments, isEditing, template, onSaved, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            width: '100%',
            maxWidth: 500,
            maxHeight: '90%',
            backgroundColor: C.bg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.border,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { marginHorizontal: 16 } : { marginHorizontal: 16 }),
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff' }}>
                {isEditing ? 'Edit Task' : 'New Task'}
              </Text>
              <Pressable
                onPress={onClose}
                style={{ padding: 4, borderRadius: 8 }}
              >
                <X size={20} color={C.muted} />
              </Pressable>
            </View>

            {/* Form body */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, gap: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>
                  Task Name
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Take out trash"
                  placeholderTextColor={C.dim}
                  maxLength={100}
                  style={{
                    backgroundColor: C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: C.text,
                  }}
                />
              </View>

              {/* Icon picker */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>
                  Icon
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ICONS.map(emoji => (
                    <Pressable
                      key={emoji}
                      onPress={() => setIcon(icon === emoji ? null : emoji)}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: icon === emoji ? C.primary : C.card,
                        borderWidth: 1,
                        borderColor: icon === emoji ? C.primaryLight : C.border,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Points */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>
                  Points
                </Text>
                <TextInput
                  value={points}
                  onChangeText={t => setPoints(t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={3}
                  style={{
                    backgroundColor: C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: C.text,
                    width: 80,
                  }}
                />
              </View>

              {/* Frequency toggle */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>
                  Frequency
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([1, 2] as const).map(val => (
                    <Pressable
                      key={val}
                      onPress={() => setRepeatInterval(val)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: repeatInterval === val ? C.primary : C.card,
                        borderWidth: 1,
                        borderColor: repeatInterval === val ? C.primaryLight : C.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: repeatInterval === val ? '#ffffff' : C.muted,
                      }}>
                        {val === 1 ? 'Weekly' : 'Biweekly'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Weekly assignment grid */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 }}>
                  Weekly Assignments
                </Text>
                <Text style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
                  Tap a member on each day to assign them.
                </Text>
                <View style={{
                  flexDirection: 'row',
                  gap: 4,
                  backgroundColor: C.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  padding: 10,
                }}>
                  {DAYS.map((dayLabel, dayIndex) => {
                    const dayIds = weeklyAssignments[String(dayIndex)] || [];
                    return (
                      <View key={dayIndex} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: C.dim,
                        }}>
                          {dayLabel}
                        </Text>
                        {members.map(member => {
                          const isOn = dayIds.includes(member.id);
                          return (
                            <TouchableOpacity
                              key={member.id}
                              activeOpacity={0.6}
                              onPress={() => toggleMemberOnDay(dayIndex, member.id)}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 15,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isOn ? member.avatar_color : C.bg,
                                borderWidth: 2,
                                borderColor: isOn ? '#ffffff50' : C.border,
                              }}
                            >
                              <Text style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: isOn ? '#ffffff' : '#5c627850',
                              }}>
                                {member.name.charAt(0).toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
                {/* Legend */}
                {members.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {members.map(m => (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: m.avatar_color,
                        }} />
                        <Text style={{ fontSize: 11, color: C.muted }}>{m.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Error message */}
              {error && (
                <Text style={{ fontSize: 13, color: C.danger }}>{error}</Text>
              )}

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={onClose}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '500', color: C.muted }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: saving ? C.surface3 : C.primary,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#ffffff' }}>
                    {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                  </Text>
                </Pressable>
              </View>

              {/* Bottom spacing for scroll */}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
