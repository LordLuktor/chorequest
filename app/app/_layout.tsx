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
  const { isAuthenticated, isLoading } = useAuth();
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

  return <Slot />;
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
