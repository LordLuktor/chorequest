import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMembers, regenerateInvite, type Member } from '../../lib/api';
import { LogOut, Users, Copy, RefreshCw, User, Moon, ChevronRight } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

export default function SettingsScreen() {
  const { user, household, member, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const [copiedCode, setCopiedCode] = useState(false);

  const copyInviteCode = async () => {
    if (household?.inviteCode) {
      try {
        await Clipboard.setStringAsync(household.inviteCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } catch {
        // Clipboard may not be available on all platforms
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff', marginTop: 16, marginBottom: 24 }}>
            Settings
          </Text>

          {/* Profile */}
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 48, height: 48, borderRadius: 24,
                  alignItems: 'center', justifyContent: 'center', marginRight: 16,
                  backgroundColor: member?.avatarColor || C.primary,
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 18 }}>
                  {user?.displayName?.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ffffff', fontWeight: '500', fontSize: 16 }}>{user?.displayName}</Text>
                <Text style={{ color: C.muted, fontSize: 14 }}>
                  {user?.email || user?.username} · {member?.role}
                </Text>
              </View>
            </View>
          </View>

          {/* Household */}
          <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
            Household
          </Text>
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
              <Text style={{ color: '#ffffff', fontWeight: '500' }}>{household?.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{members.length} members</Text>
            </View>

            {/* Invite code (parents only) */}
            {household?.inviteCode && member?.role === 'parent' && (
              <Pressable
                style={{ padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}
                onPress={copyInviteCode}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: C.muted }}>Invite Code</Text>
                  <Text style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 18, letterSpacing: 4, marginTop: 2 }}>
                    {household.inviteCode}
                  </Text>
                </View>
                <Copy size={18} color={copiedCode ? C.success : C.muted} />
                {copiedCode && <Text style={{ fontSize: 12, color: C.success, marginLeft: 8 }}>Copied!</Text>}
              </Pressable>
            )}

            {/* Member list */}
            {members.map((m: Member, i: number) => (
              <View
                key={m.id}
                style={{
                  padding: 12, flexDirection: 'row', alignItems: 'center',
                  ...(i < members.length - 1 ? { borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.3)' } : {}),
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: m.avatar_color }}>
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>{m.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={{ color: '#ffffff', fontSize: 14, flex: 1 }}>{m.name}</Text>
                <Text style={{ fontSize: 12, color: C.dim, textTransform: 'capitalize' }}>
                  {m.role || (m.is_parent ? 'parent' : 'child')}
                </Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
            Account
          </Text>
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
            <Pressable style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }} onPress={handleLogout}>
              <LogOut size={18} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: 14, fontWeight: '500', marginLeft: 12 }}>Log Out</Text>
            </Pressable>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
