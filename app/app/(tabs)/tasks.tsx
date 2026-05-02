import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, getMembers, deleteTemplate, updateTemplate, type TaskTemplate, type Member } from '../../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { Plus, Pencil, Pause, Play, Trash2, RefreshCw } from 'lucide-react-native';
import TaskFormModal from '../../components/TaskFormModal';

const C = {
  bg: '#0f0e1a', card: '#1a1830', border: '#312e5a', surface3: '#252244',
  primary: '#6366f1', primaryLight: '#818cf8',
  text: '#e0e7ff', muted: '#94a3b8', dim: '#5c6278',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
};

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function TasksScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | undefined>(undefined);
  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (t: TaskTemplate) => updateTemplate(t.id, { is_active: !t.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
    setRefreshing(false);
  }, [queryClient]);

  const onTaskSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }, [queryClient]);

  const active = templates.filter(t => t.is_active);
  const paused = templates.filter(t => !t.is_active);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#ffffff' }}>Recurring Tasks</Text>
            <Pressable onPress={onRefresh} style={{ padding: 6, borderRadius: 8, backgroundColor: C.surface3 }}>
              <RefreshCw size={14} color={C.primaryLight} style={refreshing ? { opacity: 0.5 } : undefined} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => { setEditingTemplate(undefined); setShowCreateModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary }}
          >
            <Plus size={16} color="white" />
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '500' }}>New Task</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1, paddingHorizontal: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
        >
          {templates.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📝</Text>
              <Text style={{ color: C.muted, fontSize: 14 }}>No recurring tasks yet.</Text>
            </View>
          ) : (
            <>
              {active.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  members={members}
                  onToggle={() => toggleMutation.mutate(template)}
                  onDelete={() => deleteMutation.mutate(template.id)}
                  onEdit={() => { setEditingTemplate(template); setShowCreateModal(true); }}
                />
              ))}
              {paused.length > 0 && (
                <>
                  <Text style={{ fontSize: 14, color: C.dim, marginTop: 16, marginBottom: 8 }}>Paused</Text>
                  {paused.map(template => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      members={members}
                      onToggle={() => toggleMutation.mutate(template)}
                      onDelete={() => deleteMutation.mutate(template.id)}
                      onEdit={() => { setEditingTemplate(template); setShowCreateModal(true); }}
                    />
                  ))}
                </>
              )}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>

      <TaskFormModal
        visible={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingTemplate(undefined); }}
        onSaved={onTaskSaved}
        members={members}
        template={editingTemplate}
      />
    </SafeAreaView>
  );
}

function TemplateCard({ template, members, onToggle, onDelete, onEdit }: {
  template: TaskTemplate; members: Member[]; onToggle: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const wa = template.weekly_assignments;

  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, marginRight: 12 }}>{template.icon || '📋'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }} numberOfLines={1}>{template.title}</Text>
          <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {template.points}pt · {template.repeat_interval === 2 ? 'Biweekly' : 'Weekly'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable style={{ padding: 8, borderRadius: 8 }} onPress={onEdit}>
            <Pencil size={16} color={C.muted} />
          </Pressable>
          <Pressable style={{ padding: 8, borderRadius: 8 }} onPress={onToggle}>
            {template.is_active ? <Pause size={16} color={C.muted} /> : <Play size={16} color={C.muted} />}
          </Pressable>
          <Pressable style={{ padding: 8, borderRadius: 8 }} onPress={onDelete}>
            <Trash2 size={16} color={C.muted} />
          </Pressable>
        </View>
      </View>

      {wa && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
          {DAYS.map((d, i) => {
            const val = wa[String(i)];
            const ids: number[] = Array.isArray(val) ? val : val != null ? [val as unknown as number] : [];
            const dayMembers = ids.map(id => members.find(m => m.id === id)).filter(Boolean);
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: C.dim }}>{d}</Text>
                <View style={{ width: '100%', marginTop: 2, gap: 1 }}>
                  {dayMembers.length > 0 ? dayMembers.map(m => (
                    <View key={m!.id} style={{ height: 6, borderRadius: 3, backgroundColor: m!.avatar_color }} />
                  )) : (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface3 }} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
