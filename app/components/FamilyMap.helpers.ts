import type { MemberLocation, Member } from '../lib/api';

export interface FamilyMapProps {
  locations: MemberLocation[];
  members: Member[];
  height?: number;
  fill?: boolean;
  focusMemberId?: number | null;
}

export function buildMapHTML(
  locations: MemberLocation[],
  members: Member[],
  focusMemberId?: number | null,
): string {
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

  const MAX_ZOOM = 21;
  const MAX_NATIVE_ZOOM = 19;

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
  .leaflet-control-layers { background: #1a1830 !important; border: 1px solid #312e5a !important; border-radius: 8px !important; color: #e0e7ff !important; }
  .leaflet-control-layers label { color: #e0e7ff !important; font-size: 13px !important; margin-bottom: 4px !important; }
  .leaflet-control-attribution { background: rgba(26,24,48,0.75) !important; color: #94a3b8 !important; font-size: 10px !important; }
  .leaflet-control-attribution a { color: #818cf8 !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: ${MAX_ZOOM},
    maxNativeZoom: ${MAX_NATIVE_ZOOM},
    attribution: '&copy; OpenStreetMap contributors',
  });
  var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: ${MAX_ZOOM},
    maxNativeZoom: ${MAX_NATIVE_ZOOM},
    attribution: 'Tiles &copy; Esri',
  });

  var map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    maxZoom: ${MAX_ZOOM},
    layers: [streetLayer],
  }).setView([${centerLat}, ${centerLng}], ${initialZoom});

  L.control.layers({ 'Street': streetLayer, 'Satellite': satelliteLayer }, null, { collapsed: false }).addTo(map);

  ${markers}
  ${!focus && locations.length > 1 ? `map.fitBounds([${locations.map(l => `[${l.latitude},${l.longitude}]`).join(',')}], { padding: [40, 40] });` : ''}
</script>
</body>
</html>`;
}

export function sizeStyle(fill: boolean, height: number) {
  return fill
    ? { flex: 1, borderRadius: 0 }
    : { height, borderRadius: 12 };
}
