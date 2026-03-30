import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, type Member } from '../api/client';
import { X, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE = '/api';

interface Pack {
  name: string;
  description: string;
  tasks: { id: number; title: string; icon: string; points: number; suggested_days: number[] }[];
}

interface TemplateLibraryModalProps {
  onClose: () => void;
  createdBy: number;
}

export function TemplateLibraryModal({ onClose, createdBy }: TemplateLibraryModalProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<number | ''>('');
  const queryClient = useQueryClient();

  const { data: packs = [] } = useQuery<Pack[]>({
    queryKey: ['template-library'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/template-library`);
      return res.json();
    },
  });

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/template-library/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_name: selectedPack,
          default_member_id: assignTo || null,
          created_by: createdBy,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(data.message || 'Pack imported!');
      onClose();
    },
    onError: () => toast.error('Failed to import pack'),
  });

  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-2xl p-6 w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Template Library</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          {packs.map((pack) => (
            <div
              key={pack.name}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedPack === pack.name
                  ? 'bg-primary-950/50 border-primary-500'
                  : 'bg-surface border-border hover:border-primary-500/50'
              }`}
              onClick={() => setSelectedPack(selectedPack === pack.name ? null : pack.name)}
            >
              <div className="font-medium">{pack.name}</div>
              <div className="text-xs text-text-muted mb-2">{pack.description}</div>
              {selectedPack === pack.name && (
                <div className="space-y-1.5 mt-2">
                  {pack.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span>{t.icon}</span>
                      <span className="flex-1">{t.title}</span>
                      <span className="text-xs text-text-muted">{t.points}pt</span>
                      <div className="flex gap-0.5">
                        {DAYS.map((d, i) => {
                          const days = typeof t.suggested_days === 'string' ? JSON.parse(t.suggested_days as any) : t.suggested_days;
                          return (
                            <span
                              key={i}
                              className={`w-4 h-4 rounded text-[8px] flex items-center justify-center ${
                                days?.includes(i) ? 'bg-primary-600 text-white' : 'bg-surface-overlay text-text-muted'
                              }`}
                            >
                              {d}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedPack && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm text-text-muted mb-1 block">Assign all tasks to</span>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
              >
                <option value="">Nobody (assign later)</option>
                {members.map((m: Member) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              <Download size={16} />
              {importMutation.isPending ? 'Importing...' : `Import "${selectedPack}"`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
