import { useQuery } from '@tanstack/react-query';
import { getTasks, getMemberStats, type TaskInstance } from '../api/client';
import { TaskCard } from '../components/TaskCard';
import { Flame, Star, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  memberId: number;
}

export default function Dashboard({ memberId }: DashboardProps) {
  const today = new Date().toISOString().split('T')[0];

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { start: today, end: today }],
    queryFn: () => getTasks({ start: today, end: today }),
  });

  const { data: stats } = useQuery({
    queryKey: ['member-stats', memberId],
    queryFn: () => getMemberStats(memberId),
  });

  const myTasks = tasks.filter(
    (t: TaskInstance) => t.assigned_to === memberId || t.assigned_to === null
  );
  const otherTasks = tasks.filter(
    (t: TaskInstance) => t.assigned_to !== null && t.assigned_to !== memberId
  );
  const pending = myTasks.filter((t: TaskInstance) => t.status === 'pending');
  const completed = myTasks.filter((t: TaskInstance) => t.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-raised border border-border rounded-xl p-3 text-center">
          <Flame className="mx-auto text-orange-400 mb-1" size={24} />
          <div className="text-2xl font-bold">{stats?.current_streak || 0}</div>
          <div className="text-xs text-text-muted">Day streak</div>
        </div>
        <div className="bg-surface-raised border border-border rounded-xl p-3 text-center">
          <Star className="mx-auto text-yellow-400 mb-1" size={24} />
          <div className="text-2xl font-bold">{stats?.total_points || 0}</div>
          <div className="text-xs text-text-muted">Total points</div>
        </div>
        <div className="bg-surface-raised border border-border rounded-xl p-3 text-center">
          <CheckCircle2 className="mx-auto text-success mb-1" size={24} />
          <div className="text-2xl font-bold">{stats?.total_completed || 0}</div>
          <div className="text-xs text-text-muted">Completed</div>
        </div>
      </div>

      {/* Today's tasks */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Today's Tasks
          {pending.length > 0 && (
            <span className="ml-2 text-sm font-normal text-text-muted">
              {pending.length} remaining
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="text-text-muted text-center py-8">Loading tasks...</div>
        ) : pending.length === 0 && completed.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-4xl mb-2">🎉</p>
            <p>No tasks today! Enjoy your free time.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((task: TaskInstance) => (
              <TaskCard key={task.id} task={task} currentMemberId={memberId} />
            ))}
            {completed.map((task: TaskInstance) => (
              <TaskCard key={task.id} task={task} currentMemberId={memberId} />
            ))}
          </div>
        )}
      </section>

      {/* Other members' tasks */}
      {otherTasks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-text-muted">Other Members</h2>
          <div className="space-y-2">
            {otherTasks.map((task: TaskInstance) => (
              <TaskCard key={task.id} task={task} currentMemberId={memberId} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
