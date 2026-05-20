import { useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { reportLocation, getAccessToken } from '../lib/api';
import { API_BASE } from '../lib/constants';
import { useAuth } from '../providers/AuthProvider';

// Defensive require: APKs built before @react-native-async-storage was added
// (v1.0.0) can still load this bundle. Falls back to an in-memory map.
let _storage: any = null;
try {
  _storage = require('@react-native-async-storage/async-storage').default;
} catch {}
const _memStore: Record<string, string> = {};
async function safeSet(key: string, value: string): Promise<void> {
  if (_storage) {
    try { await _storage.setItem(key, value); return; } catch {}
  }
  _memStore[key] = value;
}
async function safeGet(key: string): Promise<string | null> {
  if (_storage) {
    try { return await _storage.getItem(key); } catch {}
  }
  return _memStore[key] ?? null;
}

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Cadence tiers (ms)
const INTERVAL_DEFAULT = 5 * 60 * 1000;   // 5 min — battery friendly
const INTERVAL_SOS = 30 * 1000;            // 30s during active SOS
const INTERVAL_SOS_FAST = 5 * 1000;        // 5s during SOS while moving fast

// 15 mph ≈ 6.7 m/s (coords.speed is m/s)
const FAST_SPEED_M_S = 6.7;

// AsyncStorage keys used to communicate between the background task and the hook
const KEY_CURRENT_MODE = 'cq.tracking.mode';
const KEY_LAST_SPEED = 'cq.tracking.lastSpeed';
const KEY_LAST_SPEED_AT = 'cq.tracking.lastSpeedAt';

type Mode = 'default' | 'sos' | 'sos_fast';

function intervalForMode(m: Mode): number {
  if (m === 'sos_fast') return INTERVAL_SOS_FAST;
  if (m === 'sos') return INTERVAL_SOS;
  return INTERVAL_DEFAULT;
}

// Background task: post location, record speed, let the hook decide whether to escalate
try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) return;
    if (data?.locations?.length > 0) {
      const sample = data.locations[0].coords;
      const { latitude, longitude, accuracy, speed } = sample;
      const token = getAccessToken();
      if (!token) return;
      const base = Platform.OS === 'web' ? '/api/v1' : API_BASE;
      await fetch(`${base}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude, accuracy }),
      }).catch(() => {});
      try {
        if (typeof speed === 'number' && speed >= 0) {
          await safeSet(KEY_LAST_SPEED, String(speed));
          await safeSet(KEY_LAST_SPEED_AT, String(Date.now()));
        }
      } catch {}
    }
  });
} catch {
  // Task manager not available (web)
}

async function checkMyActiveSOS(memberId: number | undefined): Promise<boolean> {
  if (!memberId) return false;
  const token = getAccessToken();
  if (!token) return false;
  try {
    const base = Platform.OS === 'web' ? '/api/v1' : API_BASE;
    const r = await fetch(`${base}/safety/sos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const alerts = await r.json() as Array<{ member_id: number; is_resolved: boolean }>;
    return alerts.some(a => a.member_id === memberId && !a.is_resolved);
  } catch {
    return false;
  }
}

async function startBackgroundTrackingAt(intervalMs: number) {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    }
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: intervalMs <= INTERVAL_SOS_FAST ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: intervalMs,
      distanceInterval: intervalMs <= INTERVAL_SOS ? 0 : 50,
      deferredUpdatesInterval: intervalMs,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'ChoreQuest',
        notificationBody: intervalMs <= INTERVAL_SOS ? 'SOS active — sharing live location' : 'Sharing your location with family',
        notificationColor: '#6366f1',
      },
    });
  } catch (err) {
    console.warn('Failed to start background location:', err);
  }
}

export function useLocationTracking(isAuthenticated: boolean) {
  const { member } = useAuth();
  const memberIdRef = useRef<number | undefined>(undefined);
  memberIdRef.current = member?.id;

  const foregroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<Mode>('default');
  const sosPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyMode = useCallback(async (next: Mode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    try { await safeSet(KEY_CURRENT_MODE, next); } catch {}
    if (Platform.OS !== 'web') {
      const ms = intervalForMode(next);
      await startBackgroundTrackingAt(ms);
    }
  }, []);

  // Recompute target mode from SOS state + last speed reading
  const recomputeMode = useCallback(async () => {
    const sosActive = await checkMyActiveSOS(memberIdRef.current);
    if (!sosActive) {
      await applyMode('default');
      return;
    }
    // SOS active — decide between sos and sos_fast based on recent speed
    let isFast = false;
    try {
      const [s, t] = await Promise.all([
        safeGet(KEY_LAST_SPEED),
        safeGet(KEY_LAST_SPEED_AT),
      ]);
      const speed = s ? parseFloat(s) : 0;
      const at = t ? parseInt(t, 10) : 0;
      // Only trust speed readings from the last 2 minutes
      isFast = speed > FAST_SPEED_M_S && Date.now() - at < 120_000;
    } catch {}
    await applyMode(isFast ? 'sos_fast' : 'sos');
  }, [applyMode]);

  const requestAndStart = useCallback(async () => {
    if (!isAuthenticated || Platform.OS === 'web') return;

    const { status: currentFg } = await Location.getForegroundPermissionsAsync();
    if (currentFg !== 'granted') {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') return;
    }

    // Send initial location immediately
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await reportLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
      });
      if (typeof loc.coords.speed === 'number' && loc.coords.speed >= 0) {
        try {
          await safeSet(KEY_LAST_SPEED, String(loc.coords.speed));
          await safeSet(KEY_LAST_SPEED_AT, String(Date.now()));
        } catch {}
      }
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
          await applyMode('default');
          recomputeMode();
          return;
        }
      } else {
        await applyMode('default');
        recomputeMode();
        return;
      }
    }

    // Fallback: foreground polling at current target interval
    if (!foregroundIntervalRef.current) {
      const tick = async () => {
        if (AppState.currentState !== 'active') return;
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await reportLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? undefined,
          });
          if (typeof loc.coords.speed === 'number' && loc.coords.speed >= 0) {
            try {
              await safeSet(KEY_LAST_SPEED, String(loc.coords.speed));
              await safeSet(KEY_LAST_SPEED_AT, String(Date.now()));
            } catch {}
          }
        } catch {}
      };
      // Use a short heartbeat that compares against modeRef-derived interval
      let lastFired = 0;
      foregroundIntervalRef.current = setInterval(async () => {
        const target = intervalForMode(modeRef.current);
        if (Date.now() - lastFired >= target) {
          lastFired = Date.now();
          await tick();
        }
      }, 1000);
    }
  }, [isAuthenticated, applyMode, recomputeMode]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) return;

    requestAndStart();

    // Poll SOS state every 30s so we can up/down-shift cadence promptly when an
    // alert is raised or resolved. recomputeMode also reads recent speed.
    sosPollRef.current = setInterval(() => { recomputeMode(); }, 30_000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        requestAndStart();
        recomputeMode();
      }
    });

    return () => {
      sub.remove();
      if (foregroundIntervalRef.current) {
        clearInterval(foregroundIntervalRef.current);
        foregroundIntervalRef.current = null;
      }
      if (sosPollRef.current) {
        clearInterval(sosPollRef.current);
        sosPollRef.current = null;
      }
    };
  }, [isAuthenticated, requestAndStart, recomputeMode]);
}
