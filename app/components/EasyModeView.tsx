import { View, Text, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { Check, PartyPopper } from 'lucide-react-native';
import type { TaskInstance } from '../lib/api';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

interface EasyModeViewProps {
  memberName: string;
  memberColor: string;
  tasks: TaskInstance[];
  onComplete: (taskId: number) => void;
  onBack?: () => void; // For display devices to return to idle
}

export function EasyModeView({ memberName, memberColor, tasks, onComplete, onBack }: EasyModeViewProps) {
  const pending = tasks.filter(t => t.status === 'pending');
  const completed = tasks.filter(t => t.status === 'completed');
  const total = tasks.length;
  const doneCount = completed.length;
  const allDone = total > 0 && doneCount === total;
  const [celebrating, setCelebrating] = useState(false);
  const [justCompleted, setJustCompleted] = useState<number | null>(null);

  useEffect(() => {
    if (allDone && total > 0) {
      setCelebrating(true);
    }
  }, [allDone, total]);

  const handleComplete = (taskId: number) => {
    setJustCompleted(taskId);
    onComplete(taskId);
    setTimeout(() => setJustCompleted(null), 600);
  };

  // Celebration screen
  if (celebrating) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 80, marginBottom: 24 }}>🎉</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', color: '#ffffff', textAlign: 'center', marginBottom: 12 }}>
          All Done!
        </Text>
        <Text style={{ fontSize: 20, color: C.muted, textAlign: 'center', marginBottom: 8 }}>
          Great job, {memberName}!
        </Text>
        <Text style={{ fontSize: 16, color: C.dim, textAlign: 'center', marginBottom: 40 }}>
          You finished all {total} tasks today
        </Text>
        <View style={{
          width: 120, height: 120, borderRadius: 60,
          backgroundColor: C.success + '30', alignItems: 'center', justifyContent: 'center',
          marginBottom: 40,
        }}>
          <Check size={60} color={C.success} />
        </View>
        {onBack && (
          <Pressable
            onPress={() => { setCelebrating(false); onBack(); }}
            style={{ paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, backgroundColor: C.surface3 }}
          >
            <Text style={{ color: C.muted, fontSize: 16 }}>Done</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header with name and progress */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: memberColor, alignItems: 'center', justifyContent: 'center', marginRight: 14,
          }}>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 22 }}>
              {memberName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#ffffff' }}>{memberName}</Text>
            <Text style={{ fontSize: 14, color: C.muted }}>
              {doneCount} of {total} done
            </Text>
          </View>
          {onBack && (
            <Pressable onPress={onBack} style={{ padding: 10 }}>
              <Text style={{ color: C.dim, fontSize: 14 }}>Back</Text>
            </Pressable>
          )}
        </View>

        {/* Progress bar */}
        <View style={{ height: 12, backgroundColor: C.surface3, borderRadius: 6, overflow: 'hidden' }}>
          <View style={{
            height: 12, borderRadius: 6,
            backgroundColor: doneCount === total ? C.success : memberColor,
            width: total > 0 ? `${(doneCount / total) * 100}%` : '0%',
          }} />
        </View>
      </View>

      {/* Task list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {pending.map(task => (
          <Pressable
            key={task.id}
            onPress={() => handleComplete(task.id)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: justCompleted === task.id ? C.success + '30' : C.card,
              borderRadius: 16, padding: 20,
              borderWidth: 2, borderColor: justCompleted === task.id ? C.success : C.border,
              minHeight: 80,
            }}
          >
            <Text style={{ fontSize: 36, marginRight: 16 }}>{task.icon || '📋'}</Text>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: '#ffffff' }}>
              {task.title}
            </Text>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: C.success + '20', alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: C.success,
            }}>
              <Check size={28} color={C.success} />
            </View>
          </Pressable>
        ))}

        {/* Completed tasks (dimmed) */}
        {completed.map(task => (
          <View
            key={task.id}
            style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: C.surface3, borderRadius: 16, padding: 20,
              opacity: 0.4, minHeight: 80,
            }}
          >
            <Text style={{ fontSize: 36, marginRight: 16 }}>{task.icon || '📋'}</Text>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: '#ffffff', textDecorationLine: 'line-through' }}>
              {task.title}
            </Text>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: C.success, alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={28} color="#ffffff" />
            </View>
          </View>
        ))}

        {total === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎉</Text>
            <Text style={{ fontSize: 20, color: C.muted }}>No tasks today!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
