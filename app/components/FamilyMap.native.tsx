import { View } from 'react-native';
import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { buildMapHTML, sizeStyle, type FamilyMapProps } from './FamilyMap.helpers';

export function FamilyMap({ locations, members, height = 300, fill = false, focusMemberId = null }: FamilyMapProps) {
  const html = useMemo(() => buildMapHTML(locations, members, focusMemberId), [locations, members, focusMemberId]);

  if (locations.length === 0 || !html) return null;

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
