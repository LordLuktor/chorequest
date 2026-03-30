import { useMutation, useQueryClient } from '@tanstack/react-query';
import { completeTask, skipTask, type TaskInstance, type Achievement } from '../api/client';
import { Check, SkipForward, Clock } from 'lucide-react';
import { cn, formatDate, isToday, isPast } from '../lib/utils';
import { showUndoToast } from './UndoToast';
import toast from 'react-hot-toast';

interface TaskCardProps {
  task: TaskInstance;
  currentMemberId: number;
}

export function TaskCard({ task, currentMemberId }: TaskCardProps) {
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: () => completeTask(task.id, currentMemberId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['member-stats'] });
      showUndoToast(task.id, task.title, 'completed', currentMemberId);
      if (data.new_achievements && data.new_achievements.length > 0) {
        data.new_achievements.forEach((a: Achievement) => {
          toast(`${a.icon} ${a.title} unlocked!`, { duration: 5000 });
        });
      }
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => skipTask(task.id, currentMemberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showUndoToast(task.id, task.title, 'skipped', currentMemberId);
    },
  });

  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const overdue = isPast(task.due_date) && task.status === 'pending';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all',
        isDone && 'bg-success/5 border-success/20 opacity-60',
        isSkipped && 'bg-surface-overlay border-border opacity-40',
        !isDone && !isSkipped && 'bg-surface-raised border-border hover:border-primary-500/50',
        overdue && 'border-warning/50 bg-warning/5'
      )}
    >
      {/* Icon */}
      <span className="text-2xl shrink-0">{task.icon || '📋'}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium truncate', isDone && 'line-through')}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          {task.assignee_name && (
            <span className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: task.assignee_color || '#6366f1' }}
              />
              {task.assignee_name}
            </span>
          )}
          {!isToday(task.due_date) && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatDate(task.due_date)}
            </span>
          )}
          {overdue && (
            <span className="text-warning font-medium">Overdue</span>
          )}
          <span className="text-primary-400">{task.template_points}pt</span>
        </div>
      </div>

      {/* Actions */}
      {task.status === 'pending' && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => skipMutation.mutate()}
            disabled={skipMutation.isPending}
            className="p-2 rounded-lg text-text-muted hover:text-warning hover:bg-warning/10 transition-colors"
            title="Skip"
          >
            <SkipForward size={18} />
          </button>
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
            title="Complete"
          >
            <Check size={18} />
          </button>
        </div>
      )}

      {isDone && (
        <span className="text-success text-sm font-medium shrink-0">Done</span>
      )}
      {isSkipped && (
        <span className="text-text-muted text-sm shrink-0">Skipped</span>
      )}
    </div>
  );
}
