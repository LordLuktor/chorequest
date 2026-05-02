import { useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { reportLocation, getAccessToken } from '../lib/api';
import { API_BASE } from '../lib/constants';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const UPDATE_INTERVAL_MS = 60_000;

// Register background task at module level
try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) return;
    if (data?.locations?.length > 0) {
      const { latitude, longitude, accuracy } = data.locations[0].coords;
      const token = getAccessToken();
      if (!token) return;
      const base = Platform.OS === 'web' ? '/api/v1' : API_BASE;
      await fetch(`${base}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude, accuracy }),
      }).catch(() => {});
    }
  });
} catch {
  // Task manager not available
}

export function useLocationTracking(isAuthenticated: boolean) {
  const foregroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestAndStart = useCallback(async () => {
    if (!isAuthenticated || Platform.OS === 'web') return;

    const { status: currentFg } = await Location.getForegroundPermissionsAsync();
    if (currentFg !== 'granted') {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') return;
    }

    // Send initial location
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await reportLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
      });
    } catch {}

    if (Platform.OS === 'android') {
      const { status: currentBg } = await Location.getBackgroundPermissionsAsync();

      if (currentBg !== 'granted') {
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Background Location',
            'To share your location with family even when the app is closed, Android will open your Settings next.\n\nPlease select "Allow all the time" to enable background location sharing.',
            [{ text: 'Got it', onPress: () => resolve() }],
          );
        });

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus === 'granted') {
          await startBackgroundTracking();
          return;
        }
      } else {
        await startBackgroundTracking();
        return;
      }
    }

    // Fallback: foreground polling
    if (!foregroundIntervalRef.current) {
      foregroundIntervalRef.current = setInterval(async () => {
        if (AppState.currentState !== 'active') return;
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await reportLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? undefined,
          });
        } catch {}
      }, UPDATE_INTERVAL_MS);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    requestAndStart();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') requestAndStart();
    });

    return () => {
      sub.remove();
      if (foregroundIntervalRef.current) {
        clearInterval(foregroundIntervalRef.current);
        foregroundIntervalRef.current = null;
      }
    };
  }, [requestAndStart]);
}

async function startBackgroundTracking() {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (!isStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: UPDATE_INTERVAL_MS,
        distanceInterval: 50,
        deferredUpdatesInterval: UPDATE_INTERVAL_MS,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: 'ChoreQuest',
          notificationBody: 'Sharing your location with family',
          notificationColor: '#6366f1',
        },
      });
    }
  } catch (err) {
    console.warn('Failed to start background location:', err);
  }
}
