import { View, Text, Pressable, RefreshControl, TextInput, FlatList } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getShoppingList,
  addShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedItems,
  type ShoppingItem,
} from '../../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { ShoppingCart, RefreshCw, Plus, Trash2, Square, CheckSquare } from 'lucide-react-native';

type ListRow = ShoppingItem | { _type: 'divider' };

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const CATEGORIES = ['General', 'Groceries', 'Household', 'Personal'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  General: '#6366f1',
  Groceries: '#22c55e',
  Household: '#f59e0b',
  Personal: '#ec4899',
};

export default function ShoppingScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('General');
  const queryClient = useQueryClient();

  const { data: items = [], refetch, isRefetching } = useQuery({
    queryKey: ['shopping'],
    queryFn: getShoppingList,
  });

  const addMutation = useMutation({
    mutationFn: ({ text, category }: { text: string; category?: string }) =>
      addShoppingItem(text, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
      setNewItemText('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleShoppingItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteShoppingItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearCheckedItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAdd = useCallback(() => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    addMutation.mutate({ text: trimmed, category: selectedCategory });
  }, [newItemText, selectedCategory, addMutation]);

  const uncheckedItems = items.filter((i) => !i.is_checked);
  const checkedItems = items.filter((i) => i.is_checked);
  const checkedCount = checkedItems.length;
  const totalCount = items.length;

  // Build flat list data with an optional divider between sections
  const listData: ListRow[] = useMemo(() => {
    const rows: ListRow[] = [...uncheckedItems];
    if (uncheckedItems.length > 0 && checkedItems.length > 0) {
      rows.push({ _type: 'divider' });
    }
    rows.push(...checkedItems);
    return rows;
  }, [uncheckedItems, checkedItems]);

  const renderRow = useCallback(({ item }: { item: ListRow }) => {
    // Divider row
    if ('_type' in item && item._type === 'divider') {
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 20,
            marginTop: 8,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          <Text style={{ color: C.dim, fontSize: 11, fontWeight: '600' }}>
            COMPLETED
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        </View>
      );
    }

    const catColor = CATEGORY_COLORS[item.category] || C.primary;

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.card,
          borderRadius: 10,
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: C.border,
          opacity: item.is_checked ? 0.55 : 1,
        }}
      >
        {/* Checkbox */}
        <Pressable
          onPress={() => toggleMutation.mutate(item.id)}
          style={{ marginRight: 12, padding: 2 }}
          hitSlop={8}
        >
          {item.is_checked ? (
            <CheckSquare size={22} color={C.success} />
          ) : (
            <Square size={22} color={C.muted} />
          )}
        </Pressable>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '500',
              color: item.is_checked ? C.dim : C.text,
              textDecorationLine: item.is_checked ? 'line-through' : 'none',
            }}
          >
            {item.text}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
            {/* Category badge */}
            <View
              style={{
                backgroundColor: catColor + '22',
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: catColor, fontSize: 11, fontWeight: '600' }}>
                {item.category}
              </Text>
            </View>
            {/* Added by */}
            {item.added_by_name && (
              <Text style={{ color: C.dim, fontSize: 11 }}>
                {item.added_by_name}
              </Text>
            )}
            {/* Checked by */}
            {item.is_checked && item.checked_by_name && (
              <Text style={{ color: C.dim, fontSize: 11 }}>
                {'\u2713'} {item.checked_by_name}
              </Text>
            )}
          </View>
        </View>

        {/* Delete button */}
        <Pressable
          onPress={() => deleteMutation.mutate(item.id)}
          style={{ padding: 6, marginLeft: 8 }}
          hitSlop={8}
        >
          <Trash2 size={16} color={C.danger} />
        </Pressable>
      </View>
    );
  }, [toggleMutation, deleteMutation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff' }}>
              Shopping List
            </Text>
            <Text style={{ fontSize: 12, color: C.muted }}>
              {totalCount} item{totalCount !== 1 ? 's' : ''}
              {checkedCount > 0 ? ` \u00b7 ${checkedCount} done` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {checkedCount > 0 && (
              <Pressable
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: C.danger + '20',
                  borderWidth: 1,
                  borderColor: C.danger + '40',
                }}
                onPress={() => clearMutation.mutate()}
              >
                <Text style={{ color: C.danger, fontSize: 12, fontWeight: '600' }}>
                  Clear Done
                </Text>
              </Pressable>
            )}
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
              <RefreshCw
                size={18}
                color={C.primaryLight}
                style={{ transform: [{ rotate: isRefetching ? '180deg' : '0deg' }] }}
              />
            </Pressable>
          </View>
        </View>

        {/* Add Item Section */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: C.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            padding: 12,
          }}
        >
          {/* Category chips */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              const catColor = CATEGORY_COLORS[cat];
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 16,
                    backgroundColor: isSelected ? catColor + '30' : C.surface3,
                    borderWidth: 1,
                    borderColor: isSelected ? catColor : C.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isSelected ? catColor : C.muted,
                    }}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Text input + Add button */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Add an item..."
              placeholderTextColor={C.dim}
              maxLength={200}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
              style={{
                flex: 1,
                backgroundColor: C.surface3,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: C.text,
                fontSize: 14,
                borderWidth: 1,
                borderColor: C.border,
              }}
            />
            <Pressable
              onPress={handleAdd}
              disabled={addMutation.isPending || !newItemText.trim()}
              style={{
                backgroundColor: newItemText.trim() ? C.primary : C.surface3,
                borderRadius: 8,
                padding: 10,
                opacity: addMutation.isPending ? 0.5 : 1,
              }}
            >
              <Plus size={20} color={newItemText.trim() ? '#ffffff' : C.dim} />
            </Pressable>
          </View>
        </View>

        {/* Items List */}
        {totalCount === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 32,
            }}
          >
            <ShoppingCart size={48} color={C.border} />
            <Text
              style={{
                color: C.muted,
                fontSize: 14,
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              Your shopping list is empty.
            </Text>
            <Text
              style={{
                color: C.dim,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Add items above and they will sync across all household members.
            </Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => '_type' in item ? '__divider__' : String(item.id)}
            renderItem={renderRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={C.primaryLight}
              />
            }
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
