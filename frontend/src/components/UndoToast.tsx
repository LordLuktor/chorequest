import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { undoTask } from '../api/client';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

const UNDO_WINDOW_MS = 30000;

interface UndoToastProps {
  taskId: number;
  taskTitle: string;
  action: 'completed' | 'skipped';
  memberId: number;
  toastId: string;
}

export function UndoToast({ taskId, taskTitle, action, memberId, toastId }: UndoToastProps) {
  const [remaining, setRemaining] = useState(UNDO_WINDOW_MS);
  const startRef = useRef(Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const left = Math.max(0, UNDO_WINDOW_MS - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        toast.dismiss(toastId);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [toastId]);

  const mutation = useMutation({
    mutationFn: () => undoTask(taskId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['member-stats'] });
      toast.dismiss(toastId);
      toast.success('Action undone');
    },
    onError: () => {
      toast.dismiss(toastId);
      toast.error('Could not undo — time expired');
    },
  });

  const seconds = Math.ceil(remaining / 1000);
  const progress = remaining / UNDO_WINDOW_MS;

  return (
    <div className="flex items-center gap-3 min-w-[280px]">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {taskTitle} {action === 'completed' ? 'done' : 'skipped'}
        </div>
        <div className="h-1 rounded-full bg-white/10 mt-1.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-400 transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors shrink-0"
      >
        <Undo2 size={12} />
        Undo {seconds}s
      </button>
    </div>
  );
}

export function showUndoToast(taskId: number, taskTitle: string, action: 'completed' | 'skipped', memberId: number) {
  const toastId = `undo-${taskId}-${Date.now()}`;
  toast(
    (t) => (
      <UndoToast
        taskId={taskId}
        taskTitle={taskTitle}
        action={action}
        memberId={memberId}
        toastId={t.id as string}
      />
    ),
    {
      id: toastId,
      duration: UNDO_WINDOW_MS + 500,
      style: {
        background: 'var(--color-surface-raised)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      },
    }
  );
}
