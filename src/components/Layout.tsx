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
  Mic,
  Command,
  MapPin,
  Bot,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserStateStore } from '../store/userStateStore';
import { cn, getUserStateColor, getUserStateLabel } from '../lib/utils';
import ScheduleStrip from './ScheduleStrip';
import VoiceInput from './VoiceInput';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/ideas', label: 'Ideas', icon: Lightbulb },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/geode', label: 'GEODE Reports', icon: MapPin },
  { path: '/jobs', label: 'Agent Jobs', icon: Bot },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, signOut } = useAuthStore();
  const { currentState } = useUserStateStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

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
          {navItems.map((item) => (
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

            {/* Page title */}
            <h1 className="text-lg font-semibold text-gray-900 lg:hidden">
              {navItems.find((item) => location.pathname.startsWith(item.path))?.label || 'Wellspring'}
            </h1>

            {/* Command palette hint */}
            <div className="hidden lg:flex items-center gap-2 text-sm text-gray-500">
              <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">⌘K</kbd>
              <span>Command palette</span>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* Voice input button */}
              <button
                onClick={() => setVoiceActive(!voiceActive)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  voiceActive
                    ? 'bg-red-100 text-red-600'
                    : 'hover:bg-gray-100 text-gray-600'
                )}
                title="Voice input (hold Space)"
              >
                <Mic className={cn('w-5 h-5', voiceActive && 'animate-pulse')} />
              </button>
            </div>
          </div>

          {/* Schedule strip */}
          <ScheduleStrip />
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Voice input overlay */}
      {voiceActive && <VoiceInput onClose={() => setVoiceActive(false)} />}
    </div>
  );
}
