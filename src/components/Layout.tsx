import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  Lightbulb,
  Calendar,
  Settings,
  LogOut,
  Menu,
  X,
  Command,
  MapPin,
  Bot,
  GitBranch,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserStateStore } from '../store/userStateStore';
import { cn, getUserStateColor, getUserStateLabel } from '../lib/utils';
import ScheduleStrip from './ScheduleStrip';
import CommandBar from './CommandBar';
import GeodeWorkflowModal from './GeodeWorkflowModal';
import type { TaskWithRelations } from '../types';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/ideas', label: 'Ideas', icon: Lightbulb },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/geode', label: 'GEODE Reports', icon: MapPin },
  { path: '/sequencing', label: 'Sequencing', icon: GitBranch },
  { path: '/jobs', label: 'Agent Jobs', icon: Bot },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, signOut } = useAuthStore();
  const { currentState } = useUserStateStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [geodeTask, setGeodeTask] = useState<TaskWithRelations | null>(null);

  const isRestrictedRole = user?.role === 'sequencing';
  const filteredNavItems = useMemo(
    () =>
      isRestrictedRole
        ? navItems.filter((item) => item.path === '/sequencing')
        : navItems,
    [isRestrictedRole]
  );

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-watershed-500 to-watershed-700 flex items-center justify-center">
              <Command className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900 leading-tight">Wellspring</span>
              <span className="text-[10px] text-gray-500 leading-tight">Watershed Command Center</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User state indicator */}
        {currentState !== 'normal' && (
          <div className={cn('px-4 py-2 text-sm', getUserStateColor(currentState))}>
            {getUserStateLabel(currentState)}
          </div>
        )}

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-watershed-50 text-watershed-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-watershed-100 flex items-center justify-center">
              <span className="text-watershed-700 font-medium">
                {user?.full_name?.[0] || user?.email?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.full_name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Page title - mobile only */}
            <h1 className="text-lg font-semibold text-gray-900 lg:hidden">
              {filteredNavItems.find((item) => location.pathname.startsWith(item.path))?.label || 'Wellspring'}
            </h1>

            {/* Command bar - centered, visible on larger screens */}
            <div className="hidden sm:flex flex-1 justify-center px-4">
              <CommandBar onGeodeWorkflow={(task) => setGeodeTask(task)} />
            </div>

            {/* Empty div for flex spacing on mobile */}
            <div className="w-10 lg:hidden" />
          </div>

          {/* Mobile command bar */}
          <div className="sm:hidden px-4 pb-2">
            <CommandBar onGeodeWorkflow={(task) => setGeodeTask(task)} />
          </div>

          {/* Schedule strip */}
          <ScheduleStrip />
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* GEODE Workflow Modal */}
      {geodeTask && (
        <GeodeWorkflowModal
          task={geodeTask}
          onClose={() => setGeodeTask(null)}
          onComplete={() => setGeodeTask(null)}
        />
      )}
    </div>
  );
}
