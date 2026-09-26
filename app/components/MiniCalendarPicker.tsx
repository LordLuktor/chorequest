import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  format, addDays, addMonths, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth,
} from 'date-fns';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface MiniCalendarPickerProps {
  visible: boolean;
  value: string | null; // YYYY-MM-DD
  onChange: (date: string) => void;
  onClose: () => void;
}

function parseDateKey(key: string | null): Date {
  if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) return new Date(`${key}T00:00:00`);
  return new Date();
}

export default function MiniCalendarPicker({ visible, value, onChange, onClose }: MiniCalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(() => parseDateKey(value));

  useEffect(() => {
    if (visible) setViewMonth(parseDateKey(value));
  }, [visible, value]);

  if (!visible) return null;

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const weeks: Date[][] = [];
  let day = gridStart;
  while (day <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
    weeks.push(week);
  }

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' }}
      />
      <View style={{
        width: 300, backgroundColor: C.card, borderRadius: 14,
        borderWidth: 1, borderColor: C.border, padding: 14,
      }}>
        {/* Month nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Pressable onPress={() => setViewMonth(subMonths(viewMonth, 1))} style={{ padding: 6 }}>
            <ChevronLeft size={18} color={C.muted} />
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: '600', color: 'white' }}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <Pressable onPress={() => setViewMonth(addMonths(viewMonth, 1))} style={{ padding: 6 }}>
            <ChevronRight size={18} color={C.muted} />
          </Pressable>
        </View>

        {/* Weekday header */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {WEEKDAYS.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.dim }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((d, di) => {
              const key = format(d, 'yyyy-MM-dd');
              const inMonth = isSameMonth(d, viewMonth);
              const isSelected = key === value;
              const isToday = key === todayKey;
              return (
                <Pressable
                  key={di}
                  onPress={() => { onChange(key); onClose(); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}
                >
                  <View style={{
                    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSelected ? C.primary : isToday ? C.surface3 : 'transparent',
                  }}>
                    <Text style={{
                      fontSize: 13, fontWeight: isSelected || isToday ? '700' : '400',
                      color: !inMonth ? '#3a3758' : isSelected ? 'white' : isToday ? C.primaryLight : C.text,
                    }}>
                      {format(d, 'd')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
