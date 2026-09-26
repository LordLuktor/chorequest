import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays, addWeeks, startOfWeek } from 'date-fns';
import {
  Coffee, Sandwich, RefreshCw, Plus, Edit3, Trash2,
  Lightbulb, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import {
  getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
  getMenuSelections, setMenuSelection, swapMenuLunches, clearMenuSelection,
  submitMenuItemRequest, getMenuItemRequests, resolveMenuItemRequest,
  getMembers,
  type MenuItem, type MenuItemRequest,
} from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
}

interface ItemFormData {
  name: string;
  meal_slot: 'breakfast' | 'lunch';
  member_id: number | null; // null = everyone
  weekly_limit: string; // blank = unlimited
  limit_scope: 'per_kid' | 'shared';
  available_days: number[]; // 1=Mon..5=Fri, lunch only; empty = every day
}

const emptyForm: ItemFormData = { name: '', meal_slot: 'breakfast', member_id: null, weekly_limit: '', limit_scope: 'per_kid', available_days: [] };

function formatAvailableDays(days: number[]): string {
  return days.map(d => DAY_LABELS[d - 1]).join(', ');
}

export default function MenuScreen() {
  const { member } = useAuth();
  const queryClient = useQueryClient();
  const tabBarPadding = useTabBarPadding();
  const insets = useSafeAreaInsets();
  const sheetPaddingBottom = 24 + insets.bottom;
  const [refreshing, setRefreshing] = useState(false);
  const isParent = member?.role === 'parent';
  const memberId = member?.id;

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset), [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')), [weekStart]);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ── Kid data ──────────────────────────────────────────────────
  const { data: breakfastItems = [] } = useQuery({
    queryKey: ['menuItems', 'breakfast'],
    queryFn: () => getMenuItems({ meal_slot: 'breakfast' }),
    enabled: !isParent,
  });
  const { data: selections = [] } = useQuery({
    queryKey: ['menuSelections', memberId, weekDays[0], weekDays[4]],
    queryFn: () => getMenuSelections({ start: weekDays[0], end: weekDays[4] }),
    enabled: !isParent,
  });

  function findSelection(date: string, slot: 'breakfast' | 'lunch') {
    return selections.find(s => s.date === date && s.meal_slot === slot);
  }

  const setMut = useMutation({
    mutationFn: (data: { date: string; meal_slot: 'breakfast' | 'lunch'; menu_item_id: number }) => setMenuSelection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuSelections'] });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const swapMut = useMutation({
    mutationFn: (data: { date_a: string; date_b: string }) => swapMenuLunches(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menuSelections'] }),
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const clearMut = useMutation({
    mutationFn: (data: { date: string; meal_slot: 'breakfast' | 'lunch' }) => clearMenuSelection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuSelections'] });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const [pickerFor, setPickerFor] = useState<{ date: string } | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);

  // ── Item requests (both roles) ───────────────────────────────
  const { data: itemRequests = [] } = useQuery({
    queryKey: ['menuItemRequests'],
    queryFn: getMenuItemRequests,
  });
  const pendingRequests = itemRequests.filter(r => r.status === 'pending');
  const myRequests = itemRequests.filter(r => r.requested_by === memberId);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestSlot, setRequestSlot] = useState<'breakfast' | 'lunch'>('breakfast');
  const [requestName, setRequestName] = useState('');
  const [resolveLimitInput, setResolveLimitInput] = useState('');

  const requestMut = useMutation({
    mutationFn: () => submitMenuItemRequest({ meal_slot: requestSlot, name: requestName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItemRequests'] });
      setRequestName(''); setShowRequestForm(false);
      showAlert('Sent', 'Request sent to your parents!');
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  const resolveRequestMut = useMutation({
    mutationFn: ({ id, status, weekly_limit }: { id: number; status: 'approved' | 'denied'; weekly_limit?: number }) =>
      resolveMenuItemRequest(id, status, weekly_limit !== undefined ? { weekly_limit } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItemRequests'] });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setResolveLimitInput('');
    },
    onError: (err: Error) => showAlert('Error', err.message),
  });

  // ── Parent catalog management ────────────────────────────────
  const { data: catalog = [] } = useQuery({
    queryKey: ['menuCatalog'],
    queryFn: () => getMenuItems(),
    enabled: isParent,
  });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, enabled: isParent });
  const kids = members.filter(m => m.role === 'child');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<ItemFormData>(emptyForm);

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof createMenuItem>[0]) => createMenuItem(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menuCatalog'] }); closeModal(); },
    onError: (err: Error) => showAlert('Error', err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateMenuItem>[1] }) => updateMenuItem(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menuCatalog'] }); closeModal(); },
    onError: (err: Error) => showAlert('Error', err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMenuItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menuCatalog'] }),
    onError: (err: Error) => showAlert('Error', err.message),
  });

  function openCreate(slot: 'breakfast' | 'lunch') {
    setEditingItem(null);
    setForm({ ...emptyForm, meal_slot: slot });
    setModalVisible(true);
  }
  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      meal_slot: item.meal_slot,
      member_id: item.member_id,
      weekly_limit: item.weekly_limit !== null ? String(item.weekly_limit) : '',
      limit_scope: item.limit_scope,
      available_days: item.available_days || [],
    });
    setModalVisible(true);
  }
  function closeModal() {
    setModalVisible(false);
    setEditingItem(null);
    setForm(emptyForm);
  }
  function handleSave() {
    const name = form.name.trim();
    if (!name) { showAlert('Error', 'Name is required'); return; }
    const limit = form.weekly_limit.trim() ? parseInt(form.weekly_limit, 10) : null;
    if (form.weekly_limit.trim() && (!Number.isFinite(limit) || (limit as number) < 1)) {
      showAlert('Error', 'Weekly limit must be a positive number'); return;
    }
    const payload = {
      name, meal_slot: form.meal_slot, member_id: form.member_id, weekly_limit: limit, limit_scope: form.limit_scope,
      available_days: form.meal_slot === 'lunch' && form.available_days.length > 0 ? form.available_days : null,
    };
    if (editingItem) {
      updateMut.mutate({ id: editingItem.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }
  function handleDelete(item: MenuItem) {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${item.name}" from the menu?`)) deleteMut.mutate(item.id);
    } else {
      Alert.alert('Remove Item', `Remove "${item.name}" from the menu?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMut.mutate(item.id) },
      ]);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['menuItems'] }),
      queryClient.invalidateQueries({ queryKey: ['menuSelections'] }),
      queryClient.invalidateQueries({ queryKey: ['menuItemRequests'] }),
      queryClient.invalidateQueries({ queryKey: ['menuCatalog'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const pickerItems = breakfastItems;
  const swapOptions = swapFor
    ? weekDays.filter(d => d !== swapFor && d >= todayStr && findSelection(d, 'lunch'))
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: tabBarPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: 'white' }}>Menu</Text>
          <Pressable onPress={onRefresh} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
            <RefreshCw size={16} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
          </Pressable>
        </View>

        {!isParent && (
          <>
            {/* Week navigation */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Pressable onPress={() => setWeekOffset(w => w - 1)} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
                <ChevronLeft size={18} color={C.muted} />
              </Pressable>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                {format(addDays(weekStart, 0), 'MMM d')} – {format(addDays(weekStart, 4), 'MMM d')}
              </Text>
              <Pressable onPress={() => setWeekOffset(w => w + 1)} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3 }}>
                <ChevronRight size={18} color={C.muted} />
              </Pressable>
            </View>

            {/* Breakfast */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Coffee size={18} color={C.primaryLight} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Breakfast</Text>
            </View>
            <View style={{ gap: 8, marginBottom: 24 }}>
              {weekDays.map((date, i) => {
                const sel = findSelection(date, 'breakfast');
                return (
                  <Pressable
                    key={date}
                    onPress={() => setPickerFor({ date })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border,
                    }}
                  >
                    <View style={{ width: 44 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>{DAY_LABELS[i]}</Text>
                      <Text style={{ fontSize: 11, color: C.dim }}>{format(new Date(`${date}T00:00:00`), 'M/d')}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: sel ? 'white' : C.dim, marginLeft: 8 }}>
                      {sel ? sel.item_name : 'Choose breakfast…'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Lunch */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Sandwich size={18} color={C.primaryLight} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Lunch</Text>
            </View>
            <View style={{ gap: 8, marginBottom: 24 }}>
              {weekDays.map((date, i) => {
                const sel = findSelection(date, 'lunch');
                const isPast = date < todayStr;
                return (
                  <View
                    key={date}
                    style={{
                      flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
                      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border,
                      opacity: isPast ? 0.5 : 1,
                    }}
                  >
                    <View style={{ width: 44 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>{DAY_LABELS[i]}</Text>
                      <Text style={{ fontSize: 11, color: C.dim }}>{format(new Date(`${date}T00:00:00`), 'M/d')}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: sel ? 'white' : C.dim, marginLeft: 8 }}>
                      {sel ? sel.item_name : 'Not set'}
                    </Text>
                    {!isPast && sel && (
                      <Pressable
                        onPress={() => setSwapFor(date)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surface3 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.primaryLight }}>Switch</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Request a new item */}
            <View style={{ marginBottom: 24 }}>
              <Pressable
                onPress={() => setShowRequestForm(!showRequestForm)}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
              >
                <Lightbulb size={18} color={C.primaryLight} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Request an Item</Text>
              </Pressable>
              {showRequestForm ? (
                <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['breakfast', 'lunch'] as const).map(slot => (
                      <Pressable
                        key={slot}
                        onPress={() => setRequestSlot(slot)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                          backgroundColor: requestSlot === slot ? C.primary : C.surface3,
                        }}
                      >
                        <Text style={{ color: requestSlot === slot ? 'white' : C.muted, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{slot}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={requestName}
                    onChangeText={setRequestName}
                    placeholder="e.g. Bagel with cream cheese"
                    placeholderTextColor={C.dim}
                    maxLength={100}
                    style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 }}
                  />
                  <Pressable
                    onPress={() => { if (requestName.trim()) requestMut.mutate(); }}
                    style={{ paddingVertical: 12, borderRadius: 10, backgroundColor: requestName.trim() ? C.primary : C.surface3, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>
                      {requestMut.isPending ? 'Sending…' : 'Send Request'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowRequestForm(true)}
                  style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <MessageSquare size={16} color={C.primaryLight} />
                  <Text style={{ color: C.primaryLight, fontSize: 14, fontWeight: '500' }}>Ask your parents to add something</Text>
                </Pressable>
              )}
            </View>

            {myRequests.length > 0 && (
              <View style={{ gap: 8, marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>My Requests</Text>
                {myRequests.slice(0, 10).map(r => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border }}>
                    <Text style={{ flex: 1, fontSize: 13, color: 'white' }}>{r.name}</Text>
                    <Text style={{
                      fontSize: 11, fontWeight: '600', textTransform: 'capitalize',
                      color: r.status === 'approved' ? C.success : r.status === 'denied' ? C.danger : C.warning,
                    }}>
                      {r.status}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Parent-only sections ──────────────────────────────── */}
        {isParent && (
          <>
            {pendingRequests.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Lightbulb size={18} color={C.primaryLight} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8 }}>Item Requests</Text>
                  <View style={{ marginLeft: 8, backgroundColor: C.primary + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.primaryLight }}>{pendingRequests.length}</Text>
                  </View>
                </View>
                <View style={{ gap: 8, marginBottom: 24 }}>
                  {pendingRequests.map((rq: MenuItemRequest) => (
                    <View key={rq.id} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{rq.name}</Text>
                      <Text style={{ fontSize: 12, color: C.muted, marginBottom: 10, textTransform: 'capitalize' }}>
                        {rq.meal_slot} · requested by {rq.requested_by_name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          value={resolveLimitInput}
                          onChangeText={setResolveLimitInput}
                          placeholder="Weekly limit (optional)"
                          placeholderTextColor={C.dim}
                          keyboardType="number-pad"
                          style={{ flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontSize: 13 }}
                        />
                        <Pressable
                          onPress={() => resolveRequestMut.mutate({ id: rq.id, status: 'approved', weekly_limit: resolveLimitInput ? parseInt(resolveLimitInput, 10) : undefined })}
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

            {(['breakfast', 'lunch'] as const).map(slot => (
              <View key={slot} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {slot === 'breakfast' ? <Coffee size={18} color={C.primaryLight} /> : <Sandwich size={18} color={C.primaryLight} />}
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginLeft: 8, textTransform: 'capitalize' }}>{slot} Items</Text>
                  </View>
                  <Pressable
                    onPress={() => openCreate(slot)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary }}
                  >
                    <Plus size={16} color="white" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: 'white', marginLeft: 4 }}>New</Text>
                  </Pressable>
                </View>

                {catalog.filter(i => i.meal_slot === slot).length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                    <Text style={{ color: C.dim, fontSize: 13 }}>No {slot} items yet</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {catalog.filter(i => i.meal_slot === slot).map(item => (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: 'white' }}>{item.name}</Text>
                          <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            {item.member_name || 'Everyone'}
                            {item.weekly_limit ? ` · ${item.weekly_limit}/wk (${item.limit_scope === 'shared' ? 'shared' : 'each'})` : ' · unlimited'}
                            {item.meal_slot === 'lunch' && item.available_days && item.available_days.length > 0
                              ? ` · ${formatAvailableDays(item.available_days)}`
                              : ''}
                          </Text>
                        </View>
                        <Pressable onPress={() => openEdit(item)} style={{ padding: 8, borderRadius: 8, backgroundColor: C.surface3, marginRight: 6 }}>
                          <Edit3 size={16} color={C.primaryLight} />
                        </Pressable>
                        <Pressable onPress={() => handleDelete(item)} style={{ padding: 8, borderRadius: 8, backgroundColor: C.danger + '15' }}>
                          <Trash2 size={16} color={C.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Item picker (breakfast dropdown / initial lunch set) ── */}
      <Modal visible={!!pickerFor} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <Pressable onPress={() => setPickerFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24, paddingBottom: sheetPaddingBottom, maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 16, textAlign: 'center' }}>
              Choose Breakfast
            </Text>
            {pickerFor && findSelection(pickerFor.date, 'breakfast') && (
              <Pressable
                disabled={clearMut.isPending}
                onPress={() => {
                  if (!pickerFor) return;
                  clearMut.mutate({ date: pickerFor.date, meal_slot: 'breakfast' });
                  setPickerFor(null);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: 12, marginBottom: 12,
                }}
              >
                <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>
                  {clearMut.isPending ? 'Clearing…' : 'Clear this breakfast'}
                </Text>
              </Pressable>
            )}
            <ScrollView style={{ maxHeight: 360 }}>
              {pickerItems.length === 0 ? (
                <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 20 }}>No items yet — ask a parent to add some, or request one below.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {pickerItems.map((item: MenuItem) => {
                    const exhausted = item.remaining === 0;
                    return (
                      <Pressable
                        key={item.id}
                        disabled={exhausted}
                        onPress={() => {
                          if (!pickerFor) return;
                          setMut.mutate({ date: pickerFor.date, meal_slot: 'breakfast', menu_item_id: item.id });
                          setPickerFor(null);
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: C.surface3, borderRadius: 10, padding: 14,
                          opacity: exhausted ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ color: 'white', fontSize: 14 }}>{item.name}</Text>
                        {item.remaining !== null && item.remaining !== undefined && (
                          <Text style={{ color: exhausted ? C.danger : C.dim, fontSize: 12 }}>
                            {exhausted ? 'Used up this week' : `${item.remaining} left this week`}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Lunch swap modal ──────────────────────────────────────── */}
      <Modal visible={!!swapFor} transparent animationType="slide" onRequestClose={() => setSwapFor(null)}>
        <Pressable onPress={() => setSwapFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24, paddingBottom: sheetPaddingBottom, maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 4, textAlign: 'center' }}>Switch Lunch</Text>
            <Text style={{ fontSize: 13, color: C.muted, marginBottom: 16, textAlign: 'center' }}>
              Pick a day to trade with {swapFor ? format(new Date(`${swapFor}T00:00:00`), 'EEEE') : ''}'s lunch
            </Text>
            {swapOptions.length === 0 ? (
              <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 20 }}>No other upcoming days to switch with.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {swapOptions.map(d => {
                  const sel = findSelection(d, 'lunch');
                  return (
                    <Pressable
                      key={d}
                      onPress={() => {
                        if (!swapFor) return;
                        swapMut.mutate({ date_a: swapFor, date_b: d });
                        setSwapFor(null);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface3, borderRadius: 10, padding: 14 }}
                    >
                      <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{format(new Date(`${d}T00:00:00`), 'EEEE')}</Text>
                      <Text style={{ color: C.muted, fontSize: 13 }}>{sel?.item_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Parent create/edit item modal ─────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable onPress={closeModal} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24, paddingBottom: sheetPaddingBottom, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 20, textAlign: 'center' }}>
                {editingItem ? 'Edit Item' : 'New Item'}
              </Text>

              <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Meal</Text>
              {editingItem ? (
                <Text style={{ color: C.text, fontSize: 14, marginBottom: 16, textTransform: 'capitalize' }}>{form.meal_slot} (can't be changed)</Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {(['breakfast', 'lunch'] as const).map(slot => (
                    <Pressable
                      key={slot}
                      onPress={() => setForm(f => ({ ...f, meal_slot: slot }))}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: form.meal_slot === slot ? C.primary : C.surface3 }}
                    >
                      <Text style={{ color: form.meal_slot === slot ? 'white' : C.muted, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{slot}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {form.meal_slot === 'lunch' && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Available Days (blank = every day)</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {DAY_LABELS.map((label, i) => {
                      const dayNum = i + 1; // 1=Mon..5=Fri
                      const selected = form.available_days.includes(dayNum);
                      return (
                        <Pressable
                          key={dayNum}
                          onPress={() => setForm(f => ({
                            ...f,
                            available_days: selected ? f.available_days.filter(d => d !== dayNum) : [...f.available_days, dayNum],
                          }))}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: selected ? C.primary : C.surface3 }}
                        >
                          <Text style={{ color: selected ? 'white' : C.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Name *</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => setForm(f => ({ ...f, name: t }))}
                placeholder="e.g. Waffles"
                placeholderTextColor={C.dim}
                maxLength={100}
                style={{ backgroundColor: C.surface3, borderRadius: 10, padding: 12, fontSize: 15, color: 'white', borderWidth: 1, borderColor: C.border, marginBottom: 16 }}
              />

              <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Who can pick this?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <Pressable
                  onPress={() => setForm(f => ({ ...f, member_id: null }))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: form.member_id === null ? C.primary : C.surface3 }}
                >
                  <Text style={{ color: form.member_id === null ? 'white' : C.muted, fontSize: 13, fontWeight: '600' }}>Everyone</Text>
                </Pressable>
                {kids.map(k => (
                  <Pressable
                    key={k.id}
                    onPress={() => setForm(f => ({ ...f, member_id: k.id }))}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: form.member_id === k.id ? C.primary : C.surface3 }}
                  >
                    <Text style={{ color: form.member_id === k.id ? 'white' : C.muted, fontSize: 13, fontWeight: '600' }}>{k.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Weekly Limit (blank = unlimited)</Text>
              <TextInput
                value={form.weekly_limit}
                onChangeText={(t) => setForm(f => ({ ...f, weekly_limit: t.replace(/[^0-9]/g, '') }))}
                placeholder="e.g. 2"
                placeholderTextColor={C.dim}
                keyboardType="number-pad"
                maxLength={3}
                style={{ backgroundColor: C.surface3, borderRadius: 10, padding: 12, fontSize: 15, color: 'white', borderWidth: 1, borderColor: C.border, marginBottom: 16 }}
              />

              {form.weekly_limit.trim() !== '' && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: C.muted, marginBottom: 6 }}>Limit applies</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    <Pressable
                      onPress={() => setForm(f => ({ ...f, limit_scope: 'per_kid' }))}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: form.limit_scope === 'per_kid' ? C.primary : C.surface3 }}
                    >
                      <Text style={{ color: form.limit_scope === 'per_kid' ? 'white' : C.muted, fontSize: 12, fontWeight: '600' }}>Per Kid</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setForm(f => ({ ...f, limit_scope: 'shared' }))}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: form.limit_scope === 'shared' ? C.primary : C.surface3 }}
                    >
                      <Text style={{ color: form.limit_scope === 'shared' ? 'white' : C.muted, fontSize: 12, fontWeight: '600' }}>Shared Total</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={closeModal} style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.surface3, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.muted }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={createMut.isPending || updateMut.isPending}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.primary, opacity: (createMut.isPending || updateMut.isPending) ? 0.5 : 1 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>
                    {(createMut.isPending || updateMut.isPending) ? 'Saving…' : (editingItem ? 'Update' : 'Create')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
