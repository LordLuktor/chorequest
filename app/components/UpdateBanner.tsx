import { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { Download, X } from 'lucide-react-native';
import { APP_PUBLIC_URL } from '../lib/constants';

interface VersionManifest {
  version: string;
  runtimeVersion?: string;
  apkUrl: string;
  releaseNotes?: string;
}

// Compares manifest.version vs the bundle's reported version (expoConfig.version).
// We publish OTA bundles at one minor below the target APK version (e.g. 1.0.9
// when the available native APK is 1.1.0). That way bundle 1.0.9 < manifest 1.1.0
// → banner appears, and once the user installs the v1.1.0 APK, expoConfig.version
// becomes 1.1.0 (matches manifest) and the banner stops.
const INSTALLED = (Constants.nativeAppVersion || Constants.expoConfig?.version || '0.0.0') as string;

function compare(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function UpdateBanner() {
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Web users always have the latest bundle by virtue of reloading the page;
    // sideloaded APKs are the case we care about.
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`${APP_PUBLIC_URL}/version.json`, { cache: 'no-store' as any });
        if (!r.ok) return;
        const m = await r.json() as VersionManifest;
        if (!cancelled && compare(m.version, INSTALLED) > 0) {
          setManifest(m);
        }
      } catch {
        // Offline or DNS failure — silently skip
      }
    };
    check();
    // Re-check every hour while the app is open
    const id = setInterval(check, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!manifest || dismissed || Platform.OS === 'web') return null;

  const installUrl = manifest.apkUrl.startsWith('http')
    ? manifest.apkUrl
    : `${APP_PUBLIC_URL}${manifest.apkUrl}`;

  return (
    <View style={{
      paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: '#4338ca',
      flexDirection: 'row', alignItems: 'center', gap: 10,
    }}>
      <Download size={18} color="#ffffff" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>
          Update available · v{manifest.version}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }} numberOfLines={1}>
          {manifest.releaseNotes || 'Tap to install — Android will guide you through.'}
        </Text>
      </View>
      <Pressable
        onPress={() => Linking.openURL(installUrl)}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)' }}
      >
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>Install</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} style={{ padding: 4 }}>
        <X size={14} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
}
