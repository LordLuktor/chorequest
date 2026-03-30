import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, getMembers, deleteTemplate, updateTemplate, type TaskTemplate, type Member } from '../api/client';
import { Plus, Trash2, Pause, Play, Library, Pencil } from 'lucide-react';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { EditTaskModal } from '../components/EditTaskModal';
import { TemplateLibraryModal } from '../components/TemplateLibraryModal';
import toast from 'react-hot-toast';

interface TasksPageProps {
  memberId: number;
}

export default function TasksPage({ memberId }: TasksPageProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (template: TaskTemplate) =>
      updateTemplate(template.id, { is_active: !template.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const active = templates.filter((t: TaskTemplate) => t.is_active);
  const paused = templates.filter((t: TaskTemplate) => !t.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recurring Tasks</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLibrary(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary-500 text-text-muted hover:text-text text-sm transition-colors"
          >
            <Library size={16} />
            Library
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Task
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-muted text-center py-8">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <p className="text-4xl mb-2">📝</p>
          <p>No recurring tasks yet. Create one to get started!</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              {active.map((template: TaskTemplate) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  members={members}
                  onEdit={() => setEditingTemplate(template)}
                  onDelete={() => deleteMutation.mutate(template.id)}
                  onToggle={() => toggleMutation.mutate(template)}
                />
              ))}
            </div>
          )}

          {paused.length > 0 && (
            <div>
              <h3 className="text-sm text-text-muted mb-2">Paused</h3>
              <div className="space-y-2">
                {paused.map((template: TaskTemplate) => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    members={members}
                    onEdit={() => setEditingTemplate(template)}
                    onDelete={() => deleteMutation.mutate(template.id)}
                    onToggle={() => toggleMutation.mutate(template)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateTaskModal onClose={() => setShowCreate(false)} createdBy={memberId} />
      )}
      {showLibrary && (
        <TemplateLibraryModal onClose={() => setShowLibrary(false)} createdBy={memberId} />
      )}
      {editingTemplate && (
        <EditTaskModal template={editingTemplate} onClose={() => setEditingTemplate(null)} />
      )}
    </div>
  );
}

function TemplateRow({
  template,
  members,
  onEdit,
  onDelete,
  onToggle,
}: {
  template: TaskTemplate;
  members: Member[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const wa = template.weekly_assignments;

  return (
    <div className="p-3 rounded-xl bg-surface-raised border border-border">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{template.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{template.title}</div>
          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
            {!wa && template.assignee_name && (
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: template.assignee_color || '#6366f1' }}
                />
                {template.assignee_name}
              </span>
            )}
            <span>{template.points}pt</span>
            {!wa && <span className="truncate max-w-[150px]">{describeRule(template.recurrence_rule)}</span>}
            {wa && <span>{template.repeat_interval === 2 ? 'Biweekly' : 'Weekly'}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-text-muted hover:text-primary-400 hover:bg-primary-950/50 transition-colors"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
            title={template.is_active ? 'Pause' : 'Resume'}
          >
            {template.is_active ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Weekly assignment bar */}
      {wa && (
        <div className="flex gap-1 mt-2">
          {DAYS_SHORT.map((d, i) => {
            const val = wa[String(i)];
            // Normalize: support both array and legacy single-ID format
            const ids: number[] = Array.isArray(val) ? val : (val != null ? [val as unknown as number] : []);
            const dayMembers = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);
            return (
              <div key={i} className="flex-1 text-center">
                <div className="text-[10px] text-text-muted">{d}</div>
                <div className="flex flex-col gap-px mt-0.5">
                  {dayMembers.length > 0 ? dayMembers.map((member) => (
                    <div
                      key={member!.id}
                      className="h-1.5 rounded-full"
                      style={{ backgroundColor: member!.avatar_color }}
                      title={member!.name}
                    />
                  )) : (
                    <div className="h-1.5 rounded-full bg-surface-overlay" title="Off" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function describeRule(rrule: string): string {
  const parts: Record<string, string> = {};
  rrule.split(';').forEach((p) => {
    const [k, v] = p.split('=');
    parts[k] = v;
  });

  const freq = parts['FREQ'];
  const interval = parseInt(parts['INTERVAL'] || '1');
  const byDay = parts['BYDAY'];
  const byMonthDay = parts['BYMONTHDAY'];

  if (freq === 'DAILY' && interval === 1) return 'Every day';
  if (freq === 'DAILY') return `Every ${interval} days`;
  if (freq === 'WEEKLY' && byDay) {
    const dayMap: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
    const days = byDay.split(',').map((d) => dayMap[d.replace(/[-\d]/g, '')] || d).join(', ');
    return interval > 1 ? `Every ${interval} wks on ${days}` : `Weekly: ${days}`;
  }
  if (freq === 'MONTHLY' && byMonthDay) return `Monthly on the ${byMonthDay}${ordSuffix(parseInt(byMonthDay))}`;
  if (freq === 'MONTHLY' && byDay) return `Monthly (${byDay})`;
  return rrule;
}

function ordSuffix(n: number): string {
  if (n > 3 && n < 21) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
