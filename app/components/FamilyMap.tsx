import { View, Platform, Linking, Pressable, Text } from 'react-native';
import { useMemo } from 'react';
import type { MemberLocation, Member } from '../lib/api';

interface FamilyMapProps {
  locations: MemberLocation[];
  members: Member[];
  height?: number;
}

function buildMapHTML(locations: MemberLocation[], members: Member[]): string {
  if (locations.length === 0) return '';

  const lats = locations.map(l => l.latitude);
  const lngs = locations.map(l => l.longitude);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  const markers = locations.map(l => {
    const m = members.find(mb => mb.id === l.member_id);
    const color = m?.avatar_color || '#6366f1';
    const name = l.member_name;
    const initial = name.charAt(0).toUpperCase();
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
  html, body, #map { width: 100%; height: 100%; }
  .leaflet-popup-content-wrapper { border-radius: 8px; }
  .leaflet-popup-content { font-family: -apple-system, sans-serif; font-size: 13px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${centerLat}, ${centerLng}], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);
  ${markers}
  ${locations.length > 1 ? `map.fitBounds([${locations.map(l => `[${l.latitude},${l.longitude}]`).join(',')}], { padding: [40, 40] });` : ''}
</script>
</body>
</html>`;
}

export function FamilyMap({ locations, members, height = 300 }: FamilyMapProps) {
  const html = useMemo(() => buildMapHTML(locations, members), [locations, members]);

  if (locations.length === 0 || !html) return null;

  // Web: render inline map via iframe
  if (Platform.OS === 'web') {
    return (
      <View style={{ height, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#312e5a' }}>
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none' } as any}
        />
      </View>
    );
  }

  // Native Android: show member legend + open in Google Maps
  // (In-app map requires WebView which needs a new APK build)
  return (
    <View style={{ borderRadius: 12, backgroundColor: '#1a1830', borderWidth: 1, borderColor: '#312e5a', padding: 12 }}>
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
