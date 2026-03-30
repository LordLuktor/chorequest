import { useQuery } from '@tanstack/react-query';
import { getMembers, type Member } from '../api/client';
import { Users, Plus } from 'lucide-react';
import { useState } from 'react';
import { CreateMemberModal } from './CreateMemberModal';

interface MemberPickerProps {
  onSelect: (member: { id: number; name: string; avatar_color: string }) => void;
}

export function MemberPicker({ onSelect }: MemberPickerProps) {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Users size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
            ChoreQuest
          </h1>
          <p className="text-text-muted mt-2">Who's doing chores today?</p>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted">Loading...</div>
        ) : (
          <div className="space-y-3">
            {members.map((member: Member) => (
              <button
                key={member.id}
                onClick={() => onSelect(member)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-raised border border-border hover:border-primary-500 hover:bg-surface-overlay transition-all group"
              >
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: member.avatar_color }}
                >
                  {member.name[0].toUpperCase()}
                </span>
                <div className="text-left">
                  <div className="font-semibold text-text">{member.name}</div>
                  <div className="text-sm text-text-muted">{member.points_total} points</div>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border hover:border-primary-500 text-text-muted hover:text-primary-400 transition-colors"
            >
              <Plus size={20} />
              <span>Add family member</span>
            </button>
          </div>
        )}

        {showCreate && (
          <CreateMemberModal
            onClose={() => setShowCreate(false)}
            onCreated={(member) => {
              setShowCreate(false);
              onSelect(member);
            }}
          />
        )}
      </div>
    </div>
  );
}
