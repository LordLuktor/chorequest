import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

const C = {
  card: '#1a1830', border: '#312e5a',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
};

type Meridiem = 'AM' | 'PM';

interface TimeInputProps {
  value: string | null; // 24-hour "HH:MM" (or "HH:MM:SS"), the API/DB format
  onChange: (value: string | null) => void;
}

function from24Hour(value: string | null): { hour: string; minute: string; meridiem: Meridiem } {
  if (!value) return { hour: '', minute: '', meridiem: 'AM' };
  const [hStr, mStr] = value.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return { hour: '', minute: '', meridiem: 'AM' };
  const meridiem: Meridiem = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour: String(hour12), minute: mStr ?? '00', meridiem };
}

function to24Hour(hourText: string, minuteText: string, meridiem: Meridiem): string | null {
  const hour12 = parseInt(hourText, 10);
  const minute = parseInt(minuteText, 10);
  if (isNaN(hour12) || hour12 < 1 || hour12 > 12) return null;
  if (isNaN(minute) || minute < 0 || minute > 59) return null;
  let h = hour12 % 12;
  if (meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function TimeInput({ value, onChange }: TimeInputProps) {
  const initial = from24Hour(value);
  const [hourText, setHourText] = useState(initial.hour);
  const [minuteText, setMinuteText] = useState(initial.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(initial.meridiem);
  // Tracks the last value *we* emitted, so the round-trip through the parent's
  // state doesn't immediately reformat (e.g. "5" -> "05") while the user is typing.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const parsed = from24Hour(value);
    setHourText(parsed.hour);
    setMinuteText(parsed.minute);
    setMeridiem(parsed.meridiem);
    lastEmitted.current = value;
  }, [value]);

  const commit = (h: string, m: string, mer: Meridiem) => {
    const next = to24Hour(h, m, mer);
    if (next) {
      lastEmitted.current = next;
      onChange(next);
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TextInput
        value={hourText}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
          setHourText(digits);
          commit(digits, minuteText, meridiem);
        }}
        placeholder="--"
        placeholderTextColor={C.dim}
        keyboardType="number-pad"
        maxLength={2}
        style={{
          backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: C.text,
          width: 48, textAlign: 'center',
        }}
      />
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.muted }}>:</Text>
      <TextInput
        value={minuteText}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
          setMinuteText(digits);
          commit(hourText, digits, meridiem);
        }}
        placeholder="--"
        placeholderTextColor={C.dim}
        keyboardType="number-pad"
        maxLength={2}
        style={{
          backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: C.text,
          width: 48, textAlign: 'center',
        }}
      />
      <View style={{ flexDirection: 'row', marginLeft: 6, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
        {(['AM', 'PM'] as Meridiem[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => { setMeridiem(m); commit(hourText, minuteText, m); }}
            style={{
              paddingHorizontal: 12, paddingVertical: 12,
              backgroundColor: meridiem === m ? C.primary : C.card,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: meridiem === m ? 'white' : C.muted }}>{m}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
