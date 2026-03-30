import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { getTasks, type TaskInstance } from '../api/client';
import { TaskQuickAction } from '../components/TaskQuickAction';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface CalendarPageProps {
  memberId: number;
}

type CalendarView = 'month' | 'week' | 'day';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_TINY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MAX_PILLS_MOBILE = 2;
const MAX_PILLS_TABLET = 3;
const MAX_PILLS_DESKTOP = 6;

function useIsMobile() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return { isMobile: width < 640, isTablet: width >= 640 && width < 1024, isDesktop: width >= 1024, width };
}

export default function CalendarPage({ memberId }: CalendarPageProps) {
  const { isMobile, isTablet, isDesktop } = useIsMobile();
  const defaultView: CalendarView = isDesktop ? 'month' : isMobile ? 'day' : 'week';

  const [view, setView] = useState<CalendarView>(defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskInstance | null>(null);
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null);

  // Sync default view when screen size changes
  useEffect(() => {
    if (isMobile && view === 'month') setView('day');
  }, [isMobile]);

  // Date range for API query
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return {
        rangeStart: format(addDays(startOfWeek(ms, { weekStartsOn: 0 }), -1), 'yyyy-MM-dd'),
        rangeEnd: format(addDays(endOfWeek(me, { weekStartsOn: 0 }), 1), 'yyyy-MM-dd'),
      };
    }
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      return {
        rangeStart: format(addDays(ws, -1), 'yyyy-MM-dd'),
        rangeEnd: format(addDays(ws, 8), 'yyyy-MM-dd'),
      };
    }
    // day
    return {
      rangeStart: format(addDays(currentDate, -1), 'yyyy-MM-dd'),
      rangeEnd: format(addDays(currentDate, 1), 'yyyy-MM-dd'),
    };
  }, [view, currentDate]);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { start: rangeStart, end: rangeEnd }],
    queryFn: () => getTasks({ start: rangeStart, end: rangeEnd }),
  });

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskInstance[]>();
    for (const task of tasks) {
      if (task.assigned_to === null) continue;
      const dateKey = task.due_date.split('T')[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(task);
    }
    return map;
  }, [tasks]);

  // Navigation
  const goToday = () => setCurrentDate(new Date());

  const goPrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const goNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const headerLabel = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  }, [view, currentDate]);

  // Build grid data
  const weeks = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const cs = startOfWeek(ms, { weekStartsOn: 0 });
      const ce = endOfWeek(me, { weekStartsOn: 0 });
      const result: Date[][] = [];
      let day = cs;
      while (day <= ce) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) {
          week.push(day);
          day = addDays(day, 1);
        }
        result.push(week);
      }
      return result;
    }
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) week.push(addDays(ws, i));
      return [week];
    }
    return [[currentDate]];
  }, [view, currentDate]);

  const maxPills = Infinity;
  const weekdayLabels = isMobile ? WEEKDAYS_TINY : WEEKDAYS_SHORT;

  const openDayModal = (date: Date) => setDayModalDate(date);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Calendar</h2>

        <div className="flex items-center gap-1">
          {/* View switcher */}
          <div className="flex bg-surface-overlay rounded-lg p-0.5 mr-2">
            <ViewButton active={view === 'day'} onClick={() => setView('day')} label="Day" icon={<Calendar size={14} />} />
            <ViewButton active={view === 'week'} onClick={() => setView('week')} label="Week" icon={<CalendarRange size={14} />} />
            {!isMobile && (
              <ViewButton active={view === 'month'} onClick={() => setView('month')} label="Month" icon={<CalendarDays size={14} />} />
            )}
          </div>

          {/* Navigation */}
          <button onClick={goPrev} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="text-xs sm:text-sm font-medium min-w-[100px] sm:min-w-[140px] text-center">
            {headerLabel}
          </span>
          <button onClick={goNext} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors">
            <ChevronRight size={20} />
          </button>
          <button onClick={goToday} className="ml-1 px-2.5 py-1 rounded-md text-xs text-primary-400 hover:bg-primary-950/50 transition-colors">
            Today
          </button>
        </div>
      </div>

      {/* Calendar body */}
      {view === 'day' ? (
        <DayView
          date={currentDate}
          tasks={tasksByDate.get(format(currentDate, 'yyyy-MM-dd')) || []}
          onTaskClick={setSelectedTask}
          memberId={memberId}
        />
      ) : (
        <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
          {/* Weekday headers */}
          <div className={cn('grid border-b border-border', view === 'month' ? 'grid-cols-7' : 'grid-cols-7')}>
            {weekdayLabels.map((day, i) => (
              <div key={i} className="text-center text-xs sm:text-sm font-medium text-text-muted py-2 border-r border-border last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className={cn('grid grid-cols-7 border-b border-border last:border-b-0', view === 'week' && 'min-h-[200px]')}>
              {week.map((day, di) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDate.get(dateKey) || [];
                const inMonth = view === 'week' || isSameMonth(day, currentDate);
                const today = isToday(day);
                const overflow = dayTasks.length > maxPills;
                const visibleTasks = overflow ? dayTasks.slice(0, maxPills) : dayTasks;
                const hiddenCount = dayTasks.length - visibleTasks.length;

                return (
                  <div
                    key={di}
                    className={cn(
                      'border-r border-border last:border-r-0 p-1',
                      view === 'month' ? 'min-h-[60px] sm:min-h-[80px]' : 'min-h-[120px]',
                      !inMonth && 'bg-surface',
                      today && 'bg-primary-950/20'
                    )}
                  >
                    {/* Date number — clickable to open day modal */}
                    <button
                      onClick={() => openDayModal(day)}
                      className={cn(
                        'text-xs sm:text-sm mb-1 px-1 rounded-md hover:bg-surface-overlay transition-colors',
                        !inMonth && 'text-[#475569]',
                        inMonth && 'text-text-muted',
                        today && 'text-primary-400 font-bold',
                        dayTasks.length > 0 && 'cursor-pointer'
                      )}
                    >
                      {format(day, 'd')}
                    </button>

                    {/* Task pills */}
                    <div className="space-y-px">
                      {visibleTasks.map((task) => (
                        <CalendarTask
                          key={task.id}
                          task={task}
                          compact={isMobile && view === 'month'}
                          onClick={() => setSelectedTask(task)}
                        />
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => openDayModal(day)}
                          className="w-full text-left text-[10px] sm:text-xs px-1 py-0.5 text-primary-400 hover:text-primary-300 transition-colors"
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Day detail modal */}
      {dayModalDate && (
        <DayModal
          date={dayModalDate}
          tasks={tasksByDate.get(format(dayModalDate, 'yyyy-MM-dd')) || []}
          onClose={() => setDayModalDate(null)}
          onTaskClick={(task) => {
            setDayModalDate(null);
            setSelectedTask(task);
          }}
        />
      )}

      {/* Task action modal */}
      {selectedTask && (
        <TaskQuickAction
          task={selectedTask}
          currentMemberId={memberId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}

// ── View Switcher Button ────────────────────────────────────────────

function ViewButton({ active, onClick, label, icon }: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Day View ────────────────────────────────────────────────────────

function DayView({ date, tasks, onTaskClick, memberId }: {
  date: Date;
  tasks: TaskInstance[];
  onTaskClick: (task: TaskInstance) => void;
  memberId: number;
}) {
  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');
  const skipped = tasks.filter((t) => t.status === 'skipped');

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-4 space-y-4">
      <div className="text-center">
        <div className={cn('text-3xl font-bold', isToday(date) && 'text-primary-400')}>
          {format(date, 'd')}
        </div>
        <div className="text-sm text-text-muted">{format(date, 'EEEE, MMMM yyyy')}</div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          No tasks scheduled for this day.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <TaskSection label="Pending" tasks={pending} onTaskClick={onTaskClick} />
          )}
          {completed.length > 0 && (
            <TaskSection label="Completed" tasks={completed} onTaskClick={onTaskClick} />
          )}
          {skipped.length > 0 && (
            <TaskSection label="Skipped" tasks={skipped} onTaskClick={onTaskClick} />
          )}
        </>
      )}
    </div>
  );
}

function TaskSection({ label, tasks, onTaskClick }: {
  label: string;
  tasks: TaskInstance[];
  onTaskClick: (task: TaskInstance) => void;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{label}</h4>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <DayTaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  );
}

function DayTaskRow({ task, onClick }: { task: TaskInstance; onClick: () => void }) {
  const color = task.assignee_color || '#6366f1';
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
        'hover:bg-surface-overlay',
        isDone && 'opacity-50',
        isSkipped && 'opacity-40'
      )}
      style={{ borderLeft: `3px solid ${isDone ? '#22c55e' : isSkipped ? '#64748b' : color}` }}
    >
      <span className="text-lg">{task.icon || '📋'}</span>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-medium', (isDone || isSkipped) && 'line-through')}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          {task.assignee_name && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {task.assignee_name}
            </span>
          )}
          <span>{task.template_points}pt</span>
        </div>
      </div>
      <span className={cn(
        'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
        isDone && 'bg-[#22c55e20] text-[#22c55e]',
        isSkipped && 'bg-surface-overlay text-text-muted',
        !isDone && !isSkipped && 'bg-primary-950 text-primary-400'
      )}>
        {isDone ? 'Done' : isSkipped ? 'Skipped' : 'Pending'}
      </span>
    </button>
  );
}

// ── Day Detail Modal ────────────────────────────────────────────────

function DayModal({ date, tasks, onClose, onTaskClick }: {
  date: Date;
  tasks: TaskInstance[];
  onClose: () => void;
  onTaskClick: (task: TaskInstance) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">
              {format(date, 'EEEE')}
            </h3>
            <p className="text-sm text-text-muted">{format(date, 'MMMM d, yyyy')}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text p-1">
            <X size={20} />
          </button>
        </div>

        {/* Tasks */}
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            No tasks for this day.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <DayTaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))}
          </div>
        )}

        {/* Summary */}
        {tasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
            <span>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
            <span>
              {tasks.filter((t) => t.status === 'completed').length} done
              {tasks.filter((t) => t.status === 'pending').length > 0 &&
                ` · ${tasks.filter((t) => t.status === 'pending').length} pending`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar Task Pill ──────────────────────────────────────────────

function CalendarTask({ task, compact, onClick }: {
  task: TaskInstance;
  compact?: boolean;
  onClick: () => void;
}) {
  const color = task.assignee_color || '#6366f1';
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';

  if (compact) {
    // Mobile month view: just a colored dot
    return (
      <button
        onClick={onClick}
        className="inline-block w-1.5 h-1.5 rounded-full mr-px"
        style={{ backgroundColor: isDone ? '#22c55e' : isSkipped ? '#64748b' : color }}
        title={`${task.title} — ${task.assignee_name || 'Anyone'}`}
      />
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left text-[10px] sm:text-xs leading-snug px-1 py-0.5 rounded truncate block transition-opacity hover:opacity-100',
        isDone && 'opacity-40 line-through',
        isSkipped && 'opacity-30 line-through',
        !isDone && !isSkipped && 'opacity-90'
      )}
      style={{
        backgroundColor: isDone ? '#22c55e15' : isSkipped ? '#64748b15' : `${color}20`,
        borderLeft: `2px solid ${isDone ? '#22c55e' : isSkipped ? '#64748b' : color}`,
        color: 'var(--theme-text)',
      }}
      title={`${task.title} — ${task.assignee_name || 'Anyone'}`}
    >
      {task.icon || '📋'} {task.title}
    </button>
  );
}
