import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllowanceSettings, getAllowanceBalances, getAllowanceLedger, type AllowanceBalance, type AllowanceLedgerEntry } from '../../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { DollarSign, ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react-native';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

export default function AllowanceScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: settings } = useQuery({ queryKey: ['allowanceSettings'], queryFn: getAllowanceSettings });
  const { data: balances = [] } = useQuery({ queryKey: ['allowanceBalances'], queryFn: getAllowanceBalances });
  const { data: ledger = [] } = useQuery({
    queryKey: ['allowanceLedger'],
    queryFn: () => getAllowanceLedger({ limit: 50 }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['allowanceSettings'] });
    await queryClient.invalidateQueries({ queryKey: ['allowanceBalances'] });
    await queryClient.invalidateQueries({ queryKey: ['allowanceLedger'] });
    setRefreshing(false);
  }, [queryClient]);

  const childBalances = balances.filter((b: AllowanceBalance) => !b.is_parent);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: 'white' }}>Allowance</Text>
            <Pressable onPress={onRefresh} style={{ padding: 6, borderRadius: 8, backgroundColor: C.surface3 }}>
              <RefreshCw size={14} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
            </Pressable>
          </View>
          {settings && (
            <View style={{ backgroundColor: settings.enabled ? C.success + '20' : C.surface3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
              <Text style={{ fontSize: 12, color: settings.enabled ? C.success : C.muted }}>
                {settings.enabled ? `$${settings.rate_per_point}/pt` : 'Disabled'}
              </Text>
            </View>
          )}
        </View>

        {/* Balances */}
        {childBalances.length > 0 && (
          <View style={{ gap: 10, marginBottom: 24 }}>
            {childBalances.map((b: AllowanceBalance) => (
              <View key={b.id} style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border,
              }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: b.avatar_color, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{b.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{b.name}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>Current balance</Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '700', color: C.success }}>
                  ${Number(b.allowance_balance).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Settings info */}
        {settings && settings.enabled && (
          <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: 'white', marginBottom: 8 }}>Settings</Text>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.muted }}>Rate per point</Text>
                <Text style={{ fontSize: 13, color: 'white' }}>${settings.rate_per_point}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.muted }}>All or nothing</Text>
                <Text style={{ fontSize: 13, color: settings.all_or_nothing ? C.warning : C.muted }}>
                  {settings.all_or_nothing ? 'Yes' : 'No'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Ledger */}
        <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 12 }}>Recent Activity</Text>
        {ledger.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <DollarSign size={40} color={C.border} />
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 12 }}>No allowance activity yet.</Text>
          </View>
        ) : (
          <View style={{ gap: 6, marginBottom: 32 }}>
            {ledger.map((entry: AllowanceLedgerEntry) => (
              <View key={entry.id} style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border,
              }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  backgroundColor: entry.type === 'earned' ? C.success + '15' : entry.type === 'payout' ? C.primary + '15' : C.surface3,
                }}>
                  {entry.type === 'earned' ? <ArrowUpRight size={16} color={C.success} /> :
                   entry.type === 'payout' ? <ArrowDownRight size={16} color={C.primary} /> :
                   <Minus size={16} color={C.muted} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: 'white' }}>
                    {entry.member_name} — {entry.type}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.dim }}>
                    {format(new Date(entry.date), 'MMM d, yyyy')}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </Text>
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: '600',
                  color: entry.type === 'earned' ? C.success : entry.type === 'payout' ? C.danger : C.muted,
                }}>
                  {entry.type === 'payout' ? '-' : '+'}${Math.abs(entry.amount).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
