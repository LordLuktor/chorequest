import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMember, type Member } from '../api/client';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

const COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#22C55E', '#06B6D4', '#F97316',
];

interface CreateMemberModalProps {
  onClose: () => void;
  onCreated: (member: Member) => void;
}

export function CreateMemberModal({ onClose, onCreated }: CreateMemberModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createMember({ name: name.trim(), avatar_color: color }),
    onSuccess: (member) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      onCreated(member);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">New Family Member</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) mutation.mutate();
          }}
        >
          <label className="block mb-4">
            <span className="text-sm text-text-muted mb-1 block">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
              placeholder="Enter name"
              autoFocus
            />
          </label>

          <div className="mb-6">
            <span className="text-sm text-text-muted mb-2 block">Color</span>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-10 h-10 rounded-full transition-all',
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-raised scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {mutation.error && (
            <p className="text-danger text-sm mb-4">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to create member'}
            </p>
          )}

          <button
            type="submit"
            disabled={!name.trim() || mutation.isPending}
            className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {mutation.isPending ? 'Creating...' : 'Add Member'}
          </button>
        </form>
      </div>
    </div>
  );
}
