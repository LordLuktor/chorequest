import { Pressable, View, Animated } from 'react-native';
import { useRef, useEffect } from 'react';

interface ToggleProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  activeColor?: string;
}

export function Toggle({ value, onValueChange, activeColor = '#4ade80' }: ToggleProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1e1b3a', activeColor],
  });

  const thumbLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 27],
  });

  return (
    <Pressable onPress={() => onValueChange(!value)}>
      <Animated.View style={{
        width: 52,
        height: 28,
        borderRadius: 14,
        backgroundColor: trackBg,
        borderWidth: 2,
        borderColor: value ? activeColor : '#3a3758',
        justifyContent: 'center',
      }}>
        <Animated.View style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: value ? '#ffffff' : '#6b7280',
          position: 'absolute',
          left: thumbLeft,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.3,
          shadowRadius: 2,
          elevation: 2,
        }} />
      </Animated.View>
    </Pressable>
  );
}
