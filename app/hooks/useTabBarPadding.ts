import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 60;
const BREATHING_ROOM = 16;

export function useTabBarPadding(): number {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 4 : Math.max(insets.bottom, 4);
  return TAB_BAR_HEIGHT + bottomInset + BREATHING_ROOM;
}
