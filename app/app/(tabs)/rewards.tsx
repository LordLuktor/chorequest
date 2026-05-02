import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Alert, Platform } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getRewards, createReward, updateReward, deleteReward, redeemReward,
  getRedemptions, resolveRedemption, getMembers,
  submitRewardRequest, getRewardRequests, resolveRewardRequest,
  type Reward, type RewardRedemption, type RewardRequest,
} from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { Gift, Plus, Edit3, Trash2, RefreshCw, Check, X, ShoppingBag, Clock, Star, Lightbulb, MessageSquare } from 'lucide-react-native';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const EMOJI_OPTIONS = ['🎮', '🍕', '🎬', '📱', '🛍️', '🎵', '🏊', '⭐', '🎁', '🍦', '📚', '🎨', '🚴', '🧸', '💤', '🎪'];

interface RewardFormData {
  title: string;
  description: string;
  icon: string;
  cost_points: string;
}

const emptyForm: RewardFormData = { title: '', description: '', icon: '🎁', cost_points: '' };

export default function RewardsScreen() {
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [form, setForm] = useState<RewardFormData>(emptyForm);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const isParent = member?.role === 'parent';
  const memberId = member?.id;

  const { data: rewards = [] } = useQuery({
    queryKey: ['rewards'],
    queryFn: getRewards,
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ['redemptions'],
    queryFn: getRedemptions,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const currentMember = members.find(m => m.id === memberId);
  const myPoints = currentMember?.points_total ?? 0;

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: { title: string; description?: string; icon?: string; cost_points: number }) => createReward(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rewards'] }); closeModal(); },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Reward> }) => updateReward(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rewards'] }); closeModal(); },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteReward(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rewards'] }),
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const redeemMut = useMutation({
    mutationFn: (id: number) => redeemReward(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      showAlert('Success', 'Reward redeemed! Awaiting parent approval.');
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'denied' }) => resolveRedemption(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  // Reward requests
  const { data: rewardRequests = [] } = useQuery({
    queryKey: ['rewardRequests'],
    queryFn: getRewardRequests,
  });

  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestDesc, setSuggestDesc] = useState('');
  const [suggestIcon, setSuggestIcon] = useState('🎁');
  const [suggestPoints, setSuggestPoints] = useState('');
  const [requestCostInput, setRequestCostInput] = useState('');

  const suggestMut = useMutation({
    mutationFn: () => submitRewardRequest({
      title: suggestTitle.trim(),
      description: suggestDesc.trim() || undefined,
      icon: suggestIcon,
      suggested_points: suggestPoints ? parseInt(suggestPoints) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewardRequests'] });
      setSuggestTitle(''); setSuggestDesc(''); setSuggestIcon('🎁'); setSuggestPoints('');
      setShowSuggestForm(false);
      showAlert('Sent', 'Reward suggestion sent to your parents!');
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const resolveRequestMut = useMutation({
    mutationFn: ({ id, status, cost_points }: { id: number; status: 'approved' | 'denied'; cost_points?: number }) =>
      resolveRewardRequest(id, status, cost_points),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewardRequests'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      setRequestCostInput('');
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const pendingRequests = rewardRequests.filter(r => r.status === 'pending');

  function showAlert(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rewards'] }),
      queryClient.invalidateQueries({ queryKey: ['redemptions'] }),
      queryClient.invalidateQueries({ queryKey: ['members'] }),
      queryClient.invalidateQueries({ queryKey: ['rewardRequests'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  function openCreate() {
    setEditingReward(null);
    setForm(emptyForm);
    setShowIconPicker(false);
    setModalVisible(true);
  }

  function openEdit(reward: Reward) {
    setEditingReward(reward);
    setForm({
      title: reward.title,
      description: reward.description || '',
      icon: reward.icon || '🎁',
      cost_points: String(reward.cost_points),
    });
    setShowIconPicker(false);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingReward(null);
    setForm(emptyForm);
    setShowIconPicker(false);
  }

  function handleSave() {
    const title = form.title.trim();
    if (!title) { showAlert('Error', 'Title is required'); return; }
    const cost = parseInt(form.cost_points, 10);
    if (!cost || cost < 1) { showAlert('Error', 'Cost must be at least 1 point'); return; }

    const payload = {
      title,
      description: form.description.trim() || undefined,
      icon: form.icon || undefined,
      cost_points: cost,
    };

    if (editingReward) {
      updateMut.mutate({ id: editingReward.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function handleDelete(reward: Reward) {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${reward.title}" from the rewards catalog?`)) {
        deleteMut.mutate(reward.id);
      }
    } else {
      Alert.alert('Remove Reward', `Remove "${reward.title}" from the catalog?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMut.mutate(reward.id) },
      ]);
    }
  }

  function handleRedeem(reward: Reward) {
    if (Platform.OS === 'web') {
      if (window.confirm(`Spend ${reward.cost_points} points on "${reward.title}"?`)) {
        redeemMut.mutate(reward.id);
      }
    } else {
      Alert.alert('Redeem Reward', `Spend ${reward.cost_points} points on "${reward.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeemMut.mutate(reward.id) },
      ]);
    }
  }

  // Split redemptions
  const pendingRedemptions = redemptions.filter((r: RewardRedemption) => r.status === 'pending');
  const myRedemptions = redemptions.filter((r: RewardRedemption) => r.member_id === memberId);
  const myPending = myRedemptions.filter((r: RewardRedemption) => r.status === 'pending');
  const myResolved = myRedemptions.filter((r: RewardRedemption) => r.status !== 'pending');

  const statusColor = (status: string) => {
    if (status === 'approved') return C.success;
    if (status === 'denied') return C.danger;
    return C.warning;
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20,  }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: 'white' }}>Rewards</Text>
          <Pressable onPress={onRefresh} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
            <RefreshCw size={16} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
          </Pressable>
        </View>

        {/* Points balance */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 20 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '30', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Star size={20} color={C.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.muted }}>My Balance</Text>
            <Text style={{ fontSize: 24, fontWeight: '700', color: 'white' }}>{myPoints}<Text style={{ fontSize: 14, fontWeight: '400', color: C.muted }}> pts</Text></Text>
          </View>
          {myPending.length > 0 && (
            <View style={{ backgroundColor: C.warning + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.warning }}>{myPending.length} pending</Text>
            </View>
          )}
        </View>

        {/* Rewards Catalog */}
        <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 12 }}>Catalog</Text>

        {rewards.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 24 }}>
            <Gift size={40} color={C.border} />
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 12 }}>No rewards yet</Text>
            {isParent && <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Tap + below to create the first reward</Text>}
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 24 }}>
            {rewards.map((reward: Reward) => {
              const canAfford = myPoints >= reward.cost_points;
              return (
                <View
                  key={reward.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border,
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 22 }}>{reward.icon || '🎁'}</Text>
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: 'white' }}>{reward.title}</Text>
                    {reward.description ? (
                      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }} numberOfLines={2}>{reward.description}</Text>
                    ) : null}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.primaryLight, marginTop: 4 }}>
                      {reward.cost_points} pts
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleRedeem(reward)}
                    disabled={!canAfford || redeemMut.isPending}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: canAfford ? C.primary : C.surface3,
                      opacity: redeemMut.isPending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: canAfford ? 'white' : C.dim }}>
                      {canAfford ? 'Redeem' : 'Need more'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* My Redemptions */}
        {myRedemptions.length > 0 && (
          <>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 12 }}>My Redemptions</Text>
            <View style={{ gap: 8, marginBottom: 24 }}>
              {myRedemptions.slice(0, 20).map((r: RewardRedemption) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: 'white' }}>{r.reward_title}</Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {r.points_spent} pts  --  {new Date(r.redeemed_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: statusColor(r.status) + '20' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor(r.status), textTransform: 'capitalize' }}>{r.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Suggest a Reward (non-parents) ──────────────────── */}
        {!isParent && (
          <View style={{ marginBottom: 24 }}>
            <Pressable
              onPress={() => setShowSuggestForm(!showSuggestForm)}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
            >
              <Lightbulb size={18} color={C.primaryLight} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Suggest a Reward</Text>
            </Pressable>
            {showSuggestForm && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
                <View>
                  <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>What reward do you want?</Text>
                  <TextInput
                    value={suggestTitle}
                    onChangeText={setSuggestTitle}
                    placeholder="e.g. Movie night, Pizza for dinner"
                    placeholderTextColor={C.dim}
                    maxLength={100}
                    style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 }}
                  />
                </View>
                <View>
                  <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Why? (optional)</Text>
                  <TextInput
                    value={suggestDesc}
                    onChangeText={setSuggestDesc}
                    placeholder="Tell your parents why you want this"
                    placeholderTextColor={C.dim}
                    maxLength={500}
                    multiline
                    style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14, minHeight: 60 }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Icon</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {EMOJI_OPTIONS.slice(0, 8).map(e => (
                        <Pressable
                          key={e}
                          onPress={() => setSuggestIcon(e)}
                          style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: suggestIcon === e ? C.primary : C.surface3 }}
                        >
                          <Text style={{ fontSize: 16 }}>{e}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={{ width: 90 }}>
                    <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Points?</Text>
                    <TextInput
                      value={suggestPoints}
                      onChangeText={setSuggestPoints}
                      placeholder="50"
                      placeholderTextColor={C.dim}
                      keyboardType="number-pad"
                      style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14, textAlign: 'center' }}
                    />
                  </View>
                </View>
                <Pressable
                  onPress={() => { if (suggestTitle.trim()) suggestMut.mutate(); }}
                  style={{ paddingVertical: 12, borderRadius: 10, backgroundColor: suggestTitle.trim() ? C.primary : C.surface3, alignItems: 'center' }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>
                    {suggestMut.isPending ? 'Sending...' : 'Send Suggestion'}
                  </Text>
                </Pressable>
              </View>
            )}
            {!showSuggestForm && (
              <Pressable
                onPress={() => setShowSuggestForm(true)}
                style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <MessageSquare size={16} color={C.primaryLight} />
                <Text style={{ color: C.primaryLight, fontSize: 14, fontWeight: '500' }}>Suggest a reward to your parents</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Parent-only sections ───────────────────────────────── */}
        {isParent && (
          <>
            {/* Reward Requests from kids */}
            {pendingRequests.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
                  <Lightbulb size={18} color={C.primaryLight} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Reward Requests</Text>
                  <View style={{ marginLeft: 8, backgroundColor: C.primary + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.primaryLight }}>{pendingRequests.length}</Text>
                  </View>
                </View>
                <View style={{ gap: 8, marginBottom: 24 }}>
                  {pendingRequests.map((rq: RewardRequest) => (
                    <View key={rq.id} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontSize: 20, marginRight: 10 }}>{rq.icon || '🎁'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{rq.title}</Text>
                          <Text style={{ fontSize: 12, color: C.muted }}>
                            Requested by {rq.requested_by_name}
                            {rq.suggested_points ? ` · suggested ${rq.suggested_points} pts` : ''}
                          </Text>
                        </View>
                      </View>
                      {rq.description ? (
                        <Text style={{ fontSize: 12, color: C.dim, marginBottom: 10, fontStyle: 'italic' }}>"{rq.description}"</Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          value={requestCostInput}
                          onChangeText={setRequestCostInput}
                          placeholder={String(rq.suggested_points || 10)}
                          placeholderTextColor={C.dim}
                          keyboardType="number-pad"
                          style={{ flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontSize: 14, textAlign: 'center' }}
                        />
                        <Text style={{ color: C.dim, fontSize: 12 }}>pts</Text>
                        <Pressable
                          onPress={() => resolveRequestMut.mutate({ id: rq.id, status: 'approved', cost_points: parseInt(requestCostInput) || rq.suggested_points || 10 })}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.success }}
                        >
                          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Add</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => resolveRequestMut.mutate({ id: rq.id, status: 'denied' })}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surface3 }}
                        >
                          <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>Deny</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Pending Approvals */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
              <Clock size={18} color={C.warning} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Pending Approvals</Text>
              {pendingRedemptions.length > 0 && (
                <View style={{ marginLeft: 8, backgroundColor: C.warning + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.warning }}>{pendingRedemptions.length}</Text>
                </View>
              )}
            </View>

            {pendingRedemptions.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 24 }}>
                <Text style={{ color: C.dim, fontSize: 13 }}>No pending redemptions</Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginBottom: 24 }}>
                {pendingRedemptions.map((r: RewardRedemption) => (
                  <View
                    key={r.id}
                    style={{
                      backgroundColor: C.card, borderRadius: 12, padding: 14,
                      borderWidth: 1, borderColor: C.warning + '40',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: 'white' }}>{r.reward_title}</Text>
                        <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {r.member_name}  --  {r.points_spent} pts
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        onPress={() => resolveMut.mutate({ id: r.id, status: 'approved' })}
                        disabled={resolveMut.isPending}
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          paddingVertical: 10, borderRadius: 8, backgroundColor: C.success + '20',
                        }}
                      >
                        <Check size={16} color={C.success} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.success, marginLeft: 6 }}>Approve</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => resolveMut.mutate({ id: r.id, status: 'denied' })}
                        disabled={resolveMut.isPending}
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          paddingVertical: 10, borderRadius: 8, backgroundColor: C.danger + '20',
                        }}
                      >
                        <X size={16} color={C.danger} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.danger, marginLeft: 6 }}>Deny</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Manage Rewards */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShoppingBag size={18} color={C.primaryLight} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Manage Rewards</Text>
              </View>
              <Pressable
                onPress={openCreate}
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: 8, backgroundColor: C.primary,
                }}
              >
                <Plus size={16} color="white" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'white', marginLeft: 4 }}>New</Text>
              </Pressable>
            </View>

            {rewards.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 32 }}>
                <Text style={{ color: C.dim, fontSize: 13 }}>Create your first reward above</Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginBottom: 32 }}>
                {rewards.map((reward: Reward) => (
                  <View
                    key={reward.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                      borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginRight: 10 }}>{reward.icon || '🎁'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: 'white' }}>{reward.title}</Text>
                      <Text style={{ fontSize: 12, color: C.primaryLight }}>{reward.cost_points} pts</Text>
                    </View>
                    <Pressable
                      onPress={() => openEdit(reward)}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3, marginRight: 6 }}
                    >
                      <Edit3 size={16} color={C.primaryLight} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(reward)}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: C.danger + '15' }}
                    >
                      <Trash2 size={16} color={C.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Create/Edit Modal ──────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable
          onPress={closeModal}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: 24, maxHeight: '80%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 20, textAlign: 'center' }}>
              {editingReward ? 'Edit Reward' : 'New Reward'}
            </Text>

            {/* Icon picker */}
            <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Icon</Text>
            <Pressable
              onPress={() => setShowIconPicker(!showIconPicker)}
              style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface3,
                borderRadius: 10, padding: 12, marginBottom: showIconPicker ? 8 : 16,
                borderWidth: 1, borderColor: C.border,
              }}
            >
              <Text style={{ fontSize: 28, marginRight: 10 }}>{form.icon}</Text>
              <Text style={{ fontSize: 13, color: C.muted }}>Tap to change</Text>
            </Pressable>

            {showIconPicker && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => { setForm(f => ({ ...f, icon: emoji })); setShowIconPicker(false); }}
                    style={{
                      width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: form.icon === emoji ? C.primary + '30' : C.surface3,
                      borderWidth: form.icon === emoji ? 1 : 0,
                      borderColor: C.primary,
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Title */}
            <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Title *</Text>
            <TextInput
              value={form.title}
              onChangeText={(t) => setForm(f => ({ ...f, title: t }))}
              placeholder="e.g. Extra screen time"
              placeholderTextColor={C.dim}
              maxLength={100}
              style={{
                backgroundColor: C.surface3, borderRadius: 10, padding: 12, fontSize: 15,
                color: 'white', borderWidth: 1, borderColor: C.border, marginBottom: 16,
              }}
            />

            {/* Description */}
            <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput
              value={form.description}
              onChangeText={(t) => setForm(f => ({ ...f, description: t }))}
              placeholder="Details about this reward..."
              placeholderTextColor={C.dim}
              maxLength={500}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: C.surface3, borderRadius: 10, padding: 12, fontSize: 14,
                color: 'white', borderWidth: 1, borderColor: C.border, marginBottom: 16,
                minHeight: 70, textAlignVertical: 'top',
              }}
            />

            {/* Cost */}
            <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Point Cost *</Text>
            <TextInput
              value={form.cost_points}
              onChangeText={(t) => setForm(f => ({ ...f, cost_points: t.replace(/[^0-9]/g, '') }))}
              placeholder="e.g. 50"
              placeholderTextColor={C.dim}
              keyboardType="number-pad"
              maxLength={7}
              style={{
                backgroundColor: C.surface3, borderRadius: 10, padding: 12, fontSize: 15,
                color: 'white', borderWidth: 1, borderColor: C.border, marginBottom: 24,
              }}
            />

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={closeModal}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
                  backgroundColor: C.surface3, borderWidth: 1, borderColor: C.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.muted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
                  backgroundColor: C.primary, opacity: isSaving ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>
                  {isSaving ? 'Saving...' : (editingReward ? 'Update' : 'Create')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
