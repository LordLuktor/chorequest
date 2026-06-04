import '../global.css';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform, AppState } from 'react-native';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { QueryProvider, queryClient } from '../providers/QueryProvider';
import { ThemeProvider, useTheme } from '../providers/ThemeProvider';
import { useWebSocket } from '../hooks/useWebSocket';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { UpdateBanner } from '../components/UpdateBanner';
import { syncWidgetIdentity, clearWidgetIdentity, refreshChoreWidget } from '../lib/widget-bridge';
import * as Updates from 'expo-updates';

function useOTAUpdates() {
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return;

    async function checkForUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silently fail
      }
    }

    checkForUpdate();
  }, []);
}

function AuthGate() {
  const { isAuthenticated, isLoading, member } = useAuth();
  const { colors } = useTheme();
  useWebSocket();
  useLocationTracking(isAuthenticated);
  useOTAUpdates();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        queryClient.invalidateQueries();
      }
    });
    return () => sub.remove();
  }, []);

  // Keep the Android widget's cached identity in sync with who's logged in.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (member) syncWidgetIdentity({ id: member.id, name: member.name });
    else clearWidgetIdentity();
  }, [member?.id]);

  // Re-draw placed widgets shortly after any task/member data changes from any
  // screen. Debounced so a burst of query invalidations collapses to one draw.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const key = (event?.query?.queryKey?.[0]) as string | undefined;
      if (key === 'tasks' || key === 'members') {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { refreshChoreWidget(); }, 1500);
      }
    });
    return () => { if (timer) clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <UpdateBanner />
      <Slot />
    </View>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
