import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { MapPin, RefreshCw, Navigation } from 'lucide-react-native';
import { getLocations, getMembers, type MemberLocation, type Member } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { FamilyMap } from '../../components/FamilyMap';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const STALE_AFTER_MS = 10 * 60 * 1000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function MapScreen() {
  const tabBarPadding = useTabBarPadding();
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const isParent = member?.role === 'parent';

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    enabled: isParent,
    refetchInterval: 30_000,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    enabled: isParent,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['locations'] });
    setRefreshing(false);
  }, [queryClient]);

  const lastUpdate = useMemo(() => {
    if (locations.length === 0) return null;
    const latest = locations.reduce((acc: MemberLocation, l: MemberLocation) => (
      new Date(l.updated_at).getTime() > new Date(acc.updated_at).getTime() ? l : acc
    ));
    return latest.updated_at;
  }, [locations]);

  if (!isParent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <MapPin size={32} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 14, marginTop: 12, textAlign: 'center' }}>
            Family location is visible to parents only.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const sharedMembers = members.filter((m: Member) => m.role !== 'display');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin size={18} color={C.primaryLight} />
          <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Family Map</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {lastUpdate && (
            <Text style={{ fontSize: 11, color: C.dim }}>Updated {relativeTime(lastUpdate)}</Text>
          )}
          <Pressable
            onPress={onRefresh}
            style={{ padding: 6, borderRadius: 8, backgroundColor: C.surface3 }}
          >
            <RefreshCw size={14} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
          </Pressable>
        </View>
      </View>

      {/* Map fills the space above the member list */}
      <View style={{ flex: 1, marginHorizontal: Platform.OS === 'web' ? 20 : 0, marginBottom: 12, overflow: 'hidden', borderRadius: Platform.OS === 'web' ? 12 : 0 }}>
        {locations.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12 }}>
            <Navigation size={28} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 12, textAlign: 'center' }}>
              No locations shared yet.
            </Text>
            <Text style={{ color: C.dim, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Family members need location permission and the app open at least once for their position to appear here.
            </Text>
          </View>
        ) : (
          <FamilyMap locations={locations} members={members} fill focusMemberId={focusedId} />
        )}
      </View>

      {/* Member chip list */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
        style={{ flexGrow: 0 }}
      >
        {sharedMembers.map((m: Member) => {
          const loc = locations.find((l: MemberLocation) => l.member_id === m.id);
          const isStale = loc ? Date.now() - new Date(loc.updated_at).getTime() > STALE_AFTER_MS : true;
          const isFocused = focusedId === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => setFocusedId(isFocused ? null : m.id)}
              disabled={!loc}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                backgroundColor: isFocused ? C.primary : C.card,
                borderWidth: 1, borderColor: isFocused ? C.primary : C.border,
                opacity: loc ? 1 : 0.5,
              }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: m.avatar_color, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{m.name.charAt(0).toUpperCase()}</Text>
                {loc && (
                  <View style={{
                    position: 'absolute', bottom: -2, right: -2, width: 9, height: 9, borderRadius: 4.5,
                    backgroundColor: isStale ? C.warning : C.success,
                    borderWidth: 1.5, borderColor: isFocused ? C.primary : C.card,
                  }} />
                )}
              </View>
              <View>
                <Text style={{ color: isFocused ? '#fff' : C.text, fontSize: 13, fontWeight: '500' }}>{m.name}</Text>
                <Text style={{ color: isFocused ? 'rgba(255,255,255,0.7)' : C.dim, fontSize: 10 }}>
                  {loc ? relativeTime(loc.updated_at) : 'not sharing'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Reserve room for the tab bar at the very bottom */}
      <View style={{ height: tabBarPadding - 12 }} />
    </SafeAreaView>
  );
}
