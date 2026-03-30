import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, updateMember, deleteMember, type Member } from '../api/client';
import { Trash2, Save, Bell, BellOff } from 'lucide-react';
import { CreateMemberModal } from '../components/CreateMemberModal';
import { usePushNotifications } from '../hooks/usePushNotifications';
import toast from 'react-hot-toast';

const COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#22C55E', '#06B6D4', '#F97316',
];

interface SettingsPageProps {
  memberId: number;
}

export default function SettingsPage({ memberId }: SettingsPageProps) {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications(memberId);

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Family Members</h3>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm text-primary-400 hover:text-primary-300"
          >
            + Add Member
          </button>
        </div>

        <div className="space-y-3">
          {members.map((member: Member) => (
            <MemberEditor key={member.id} member={member} />
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h3 className="font-medium mb-3">Notifications</h3>
        <div className="bg-surface-raised border border-border rounded-xl p-4">
          {!isSupported ? (
            <p className="text-sm text-text-muted">
              Push notifications are not supported in this browser.
            </p>
          ) : permission === 'denied' ? (
            <p className="text-sm text-text-muted">
              Notifications are blocked. Enable them in your browser settings for this site.
            </p>
          ) : isSubscribed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-success" />
                <span className="text-sm">Notifications are enabled</span>
              </div>
              <button
                onClick={async () => {
                  await unsubscribe();
                  toast.success('Notifications disabled');
                }}
                className="text-sm text-text-muted hover:text-danger transition-colors"
              >
                Disable
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellOff size={18} className="text-text-muted" />
                <span className="text-sm text-text-muted">Notifications are off</span>
              </div>
              <button
                onClick={async () => {
                  const ok = await subscribe();
                  if (ok) toast.success('Notifications enabled!');
                  else toast.error('Failed to enable notifications');
                }}
                className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                Enable
              </button>
            </div>
          )}
          <p className="text-xs text-text-muted mt-2">
            Get reminders at 8 AM for today's chores and at 8 PM for overdue tasks.
          </p>
        </div>
      </section>

      {showCreate && (
        <CreateMemberModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['members'] });
          }}
        />
      )}
    </div>
  );
}

function MemberEditor({ member }: { member: Member }) {
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.avatar_color);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => updateMember(member.id, { name: name.trim(), avatar_color: color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Saved');
    },
  });

  const delMutation = useMutation({
    mutationFn: () => deleteMember(member.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member removed');
    },
  });

  const isDirty = name !== member.name || color !== member.avatar_color;

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: color }}
        >
          {(name || '?')[0].toUpperCase()}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text text-sm"
        />
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-7 h-7 rounded-full transition-all ${
              color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-raised scale-110' : ''
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => delMutation.mutate()}
          disabled={delMutation.isPending}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors"
        >
          <Trash2 size={14} />
          Remove
        </button>
        {isDirty && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <Save size={14} />
            Save changes
          </button>
        )}
      </div>
    </div>
  );
}
