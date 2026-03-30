import { Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, ListTodo, Trophy, Settings, DollarSign, BarChart3 } from 'lucide-react';
import { useMember } from './hooks/useMember';
import { useTheme } from './hooks/useTheme';
import { ThemeToggle } from './components/ThemeToggle';
import { MemberPicker } from './components/MemberPicker';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import LeaderboardPage from './pages/LeaderboardPage';
import SettingsPage from './pages/SettingsPage';
import AllowancePage from './pages/AllowancePage';
import ParentDashboard from './pages/ParentDashboard';
import { cn } from './lib/utils';

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/allowance', icon: DollarSign, label: 'Allowance' },
  { to: '/leaderboard', icon: Trophy, label: 'Scores' },
];
const parentNavItem = { to: '/parent', icon: BarChart3, label: 'Insights' };
const settingsNavItem = { to: '/settings', icon: Settings, label: 'Settings' };

export default function App() {
  const { currentMember, selectMember } = useMember();
  const { theme, toggleTheme } = useTheme();

  if (!currentMember) {
    return <MemberPicker onSelect={selectMember} />;
  }

  const isParent = !!currentMember.is_parent;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-surface-raised border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
          ChoreQuest
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            onClick={() => selectMember(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-overlay border border-border hover:border-primary-500 transition-colors"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: currentMember.avatar_color }}
            >
              {currentMember.name[0].toUpperCase()}
            </span>
            <span className="text-sm text-text">{currentMember.name}</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 pb-20 max-w-5xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Dashboard memberId={currentMember.id} />} />
          <Route path="/calendar" element={<CalendarPage memberId={currentMember.id} />} />
          <Route path="/tasks" element={<TasksPage memberId={currentMember.id} />} />
          <Route path="/allowance" element={<AllowancePage memberId={currentMember.id} isParent={isParent} />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/parent" element={<ParentDashboard />} />
          <Route path="/settings" element={<SettingsPage memberId={currentMember.id} />} />
        </Routes>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-raised border-t border-border flex justify-around py-2 px-2 z-50">
        {[...baseNavItems, ...(isParent ? [parentNavItem] : []), settingsNavItem].map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors text-[10px]',
                isActive
                  ? 'text-primary-400 bg-primary-950/50'
                  : 'text-text-muted hover:text-text'
              )
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
