import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export type RecurrenceType = 'daily' | 'every_x_days' | 'weekly' | 'every_x_weeks' | 'monthly_date' | 'monthly_weekday';

export interface RecurrenceConfig {
  type: RecurrenceType;
  interval?: number;
  weekdays?: number[]; // 0=Mon, 1=Tue, ... 6=Sun (ISO)
  monthDay?: number;
  weekdayOrdinal?: number; // 1=first, 2=second, -1=last
  weekday?: number; // 0=Mon ... 6=Sun
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: -1, label: 'Last' },
];

interface RecurrenceEditorProps {
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
}

export function recurrenceToRRule(config: RecurrenceConfig): string {
  const { type } = config;
  switch (type) {
    case 'daily':
      return 'FREQ=DAILY;INTERVAL=1';
    case 'every_x_days':
      return `FREQ=DAILY;INTERVAL=${config.interval || 2}`;
    case 'weekly': {
      const days = (config.weekdays || [0]).map(d => ['MO','TU','WE','TH','FR','SA','SU'][d]);
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days.join(',')}`;
    }
    case 'every_x_weeks': {
      const wdays = (config.weekdays || [0]).map(d => ['MO','TU','WE','TH','FR','SA','SU'][d]);
      return `FREQ=WEEKLY;INTERVAL=${config.interval || 2};BYDAY=${wdays.join(',')}`;
    }
    case 'monthly_date':
      return `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${config.monthDay || 1}`;
    case 'monthly_weekday': {
      const dayCode = ['MO','TU','WE','TH','FR','SA','SU'][config.weekday || 0];
      return `FREQ=MONTHLY;INTERVAL=1;BYDAY=${config.weekdayOrdinal || 1}${dayCode}`;
    }
    default:
      return 'FREQ=DAILY;INTERVAL=1';
  }
}

export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  const [config, setConfig] = useState<RecurrenceConfig>(value);

  useEffect(() => {
    onChange(config);
  }, [config, onChange]);

  const update = (patch: Partial<RecurrenceConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-4">
      {/* Frequency type selector */}
      <div>
        <span className="text-sm text-text-muted mb-2 block">Repeats</span>
        <select
          value={config.type}
          onChange={(e) => update({ type: e.target.value as RecurrenceType })}
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
        >
          <option value="daily">Every day</option>
          <option value="every_x_days">Every X days</option>
          <option value="weekly">Weekly on specific days</option>
          <option value="every_x_weeks">Every X weeks</option>
          <option value="monthly_date">Monthly on a date</option>
          <option value="monthly_weekday">Monthly on a weekday</option>
        </select>
      </div>

      {/* Interval for every_x_days / every_x_weeks */}
      {(config.type === 'every_x_days' || config.type === 'every_x_weeks') && (
        <div>
          <span className="text-sm text-text-muted mb-1 block">
            Every {config.type === 'every_x_days' ? 'days' : 'weeks'}
          </span>
          <input
            type="number"
            min={2}
            max={365}
            value={config.interval || 2}
            onChange={(e) => update({ interval: parseInt(e.target.value) || 2 })}
            className="w-24 px-3 py-2 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      {/* Day of week selector for weekly types */}
      {(config.type === 'weekly' || config.type === 'every_x_weeks') && (
        <div>
          <span className="text-sm text-text-muted mb-2 block">On these days</span>
          <div className="flex gap-1.5">
            {DAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const current = config.weekdays || [];
                  const next = current.includes(i)
                    ? current.filter(d => d !== i)
                    : [...current, i].sort();
                  update({ weekdays: next.length > 0 ? next : [i] });
                }}
                className={cn(
                  'w-10 h-10 rounded-lg text-sm font-medium transition-colors',
                  (config.weekdays || []).includes(i)
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface border border-border text-text-muted hover:border-primary-500'
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly date */}
      {config.type === 'monthly_date' && (
        <div>
          <span className="text-sm text-text-muted mb-1 block">Day of month</span>
          <input
            type="number"
            min={1}
            max={31}
            value={config.monthDay || 1}
            onChange={(e) => update({ monthDay: parseInt(e.target.value) || 1 })}
            className="w-24 px-3 py-2 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      {/* Monthly weekday */}
      {config.type === 'monthly_weekday' && (
        <div className="flex gap-3">
          <div>
            <span className="text-sm text-text-muted mb-1 block">Which</span>
            <select
              value={config.weekdayOrdinal || 1}
              onChange={(e) => update({ weekdayOrdinal: parseInt(e.target.value) })}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
            >
              {ORDINALS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-sm text-text-muted mb-1 block">Day</span>
            <select
              value={config.weekday || 0}
              onChange={(e) => update({ weekday: parseInt(e.target.value) })}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:border-primary-500 focus:outline-none"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
