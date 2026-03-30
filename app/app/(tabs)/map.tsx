import { View, Text, Pressable, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getLocations, type MemberLocation } from '../../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, MapPin } from 'lucide-react-native';
import { format } from 'date-fns';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

export default function MapScreen() {
  const { data: locations = [], refetch, isRefetching } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    refetchInterval: 30_000,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
        }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff' }}>Family Map</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>
              {locations.length} member{locations.length !== 1 ? 's' : ''} sharing location
            </Text>
          </View>
          <Pressable
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
            }}
            onPress={() => refetch()}
          >
            <RefreshCw size={18} color={C.primaryLight} style={{ transform: [{ rotate: isRefetching ? '180deg' : '0deg' }] }} />
          </Pressable>
        </View>

        <View style={{
          flex: 1,
          marginHorizontal: 20,
          marginBottom: 16,
          borderRadius: 12,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.border,
          overflow: 'hidden',
        }}>
          {locations.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <MapPin size={48} color={C.border} />
              <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 16 }}>
                No family members are sharing their location yet.
              </Text>
              <Text style={{ color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                Location sharing is available on mobile devices.
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, padding: 16 }}>
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: C.bg,
                opacity: 0.5,
              }} />

              <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
                {locations.map((loc: MemberLocation) => (
                  <View
                    key={loc.member_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(15, 14, 26, 0.8)',
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: C.border,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                        backgroundColor: loc.avatar_color,
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>
                        {loc.member_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#ffffff', fontWeight: '500', fontSize: 14 }}>{loc.member_name}</Text>
                      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                        {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
                        Updated {format(new Date(loc.updated_at), 'h:mm a')}
                        {loc.accuracy ? ` · ±${Math.round(loc.accuracy)}m` : ''}
                      </Text>
                    </View>
                    <View style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: C.success,
                      shadowColor: C.success,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 4,
                    }} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
