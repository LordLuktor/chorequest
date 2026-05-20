import { View, Linking, Pressable, Text } from 'react-native';
import { useMemo } from 'react';
import { buildMapHTML, sizeStyle, type FamilyMapProps } from './FamilyMap.helpers';

// Defensive require: APKs built before react-native-webview was added (v1.0.0)
// can still load this bundle without crashing — they'll just fall back to the
// chip-list view below. New APKs (v1.1.0+) get the real embedded map.
let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch {}

export function FamilyMap({ locations, members, height = 300, fill = false, focusMemberId = null }: FamilyMapProps) {
  const html = useMemo(() => buildMapHTML(locations, members, focusMemberId), [locations, members, focusMemberId]);

  if (locations.length === 0 || !html) return null;

  if (WebView) {
    return (
      <View style={{ ...sizeStyle(fill, height), overflow: 'hidden', borderWidth: 1, borderColor: '#312e5a' }}>
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={{ flex: 1, backgroundColor: '#0f0e1a' }}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
        />
      </View>
    );
  }

  // Fallback for builds without react-native-webview: chip list + Google Maps links.
  // The UpdateBanner will prompt these users to install the new APK.
  return (
    <View style={{ ...(fill ? { flex: 1 } : {}), borderRadius: fill ? 0 : 12, backgroundColor: '#1a1830', borderWidth: 1, borderColor: '#312e5a', padding: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {locations.map(l => {
          const m = members.find(mb => mb.id === l.member_id);
          const time = new Date(l.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return (
            <Pressable
              key={l.member_id}
              onPress={() => Linking.openURL(`https://www.google.com/maps?q=${l.latitude},${l.longitude}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#252244', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m?.avatar_color || '#6366f1' }} />
              <Text style={{ fontSize: 12, color: '#e0e7ff' }}>{l.member_name}</Text>
              <Text style={{ fontSize: 10, color: '#5c6278' }}>{time}</Text>
            </Pressable>
          );
        })}
      </View>
      {locations.length > 1 && (
        <Pressable
          onPress={() => {
            const points = locations.map(l => `${l.latitude},${l.longitude}`);
            Linking.openURL(`https://www.google.com/maps/dir/${points.join('/')}`);
          }}
          style={{ alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#252244' }}
        >
          <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '500' }}>View All on Map</Text>
        </Pressable>
      )}
    </View>
  );
}
