import { View, Text, Pressable, TextInput, ScrollView, Alert } from 'react-native';
import { Toggle } from '../../components/Toggle';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme, type ThemeMode } from '../../providers/ThemeProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, getAllowanceSettings, updateAllowanceSettings, resetMemberPassword, updateMemberEmail, deleteMember, updateMember, setUserPin, getSOSAlerts, resolveSOS, requestCheckin, getCheckins, exportUserData, deleteAccount, authCreateDisplay, resetDisplayPin, type Member, type SOSAlert, type CheckinRequest } from '../../lib/api';
import { LogOut, Copy, KeyRound, Mail, Trash2, Sun, Moon, Monitor, ShieldAlert, MapPin, CheckCircle2, Send, Clock, Download, AlertTriangle, Plus, Eye, EyeOff } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useState, useEffect } from 'react';

export default function SettingsScreen() {
  const { user, household, member, logout } = useAuth();
  const { colors, mode, setTheme } = useTheme();
  const C = { ...colors, muted: colors.textMuted, dim: colors.textDim };
  const queryClient = useQueryClient();
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const { data: allowanceSettings } = useQuery({
    queryKey: ['allowanceSettings'],
    queryFn: getAllowanceSettings,
    enabled: member?.role === 'parent',
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [allOrNothing, setAllOrNothing] = useState(false);
  const [allowanceEnabled, setAllowanceEnabled] = useState(false);

  useEffect(() => {
    if (allowanceSettings) {
      setRateInput(String(allowanceSettings.rate_per_point));
      setAllOrNothing(allowanceSettings.all_or_nothing);
      setAllowanceEnabled(allowanceSettings.enabled);
    }
  }, [allowanceSettings]);

  const updateSettingsMut = useMutation({
    mutationFn: updateAllowanceSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowanceSettings'] });
      queryClient.invalidateQueries({ queryKey: ['allowanceBalances'] });
    },
  });

  const saveRate = () => {
    const val = parseFloat(rateInput);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      updateSettingsMut.mutate({ rate_per_point: val });
    }
  };

  const toggleAllOrNothing = (val: boolean) => {
    setAllOrNothing(val);
    updateSettingsMut.mutate({ all_or_nothing: val });
  };

  const toggleAllowanceEnabled = (val: boolean) => {
    setAllowanceEnabled(val);
    updateSettingsMut.mutate({ enabled: val });
  };

  const [editingPasswordFor, setEditingPasswordFor] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState<number | null>(null);
  const [passwordError, setPasswordError] = useState('');

  const handleSavePassword = async (m: Member) => {
    if (newPassword.length < 4) {
      setPasswordError('Min 4 characters');
      return;
    }
    try {
      await resetMemberPassword(m.id, newPassword);
      setPasswordSaved(m.id);
      setNewPassword('');
      setEditingPasswordFor(null);
      setPasswordError('');
      setTimeout(() => setPasswordSaved(null), 2000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update');
    }
  };

  const [editingEmailFor, setEditingEmailFor] = useState<Member | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaved, setEmailSaved] = useState<number | null>(null);
  const [emailError, setEmailError] = useState('');

  const handleSaveEmail = async (m: Member) => {
    try {
      await updateMemberEmail(m.id, emailInput.trim());
      setEmailSaved(m.id);
      setEmailInput('');
      setEditingEmailFor(null);
      setEmailError('');
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setTimeout(() => setEmailSaved(null), 2000);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to update');
    }
  };

  const handleDeleteMember = (m: Member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${m.name} from the household? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(m.id);
              queryClient.invalidateQueries({ queryKey: ['members'] });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

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

  // ── Safety (parents only) ───────────────────────────────────
  const { data: sosAlerts = [] } = useQuery({
    queryKey: ['sosAlerts'],
    queryFn: getSOSAlerts,
    enabled: member?.role === 'parent',
  });
  const { data: checkins = [] } = useQuery({
    queryKey: ['checkins'],
    queryFn: getCheckins,
    enabled: member?.role === 'parent',
  });
  const [checkinTarget, setCheckinTarget] = useState<number | null>(null);
  const [checkinSending, setCheckinSending] = useState(false);
  const [checkinSent, setCheckinSent] = useState(false);

  const handleRequestCheckin = async () => {
    if (!checkinTarget) return;
    setCheckinSending(true);
    try {
      await requestCheckin(checkinTarget);
      queryClient.invalidateQueries({ queryKey: ['checkins'] });
      setCheckinSent(true);
      setTimeout(() => setCheckinSent(false), 2000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to request check-in');
    } finally {
      setCheckinSending(false);
    }
  };

  const handleResolveSOS = async (id: number) => {
    try {
      await resolveSOS(id);
      queryClient.invalidateQueries({ queryKey: ['sosAlerts'] });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resolve alert');
    }
  };

  const unresolvedSOS = sosAlerts.filter((a: SOSAlert) => !a.is_resolved);
  const childMembers = members.filter((m: Member) => m.role !== 'parent' && m.role !== 'display' && m.id !== member?.id);
  const displayMembers = members.filter((m: Member) => m.role === 'display');

  // ── Display account management (parents only) ──────────────
  const [showAddDisplay, setShowAddDisplay] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [displayPin, setDisplayPin] = useState('');
  const [addDisplayError, setAddDisplayError] = useState('');
  const [addDisplayLoading, setAddDisplayLoading] = useState(false);

  const [editingPinFor, setEditingPinFor] = useState<number | null>(null);
  const [newDisplayPin, setNewDisplayPin] = useState('');
  const [pinResetError, setPinResetError] = useState('');
  const [pinResetSaved, setPinResetSaved] = useState<number | null>(null);

  const handleCreateDisplay = async () => {
    if (!displayName.trim()) { setAddDisplayError('Name is required'); return; }
    if (!/^\d{4}$/.test(displayPin)) { setAddDisplayError('PIN must be exactly 4 digits'); return; }
    setAddDisplayLoading(true);
    setAddDisplayError('');
    try {
      await authCreateDisplay({ name: displayName.trim(), pin: displayPin });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setDisplayName('');
      setDisplayPin('');
      setShowAddDisplay(false);
    } catch (err: any) {
      setAddDisplayError(err.message || 'Failed to create display account');
    } finally {
      setAddDisplayLoading(false);
    }
  };

  const handleResetDisplayPin = async (memberId: number) => {
    if (!/^\d{4}$/.test(newDisplayPin)) { setPinResetError('PIN must be exactly 4 digits'); return; }
    try {
      await resetDisplayPin(memberId, newDisplayPin);
      setPinResetSaved(memberId);
      setNewDisplayPin('');
      setEditingPinFor(null);
      setPinResetError('');
      setTimeout(() => setPinResetSaved(null), 2000);
    } catch (err: any) {
      setPinResetError(err.message || 'Failed to reset PIN');
    }
  };

  // ── Data export & account deletion ─────────────────────────
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await exportUserData();
      const jsonStr = JSON.stringify(data, null, 2);
      // On web, trigger a download; on native, show the data
      if (typeof document !== 'undefined') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chorequest-export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('Export Complete', 'Your data has been exported successfully.');
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Password is required');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
      setShowDeleteConfirm(false);
      setDeletePassword('');
      logout();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: C.text, marginTop: 16, marginBottom: 24 }}>
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
                <Text style={{ color: C.text, fontWeight: '500', fontSize: 16 }}>{user?.displayName}</Text>
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
              <Text style={{ color: C.text, fontWeight: '500' }}>{household?.name}</Text>
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
                  <Text style={{ color: C.text, fontFamily: 'monospace', fontSize: 18, letterSpacing: 4, marginTop: 2 }}>
                    {household.inviteCode}
                  </Text>
                </View>
                <Copy size={18} color={copiedCode ? C.success : C.muted} />
                {copiedCode && <Text style={{ fontSize: 12, color: C.success, marginLeft: 8 }}>Copied!</Text>}
              </Pressable>
            )}

            {/* Member list */}
            {members.map((m: Member, i: number) => {
              const isExpanded = editingPasswordFor?.id === m.id;
              return (
              <View key={m.id} style={i < members.length - 1 && !isExpanded ? { borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.3)' } : {}}>
                <Pressable
                  onPress={member?.role === 'parent' ? () => {
                    if (isExpanded) {
                      setEditingPasswordFor(null);
                      setEditingEmailFor(null);
                    } else {
                      setEditingPasswordFor(m);
                      setEditingEmailFor(null);
                    }
                    setNewPassword('');
                    setPasswordError('');
                    setShowPassword(false);
                    setEmailInput(m.email || '');
                    setEmailError('');
                  } : undefined}
                  style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: m.avatar_color }}>
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>{m.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 14 }}>{m.name}</Text>
                    {m.email ? (
                      <Text style={{ fontSize: 11, color: C.dim }}>{m.email}</Text>
                    ) : m.username ? (
                      <Text style={{ fontSize: 11, color: C.dim }}>@{m.username}</Text>
                    ) : null}
                    {passwordSaved === m.id && <Text style={{ fontSize: 11, color: C.success }}>Password saved</Text>}
                    {emailSaved === m.id && <Text style={{ fontSize: 11, color: C.success }}>Email saved</Text>}
                  </View>
                  {m.role === 'display' ? (
                    <View style={{ backgroundColor: '#64748b30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600' }}>Display</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: C.dim, textTransform: 'capitalize' }}>
                      {m.role || (m.is_parent ? 'parent' : 'child')}
                    </Text>
                  )}
                </Pressable>

                {/* Expanded actions for parents */}
                {isExpanded && member?.role === 'parent' && (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8, ...(i < members.length - 1 ? { borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.3)' } : {}) }}>
                    {/* Password reset */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <KeyRound size={14} color={C.muted} />
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: passwordError ? C.danger : C.border, borderRadius: 8, overflow: 'hidden' }}>
                        <TextInput
                          value={newPassword}
                          onChangeText={(t) => { setNewPassword(t); setPasswordError(''); }}
                          placeholder="New password"
                          placeholderTextColor={C.dim}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{
                            flex: 1, paddingHorizontal: 12, paddingVertical: 8,
                            color: C.text, fontSize: 14,
                          }}
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                          {showPassword ? <EyeOff size={16} color={C.dim} /> : <Eye size={16} color={C.dim} />}
                        </Pressable>
                      </View>
                      <Pressable onPress={() => handleSavePassword(m)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary }}>
                        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Set</Text>
                      </Pressable>
                    </View>
                    {passwordError ? <Text style={{ fontSize: 11, color: C.danger, marginLeft: 22 }}>{passwordError}</Text> : null}

                    {/* Email edit */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Mail size={14} color={C.muted} />
                      <TextInput
                        value={emailInput}
                        onChangeText={(t) => { setEmailInput(t); setEmailError(''); }}
                        placeholder={m.email ? "Update email" : "Add email address"}
                        placeholderTextColor={C.dim}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: emailError ? C.danger : C.border,
                          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                          color: C.text, fontSize: 14,
                        }}
                      />
                      <Pressable onPress={() => handleSaveEmail(m)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary }}>
                        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Set</Text>
                      </Pressable>
                    </View>
                    {emailError ? <Text style={{ fontSize: 11, color: C.danger, marginLeft: 22 }}>{emailError}</Text> : null}

                    {/* Easy Mode toggle */}
                    {m.role !== 'display' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(49,46,90,0.3)' }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ color: C.text, fontWeight: '500', fontSize: 13 }}>Easy Mode</Text>
                          <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Simplified view with big buttons — great for younger kids</Text>
                        </View>
                        <Toggle
                          value={!!(m as any).easy_mode}
                          onValueChange={(val) => {
                            updateMember(m.id, { easy_mode: val } as any).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['members'] });
                            });
                          }}
                        />
                      </View>
                    )}

                    {/* User PIN */}
                    {m.role !== 'display' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                        <KeyRound size={14} color={C.muted} />
                        <Text style={{ color: C.dim, fontSize: 12, flex: 1 }}>Display PIN — used to identify on shared screens</Text>
                      </View>
                    )}

                    {/* Delete member */}
                    <Pressable
                      onPress={() => handleDeleteMember(m)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(49,46,90,0.3)' }}
                    >
                      <Trash2 size={14} color={C.danger} />
                      <Text style={{ color: C.danger, fontSize: 13, fontWeight: '500' }}>Remove from household</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              );
            })}
          </View>

          {/* Display Accounts (parents only) */}
          {member?.role === 'parent' && (
            <>
              <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
                Display Accounts
              </Text>
              <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {displayMembers.length === 0 && !showAddDisplay && (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: C.dim, fontSize: 13 }}>
                      No display accounts yet. Add one for a shared household screen.
                    </Text>
                  </View>
                )}

                {/* Existing display accounts */}
                {displayMembers.map((dm: Member, i: number) => (
                  <View key={dm.id} style={i < displayMembers.length - 1 || showAddDisplay ? { borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.3)' } : {}}>
                    <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16, marginRight: 12,
                        backgroundColor: '#64748b', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Monitor size={16} color="#ffffff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontSize: 14 }}>{dm.name}</Text>
                        {pinResetSaved === dm.id && <Text style={{ fontSize: 11, color: C.success }}>PIN updated</Text>}
                      </View>
                      <View style={{ backgroundColor: '#64748b30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600' }}>Display</Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                      {/* Reset PIN */}
                      {editingPinFor === dm.id ? (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <KeyRound size={14} color={C.muted} />
                            <TextInput
                              value={newDisplayPin}
                              onChangeText={(t) => { setNewDisplayPin(t.replace(/[^0-9]/g, '').slice(0, 4)); setPinResetError(''); }}
                              placeholder="New 4-digit PIN"
                              placeholderTextColor={C.dim}
                              keyboardType="number-pad"
                              maxLength={4}
                              secureTextEntry
                              style={{
                                flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: pinResetError ? C.danger : C.border,
                                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                                color: C.text, fontSize: 14,
                              }}
                            />
                            <Pressable onPress={() => handleResetDisplayPin(dm.id)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary }}>
                              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Set</Text>
                            </Pressable>
                            <Pressable onPress={() => { setEditingPinFor(null); setNewDisplayPin(''); setPinResetError(''); }} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                              <Text style={{ color: C.muted, fontSize: 13 }}>Cancel</Text>
                            </Pressable>
                          </View>
                          {pinResetError ? <Text style={{ fontSize: 11, color: C.danger, marginLeft: 22, marginTop: 4 }}>{pinResetError}</Text> : null}
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <Pressable
                            onPress={() => { setEditingPinFor(dm.id); setNewDisplayPin(''); setPinResetError(''); }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
                          >
                            <KeyRound size={13} color={C.primaryLight} />
                            <Text style={{ color: C.primaryLight, fontSize: 13 }}>Reset PIN</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteMember(dm)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
                          >
                            <Trash2 size={13} color={C.danger} />
                            <Text style={{ color: C.danger, fontSize: 13 }}>Remove</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                ))}

                {/* Add display form */}
                {showAddDisplay ? (
                  <View style={{ padding: 16, gap: 10 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginBottom: 4 }}>New Display Account</Text>
                    <View>
                      <Text style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Name</Text>
                      <TextInput
                        value={displayName}
                        onChangeText={(t) => { setDisplayName(t); setAddDisplayError(''); }}
                        placeholder="e.g. Kitchen Display"
                        placeholderTextColor={C.dim}
                        style={{
                          backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
                          color: C.text, fontSize: 14,
                        }}
                      />
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>4-Digit PIN</Text>
                      <TextInput
                        value={displayPin}
                        onChangeText={(t) => { setDisplayPin(t.replace(/[^0-9]/g, '').slice(0, 4)); setAddDisplayError(''); }}
                        placeholder="0000"
                        placeholderTextColor={C.dim}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                        style={{
                          backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
                          color: C.text, fontSize: 14, letterSpacing: 8, textAlign: 'center',
                        }}
                      />
                    </View>
                    {addDisplayError ? <Text style={{ fontSize: 12, color: C.danger }}>{addDisplayError}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Pressable
                        onPress={handleCreateDisplay}
                        disabled={addDisplayLoading}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.primary,
                          alignItems: 'center', opacity: addDisplayLoading ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
                          {addDisplayLoading ? 'Creating...' : 'Create'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setShowAddDisplay(false); setDisplayName(''); setDisplayPin(''); setAddDisplayError(''); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.surface3, alignItems: 'center' }}
                      >
                        <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowAddDisplay(true)}
                    style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Plus size={16} color={C.primaryLight} />
                    <Text style={{ color: C.primaryLight, fontSize: 14, fontWeight: '500' }}>Add Display</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* Reward System Settings (parents only) */}
          {member?.role === 'parent' && allowanceSettings && (
            <>
              <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
                Reward System
              </Text>
              <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {/* Enable/Disable */}
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>Rewards Enabled</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>Enable the chore reward system</Text>
                  </View>
                  <Toggle
                    value={allowanceEnabled}
                    onValueChange={toggleAllowanceEnabled}
                  />
                </View>

                {/* Reward Mode Selector */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginBottom: 4 }}>Reward Mode</Text>
                  <Text style={{ color: C.dim, fontSize: 12, marginBottom: 12 }}>How your family earns money from chores</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => updateSettingsMut.mutate({ reward_mode: 'allowance' })}
                      style={{
                        flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center',
                        backgroundColor: (allowanceSettings.reward_mode || 'allowance') === 'allowance' ? C.primary : C.surface3,
                        borderWidth: 1, borderColor: (allowanceSettings.reward_mode || 'allowance') === 'allowance' ? C.primary : C.border,
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>Allowance</Text>
                      <Text style={{ color: (allowanceSettings.reward_mode || 'allowance') === 'allowance' ? 'rgba(255,255,255,0.7)' : C.dim, fontSize: 10, marginTop: 4, textAlign: 'center' }}>
                        Auto-pay when all{'\n'}daily chores done
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updateSettingsMut.mutate({ reward_mode: 'points_economy' })}
                      style={{
                        flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center',
                        backgroundColor: allowanceSettings.reward_mode === 'points_economy' ? C.primary : C.surface3,
                        borderWidth: 1, borderColor: allowanceSettings.reward_mode === 'points_economy' ? C.primary : C.border,
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>Points Economy</Text>
                      <Text style={{ color: allowanceSettings.reward_mode === 'points_economy' ? 'rgba(255,255,255,0.7)' : C.dim, fontSize: 10, marginTop: 4, textAlign: 'center' }}>
                        Kids spend points on{'\n'}rewards or cash out
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Rate per point (both modes) */}
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>Point Value</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
                      {(allowanceSettings.reward_mode || 'allowance') === 'allowance'
                        ? 'Each point earned converts to this dollar amount'
                        : 'Cash out rate when converting points to money'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: C.muted, fontSize: 16, marginRight: 4 }}>$</Text>
                    <TextInput
                      value={rateInput}
                      onChangeText={setRateInput}
                      onBlur={saveRate}
                      keyboardType="decimal-pad"
                      style={{
                        backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                        color: C.text, fontSize: 16, fontWeight: '600',
                        width: 80, textAlign: 'center',
                      }}
                    />
                  </View>
                </View>

                {/* All-or-nothing (allowance mode only) */}
                {(allowanceSettings.reward_mode || 'allowance') === 'allowance' && (
                  <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>All-or-Nothing</Text>
                      <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>All tasks must be completed to earn allowance for the day</Text>
                    </View>
                    <Toggle
                      value={allOrNothing}
                      onValueChange={toggleAllOrNothing}
                    />
                  </View>
                )}

                {/* Bonus: Early Bird */}
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>Early Bird Bonus</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>+{allowanceSettings?.bonus_early_bird_amount || 1} point for tasks completed before noon</Text>
                  </View>
                  <Toggle
                    value={allowanceSettings?.bonus_early_bird || false}
                    onValueChange={(val) => updateSettingsMut.mutate({ bonus_early_bird: val })}
                  />
                </View>

                {/* Bonus: Daily Completion */}
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>Daily Completion Bonus</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>+{allowanceSettings?.bonus_daily_completion_amount || 1} point when all daily tasks are done</Text>
                  </View>
                  <Toggle
                    value={allowanceSettings?.bonus_daily_completion || false}
                    onValueChange={(val) => updateSettingsMut.mutate({ bonus_daily_completion: val })}
                  />
                </View>

                {/* Bonus: Weekly Streak */}
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14 }}>Weekly Streak Bonus</Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>+{allowanceSettings?.bonus_weekly_streak_amount || 3} points for completing all tasks every day for 7 days</Text>
                  </View>
                  <Toggle
                    value={allowanceSettings?.bonus_weekly_streak || false}
                    onValueChange={(val) => updateSettingsMut.mutate({ bonus_weekly_streak: val })}
                  />
                </View>
              </View>
            </>
          )}

          {/* Safety Section (parents only) */}
          {member?.role === 'parent' && (
            <>
              <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
                Safety
              </Text>
              <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {/* Request Check-in */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <MapPin size={16} color={C.primary} />
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginLeft: 8 }}>Request Check-in</Text>
                  </View>
                  {childMembers.length === 0 ? (
                    <Text style={{ color: C.dim, fontSize: 13 }}>No other members to check in on</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {childMembers.map((m: Member) => (
                          <Pressable
                            key={m.id}
                            onPress={() => setCheckinTarget(checkinTarget === m.id ? null : m.id)}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 6,
                              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                              backgroundColor: checkinTarget === m.id ? C.primary : C.surface3,
                              borderWidth: 1, borderColor: checkinTarget === m.id ? C.primary : C.border,
                            }}
                          >
                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: m.avatar_color, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 9 }}>{m.name.charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={{ color: checkinTarget === m.id ? '#ffffff' : C.text, fontSize: 13 }}>{m.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        onPress={handleRequestCheckin}
                        disabled={!checkinTarget || checkinSending}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          paddingVertical: 10, borderRadius: 8,
                          backgroundColor: checkinTarget ? C.primary : C.surface3,
                          opacity: !checkinTarget || checkinSending ? 0.5 : 1,
                        }}
                      >
                        <Send size={14} color={checkinTarget ? '#ffffff' : C.dim} />
                        <Text style={{ color: checkinTarget ? '#ffffff' : C.dim, fontSize: 13, fontWeight: '600' }}>
                          {checkinSent ? 'Sent!' : checkinSending ? 'Sending...' : 'Send Request'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Recent SOS Alerts */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <ShieldAlert size={16} color={C.danger} />
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginLeft: 8 }}>SOS Alerts</Text>
                    {unresolvedSOS.length > 0 && (
                      <View style={{ marginLeft: 8, backgroundColor: C.danger, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{unresolvedSOS.length}</Text>
                      </View>
                    )}
                  </View>
                  {sosAlerts.length === 0 ? (
                    <Text style={{ color: C.dim, fontSize: 13 }}>No recent alerts</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {sosAlerts.slice(0, 5).map((alert: SOSAlert) => (
                        <View key={alert.id} style={{
                          flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface3,
                          borderRadius: 8, padding: 10, borderLeftWidth: 3,
                          borderLeftColor: alert.is_resolved ? C.success : C.danger,
                        }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.text, fontSize: 13, fontWeight: '500' }}>
                              {alert.member_name || `Member #${alert.member_id}`}
                            </Text>
                            <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                              {new Date(alert.created_at).toLocaleString()}
                              {alert.message ? ` - ${alert.message}` : ''}
                            </Text>
                          </View>
                          {!alert.is_resolved ? (
                            <Pressable
                              onPress={() => handleResolveSOS(alert.id)}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(34,197,94,0.2)' }}
                            >
                              <Text style={{ color: C.success, fontSize: 12, fontWeight: '600' }}>Resolve</Text>
                            </Pressable>
                          ) : (
                            <CheckCircle2 size={16} color={C.success} />
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Recent Check-in Responses */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Clock size={16} color={C.warning} />
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginLeft: 8 }}>Recent Check-ins</Text>
                  </View>
                  {checkins.length === 0 ? (
                    <Text style={{ color: C.dim, fontSize: 13 }}>No recent check-ins</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {checkins.slice(0, 5).map((c: CheckinRequest) => (
                        <View key={c.id} style={{
                          flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface3,
                          borderRadius: 8, padding: 10, borderLeftWidth: 3,
                          borderLeftColor: c.status === 'responded' ? C.success : c.status === 'pending' ? C.warning : C.dim,
                        }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.text, fontSize: 13, fontWeight: '500' }}>
                              {c.requested_of_name || `Member #${c.requested_of}`}
                            </Text>
                            <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                              {new Date(c.created_at).toLocaleString()}
                            </Text>
                          </View>
                          <View style={{
                            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
                            backgroundColor: c.status === 'responded' ? 'rgba(34,197,94,0.15)' : c.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                          }}>
                            <Text style={{
                              fontSize: 11, fontWeight: '500', textTransform: 'capitalize',
                              color: c.status === 'responded' ? C.success : c.status === 'pending' ? C.warning : C.dim,
                            }}>{c.status}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Geofences placeholder */}
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <MapPin size={16} color={C.muted} />
                    <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginLeft: 8 }}>Geofences</Text>
                  </View>
                  <Text style={{ color: C.dim, fontSize: 13 }}>
                    Geofence management coming soon. Set up zones like home, school, or work and get notified when family members enter or leave.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Actions */}
          <Text style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
            Account
          </Text>
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {/* Theme toggle */}
            <View style={{ padding: 16 }}>
              <Text style={{ color: C.text, fontWeight: '500', fontSize: 14, marginBottom: 12 }}>Appearance</Text>
              <View style={{ flexDirection: 'row', backgroundColor: C.surface3, borderRadius: 10, padding: 3 }}>
                {([
                  { key: 'dark' as ThemeMode, label: 'Dark', Icon: Moon },
                  { key: 'light' as ThemeMode, label: 'Light', Icon: Sun },
                  { key: 'system' as ThemeMode, label: 'System', Icon: Monitor },
                ]).map(({ key, label, Icon }) => {
                  const active = mode === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTheme(key)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        paddingVertical: 8, borderRadius: 8,
                        backgroundColor: active ? C.primary : 'transparent',
                      }}
                    >
                      <Icon size={14} color={active ? '#ffffff' : C.muted} />
                      <Text style={{ color: active ? '#ffffff' : C.muted, fontSize: 13, fontWeight: active ? '600' : '400', marginLeft: 6 }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {/* Export My Data */}
            <Pressable
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(49,46,90,0.5)', opacity: exporting ? 0.5 : 1 }}
              onPress={handleExportData}
              disabled={exporting}
            >
              <Download size={18} color={C.primary} />
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '500', marginLeft: 12 }}>
                {exporting ? 'Exporting...' : 'Export My Data'}
              </Text>
            </Pressable>

            {/* Delete Account */}
            <Pressable
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: showDeleteConfirm ? 1 : 0, borderBottomColor: 'rgba(49,46,90,0.5)' }}
              onPress={() => {
                setShowDeleteConfirm(!showDeleteConfirm);
                setDeletePassword('');
                setDeleteError('');
              }}
            >
              <AlertTriangle size={18} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: 14, fontWeight: '500', marginLeft: 12 }}>Delete Account</Text>
            </Pressable>

            {/* Delete confirmation panel */}
            {showDeleteConfirm && (
              <View style={{ padding: 16, backgroundColor: 'rgba(239,68,68,0.05)' }}>
                <Text style={{ color: C.text, fontSize: 13, marginBottom: 8 }}>
                  {member?.role === 'parent'
                    ? 'This will permanently delete your account and ALL household data including tasks, rewards, and all member accounts. This cannot be undone.'
                    : 'This will permanently delete your account. Your task history will remain but your login will be removed. This cannot be undone.'}
                </Text>
                <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Enter your password to confirm:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={deletePassword}
                    onChangeText={(t) => { setDeletePassword(t); setDeleteError(''); }}
                    placeholder="Your password"
                    placeholderTextColor={C.dim}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: deleteError ? C.danger : C.border,
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                      color: C.text, fontSize: 14,
                    }}
                  />
                  <Pressable
                    onPress={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
                      backgroundColor: C.danger,
                      opacity: deleting || !deletePassword ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
                {deleteError ? <Text style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>{deleteError}</Text> : null}
              </View>
            )}
          </View>

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
