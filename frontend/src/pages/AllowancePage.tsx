import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllowanceBalances, getAllowanceLedger, getAllowanceSettings, updateAllowanceSettings, recordPayout, type AllowanceBalance, type AllowanceLedgerEntry } from '../api/client';
import { DollarSign, ArrowDownCircle, ArrowUpCircle, Settings, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

interface AllowancePageProps {
  memberId: number;
  isParent: boolean;
}

export default function AllowancePage({ memberId, isParent }: AllowancePageProps) {
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [showPayout, setShowPayout] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const queryClient = useQueryClient();

  const { data: balances = [] } = useQuery({
    queryKey: ['allowance-balances'],
    queryFn: getAllowanceBalances,
  });

  const { data: settings } = useQuery({
    queryKey: ['allowance-settings'],
    queryFn: getAllowanceSettings,
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ['allowance-ledger', selectedMember],
    queryFn: () => getAllowanceLedger({ member: selectedMember || undefined, limit: 50 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="text-success" size={22} />
          Allowance
        </h2>
        {isParent && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
          >
            <Settings size={18} />
          </button>
        )}
      </div>

      {/* Settings panel (parent only) */}
      {showSettings && isParent && settings && (
        <AllowanceSettingsPanel settings={settings} memberId={memberId} />
      )}

      {/* Balances */}
      <div className="space-y-2">
        {balances.map((b: AllowanceBalance) => (
          <div
            key={b.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
              selectedMember === b.id
                ? 'bg-primary-950/50 border-primary-500'
                : 'bg-surface-raised border-border hover:border-primary-500/50'
            )}
            onClick={() => setSelectedMember(selectedMember === b.id ? null : b.id)}
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: b.avatar_color }}
            >
              {b.name[0].toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="font-medium">{b.name}</div>
              {b.is_parent && <span className="text-xs text-text-muted">Parent</span>}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-success">
                ${parseFloat(String(b.allowance_balance)).toFixed(2)}
              </div>
            </div>
            {isParent && !b.is_parent && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowPayout(b.id); }}
                className="px-3 py-1.5 rounded-lg text-xs bg-surface-overlay border border-border hover:border-primary-500 text-text-muted hover:text-text transition-colors"
              >
                Pay Out
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Ledger */}
      <div>
        <h3 className="text-sm text-text-muted mb-2">
          {selectedMember
            ? `History for ${balances.find((b: AllowanceBalance) => b.id === selectedMember)?.name || '...'}`
            : 'Recent Activity'}
        </h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No activity yet</p>
        ) : (
          <div className="space-y-1">
            {ledger.map((entry: AllowanceLedgerEntry) => (
              <div key={entry.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface-raised text-sm">
                {entry.type === 'earned' && parseFloat(String(entry.amount)) > 0 && (
                  <ArrowUpCircle size={16} className="text-success shrink-0" />
                )}
                {entry.type === 'earned' && parseFloat(String(entry.amount)) === 0 && (
                  <Minus size={16} className="text-warning shrink-0" />
                )}
                {entry.type === 'payout' && (
                  <ArrowDownCircle size={16} className="text-primary-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{entry.member_name}</span>
                  {entry.note && <span className="text-text-muted ml-1.5">— {entry.note}</span>}
                </div>
                <span className={cn(
                  'font-mono font-medium shrink-0',
                  parseFloat(String(entry.amount)) > 0 ? 'text-success' : parseFloat(String(entry.amount)) < 0 ? 'text-danger' : 'text-text-muted'
                )}>
                  {parseFloat(String(entry.amount)) > 0 ? '+' : ''}${parseFloat(String(entry.amount)).toFixed(2)}
                </span>
                <span className="text-xs text-text-muted shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout modal */}
      {showPayout && (
        <PayoutModal
          memberId={showPayout}
          memberName={balances.find((b: AllowanceBalance) => b.id === showPayout)?.name || ''}
          balance={parseFloat(String(balances.find((b: AllowanceBalance) => b.id === showPayout)?.allowance_balance || 0))}
          parentId={memberId}
          onClose={() => setShowPayout(null)}
        />
      )}
    </div>
  );
}

function AllowanceSettingsPanel({ settings, memberId }: { settings: any; memberId: number }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: any) => updateAllowanceSettings({ ...data, member_id: memberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowance-settings'] });
      toast.success('Settings updated');
    },
  });

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">Allowance enabled</span>
        <button
          onClick={() => mutation.mutate({ enabled: !settings.enabled })}
          className={cn('w-10 h-6 rounded-full transition-colors relative', settings.enabled ? 'bg-success' : 'bg-surface-overlay')}
        >
          <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform', settings.enabled ? 'left-4.5' : 'left-0.5')} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Rate per point</span>
        <div className="flex items-center gap-1">
          <span className="text-text-muted">$</span>
          <input
            type="number"
            min={0.01}
            max={100}
            step={0.25}
            value={settings.rate_per_point}
            onChange={(e) => mutation.mutate({ rate_per_point: parseFloat(e.target.value) || 1 })}
            className="w-20 px-2 py-1 rounded-lg bg-surface border border-border text-text text-sm text-right focus:border-primary-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm">All-or-nothing mode</span>
          <p className="text-xs text-text-muted">Must complete ALL daily tasks to earn allowance</p>
        </div>
        <button
          onClick={() => mutation.mutate({ all_or_nothing: !settings.all_or_nothing })}
          className={cn('w-10 h-6 rounded-full transition-colors relative shrink-0', settings.all_or_nothing ? 'bg-warning' : 'bg-surface-overlay')}
        >
          <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform', settings.all_or_nothing ? 'left-4.5' : 'left-0.5')} />
        </button>
      </div>
    </div>
  );
}

function PayoutModal({ memberId, memberName, balance, parentId, onClose }: {
  memberId: number; memberName: string; balance: number; parentId: number; onClose: () => void;
}) {
  const [amount, setAmount] = useState(balance > 0 ? balance.toFixed(2) : '');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => recordPayout({
      member_id: memberId,
      amount: parseFloat(amount),
      note,
      parent_id: parentId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
      queryClient.invalidateQueries({ queryKey: ['allowance-ledger'] });
      toast.success(`Paid $${parseFloat(amount).toFixed(2)} to ${memberName}`);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Pay Out to {memberName}</h3>
        <p className="text-sm text-text-muted mb-4">Current balance: ${balance.toFixed(2)}</p>
        <label className="block mb-3">
          <span className="text-sm text-text-muted mb-1 block">Amount</span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
            autoFocus
          />
        </label>
        <label className="block mb-4">
          <span className="text-sm text-text-muted mb-1 block">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border focus:border-primary-500 focus:outline-none text-text"
            placeholder="e.g. Cash payout"
          />
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border text-text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            className="flex-1 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {mutation.isPending ? 'Processing...' : `Pay $${parseFloat(amount || '0').toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
