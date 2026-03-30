import { useMutation, useQueryClient } from '@tanstack/react-query';
import { completeTask, skipTask, type TaskInstance, type Achievement } from '../api/client';
import { Check, SkipForward, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { showUndoToast } from './UndoToast';
import toast from 'react-hot-toast';

interface TaskQuickActionProps {
  task: TaskInstance;
  currentMemberId: number;
  onClose: () => void;
}

export function TaskQuickAction({ task, currentMemberId, onClose }: TaskQuickActionProps) {
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
      onClose();
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => skipTask(task.id, currentMemberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showUndoToast(task.id, task.title, 'skipped', currentMemberId);
      onClose();
    },
  });

  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border rounded-2xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{task.icon || '📋'}</span>
            <h3 className="font-semibold text-lg">{task.title}</h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>

        {task.description && (
          <p className="text-sm text-text-muted mb-3">{task.description}</p>
        )}

        <div className="flex items-center gap-2 text-sm text-text-muted mb-4">
          {task.assignee_name && (
            <span className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: task.assignee_color || '#6366f1' }}
              />
              {task.assignee_name}
            </span>
          )}
          <span>{task.template_points}pt</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              isDone && 'bg-success/20 text-success',
              isSkipped && 'bg-surface-overlay text-text-muted',
              !isDone && !isSkipped && 'bg-primary-950 text-primary-400'
            )}
          >
            {isDone ? 'Completed' : isSkipped ? 'Skipped' : 'Pending'}
          </span>
        </div>

        {task.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-text-muted hover:text-warning hover:border-warning/50 transition-colors"
            >
              <SkipForward size={16} />
              Skip
            </button>
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors font-medium"
            >
              <Check size={16} />
              Complete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
