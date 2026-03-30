import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTemplate, getMembers, type Member } from '../api/client';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

const TASK_ICONS = ['🧹', '🍽️', '🧺', '🗑️', '🐕', '🌿', '🛒', '📦', '🚗', '🛏️', '🚿', '📋', '🐱', '♻️'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CreateTaskModalProps {
  onClose: () => void;
  createdBy: number;
}

export function CreateTaskModal({ onClose, createdBy }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📋');
  const [points, setPoints] = useState(1);
  const [repeatInterval, setRepeatInterval] = useState<1 | 2>(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  // Weekly assignments: key = day index (0-6), value = array of member_ids
  const [assignments, setAssignments] = useState<Record<string, number[]>>({});

  const queryClient = useQueryClient();
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const hasAnyAssignment = Object.values(assignments).some((v) => v && v.length > 0);

  const mutation = useMutation({
    mutationFn: () =>
      createTemplate({
        title: title.trim(),
        description: description.trim() || null,
        icon,
        points,
        weekly_assignments: assignments,
        repeat_interval: repeatInterval,
        start_date: startDate,
        end_date: null,
        created_by: createdBy,
        is_active: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created!');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create task');
    },
  });

  const toggleDayMember = (dayIndex: number, memberId: number) => {
    setAssignments((prev) => {
      const current = prev[dayIndex] || [];
      const has = current.includes(memberId);
      return {
        ...prev,
        [dayIndex]: has ? current.filter((id) => id !== memberId) : [...current, memberId],
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border rounded-2xl p-6 w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">New Recurring Task</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (title.trim() && hasAnyAssignment) mutation.mutate(); }} className="space-y-4">
          {/* Icon picker */}
          <div>
            <span className="text-sm text-text-muted mb-2 block">Icon</span>
            <div className="flex gap-1.5 flex-wrap">
              {TASK_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                    icon === emoji
                      ? 'bg-primary-600 ring-2 ring-primary-400 scale-110'
                      : 'bg-surface border border-border hover:border-primary-500'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <label className="block">
            <span className="text-sm text-text-muted mb-1 block">Task name</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
              placeholder="e.g. Wash dishes"
              autoFocus
            />
          </label>

          {/* Description */}
          <label className="block">
            <span className="text-sm text-text-muted mb-1 block">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text resize-none"
              placeholder="Any extra details..."
            />
          </label>

          <div className="flex gap-4">
            {/* Points */}
            <label className="block w-24">
              <span className="text-sm text-text-muted mb-1 block">Points</span>
              <input
                type="number"
                min={1}
                max={100}
                value={points}
                onChange={(e) => setPoints(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
              />
            </label>

            {/* Repeat interval */}
            <div className="flex-1">
              <span className="text-sm text-text-muted mb-1 block">Repeats</span>
              <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setRepeatInterval(1)}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
                    repeatInterval === 1 ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatInterval(2)}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
                    repeatInterval === 2 ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Biweekly
                </button>
              </div>
            </div>
          </div>

          {/* Start date */}
          <label className="block">
            <span className="text-sm text-text-muted mb-1 block">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
            />
          </label>

          {/* Weekly assignment grid */}
          <div>
            <span className="text-sm text-text-muted mb-2 block">Weekly schedule — tap members to assign per day</span>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day, i) => {
                const dayMembers = assignments[i] || [];
                return (
                  <div key={day} className="text-center">
                    <div className="text-xs text-text-muted mb-1 font-medium">{day}</div>
                    <div className="flex flex-col gap-0.5">
                      {members.filter((m: Member) => !m.is_parent).map((m: Member) => {
                        const active = dayMembers.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleDayMember(i, m.id)}
                            className={cn(
                              'w-full py-1 rounded-md text-[10px] font-medium transition-all truncate px-0.5',
                              active
                                ? 'text-white ring-1 ring-white/20'
                                : 'bg-surface border border-border text-text-muted hover:border-primary-500 opacity-40'
                            )}
                            style={active ? { backgroundColor: m.avatar_color } : undefined}
                            title={m.name}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick-fill buttons */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {members.filter((m: Member) => !m.is_parent).map((m: Member) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setAssignments((prev) => {
                      const next: Record<string, number[]> = {};
                      for (let d = 0; d < 7; d++) {
                        const current = prev[d] || [];
                        next[d] = current.includes(m.id) ? current : [...current, m.id];
                      }
                      return next;
                    });
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface border border-border hover:border-primary-500 text-text-muted hover:text-text transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.avatar_color }} />
                  Add {m.name} all
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAssignments({})}
                className="px-2 py-1 rounded-md text-xs bg-surface border border-border hover:border-danger/50 text-text-muted hover:text-danger transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!title.trim() || !hasAnyAssignment || mutation.isPending}
            className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors mt-2"
          >
            {mutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </form>
      </div>
    </div>
  );
}
