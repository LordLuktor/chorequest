import { View, Platform } from 'react-native';
import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import type { MemberLocation, Member } from '../lib/api';

interface FamilyMapProps {
  locations: MemberLocation[];
  members: Member[];
  height?: number;
  fill?: boolean;
  focusMemberId?: number | null;
}

function buildMapHTML(locations: MemberLocation[], members: Member[], focusMemberId?: number | null): string {
  if (locations.length === 0) return '';

  const focus = focusMemberId ? locations.find(l => l.member_id === focusMemberId) : null;
  const lats = locations.map(l => l.latitude);
  const lngs = locations.map(l => l.longitude);
  const centerLat = focus ? focus.latitude : (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = focus ? focus.longitude : (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const initialZoom = focus ? 16 : 13;

  const markers = locations.map(l => {
    const m = members.find(mb => mb.id === l.member_id);
    const color = m?.avatar_color || '#6366f1';
    const name = l.member_name.replace(/'/g, "\\'");
    const initial = l.member_name.charAt(0).toUpperCase();
    const time = new Date(l.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const accuracy = l.accuracy ? ` (±${Math.round(l.accuracy)}m)` : '';

    return `
      L.marker([${l.latitude}, ${l.longitude}], {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.4);transform:translate(-16px,-16px);">${initial}</div>',
          iconSize: [0, 0],
        })
      }).addTo(map).bindPopup('<b>${name}</b><br>Last seen: ${time}${accuracy}');
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; background: #0f0e1a; }
  .leaflet-popup-content-wrapper { border-radius: 8px; }
  .leaflet-popup-content { font-family: -apple-system, sans-serif; font-size: 13px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${centerLat}, ${centerLng}], ${initialZoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);
  ${markers}
  ${!focus && locations.length > 1 ? `map.fitBounds([${locations.map(l => `[${l.latitude},${l.longitude}]`).join(',')}], { padding: [40, 40] });` : ''}
</script>
</body>
</html>`;
}

export function FamilyMap({ locations, members, height = 300, fill = false, focusMemberId = null }: FamilyMapProps) {
  const html = useMemo(() => buildMapHTML(locations, members, focusMemberId), [locations, members, focusMemberId]);

  if (locations.length === 0 || !html) return null;

  const sizeStyle = fill
    ? { flex: 1, borderRadius: 0 }
    : { height, borderRadius: 12 };

  // Web: render inline map via iframe
  if (Platform.OS === 'web') {
    return (
      <View style={{ ...sizeStyle, overflow: 'hidden', borderWidth: 1, borderColor: '#312e5a' }}>
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none' } as any}
        />
      </View>
    );
  }

  // Native (iOS/Android): WebView rendering the same Leaflet HTML
  return (
    <View style={{ ...sizeStyle, overflow: 'hidden', borderWidth: 1, borderColor: '#312e5a' }}>
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
