/**
 * Bridge between the running app and the Android home-screen widget.
 *
 * Everything here is a no-op off Android. The widget code (and the native
 * module it needs) is only pulled in via dynamic import *after* the platform
 * guard, so iOS/web never touch it.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Must match K_MEMBER in widgets/widget-data.ts.
const K_MEMBER = 'widget:member';

/** Re-draw any placed ChoreCalendar widgets with fresh data. */
export async function refreshChoreWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { renderChoreWidget, CHORE_WIDGET_NAME } = await import('../widgets/render');
    await requestWidgetUpdate({
      widgetName: CHORE_WIDGET_NAME,
      renderWidget: () => renderChoreWidget(true),
    });
  } catch {
    // No widgets placed, or native module unavailable — ignore.
  }
}

/**
 * Persist who is logged in so the widget can attribute completions without an
 * extra /auth/me round-trip, then refresh the widget.
 */
export async function syncWidgetIdentity(member: { id: number; name: string }): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await AsyncStorage.setItem(K_MEMBER, JSON.stringify({ id: member.id, name: member.name }));
  } catch {
    // ignore
  }
  await refreshChoreWidget();
}

/** Forget the cached identity (on logout) and refresh to the logged-out widget. */
export async function clearWidgetIdentity(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await AsyncStorage.removeItem(K_MEMBER);
  } catch {
    // ignore
  }
  await refreshChoreWidget();
}
