import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  Search,
  CheckSquare,
  Lightbulb,
  Calendar,
  Settings,
  Plus,
  Play,
  Pause,
  LogOut,
  LayoutDashboard,
  ArrowRight,
} from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { useIdeaStore } from '../store/ideaStore';
import { useUserStateStore } from '../store/userStateStore';
import { useAuthStore } from '../store/authStore';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { tasks } = useTaskStore();
  const { ideas } = useIdeaStore();
  const { currentState, enterFocusMode, exitProtectedState } = useUserStateStore();
  const { signOut } = useAuthStore();

  // Open with Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }

      // Escape to close
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setSearch('');
    }
  }, [open]);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  if (!open) return null;

  return (
    <div className="command-palette" onClick={() => setOpen(false)}>
      <Command
        className="command-palette-content"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={true}
      >
        <div className="flex items-center border-b border-gray-200 px-4">
          <Search className="w-5 h-5 text-gray-400 mr-2" />
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or search..."
            className="flex-1 h-14 bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
          <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 font-mono text-xs text-gray-500">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-gray-500">
            No results found.
          </Command.Empty>

          {/* Navigation */}
          <Command.Group heading="Navigation" className="mb-2">
            <Command.Item
              onSelect={() => runCommand(() => navigate('/dashboard'))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <LayoutDashboard className="w-4 h-4 text-gray-400" />
              <span>Go to Dashboard</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => navigate('/tasks'))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <CheckSquare className="w-4 h-4 text-gray-400" />
              <span>Go to Tasks</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => navigate('/ideas'))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <Lightbulb className="w-4 h-4 text-gray-400" />
              <span>Go to Ideas</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => navigate('/calendar'))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>Go to Calendar</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => navigate('/settings'))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              <span>Go to Settings</span>
            </Command.Item>
          </Command.Group>

          {/* Quick Actions */}
          <Command.Group heading="Quick Actions" className="mb-2">
            <Command.Item
              onSelect={() => runCommand(() => {
                navigate('/tasks');
                // Could trigger a modal or inline form
              })}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <Plus className="w-4 h-4 text-gray-400" />
              <span>Create new task</span>
              <kbd className="ml-auto text-xs text-gray-400">N</kbd>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => {
                navigate('/ideas');
              })}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
            >
              <Lightbulb className="w-4 h-4 text-gray-400" />
              <span>Capture new idea</span>
              <kbd className="ml-auto text-xs text-gray-400">I</kbd>
            </Command.Item>
          </Command.Group>

          {/* State Controls */}
          <Command.Group heading="State" className="mb-2">
            {currentState === 'normal' ? (
              <Command.Item
                onSelect={() => runCommand(() => enterFocusMode(60))}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
              >
                <Play className="w-4 h-4 text-gray-400" />
                <span>Start Focus Mode (1 hour)</span>
              </Command.Item>
            ) : (
              <Command.Item
                onSelect={() => runCommand(() => exitProtectedState())}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
              >
                <Pause className="w-4 h-4 text-gray-400" />
                <span>Exit {currentState.replace('_', ' ')} mode</span>
              </Command.Item>
            )}
          </Command.Group>

          {/* Recent Tasks */}
          {tasks.length > 0 && (
            <Command.Group heading="Recent Tasks" className="mb-2">
              {tasks.slice(0, 5).map((task) => (
                <Command.Item
                  key={task.id}
                  value={`task ${task.short_id} ${task.title}`}
                  onSelect={() => runCommand(() => navigate(`/tasks/${task.id}`))}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
                >
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 font-mono">{task.short_id}</span>
                  <span className="truncate">{task.title}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300 ml-auto" />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Recent Ideas */}
          {ideas.length > 0 && (
            <Command.Group heading="Recent Ideas" className="mb-2">
              {ideas.slice(0, 3).map((idea) => (
                <Command.Item
                  key={idea.id}
                  value={`idea ${idea.title}`}
                  onSelect={() => runCommand(() => navigate('/ideas'))}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50"
                >
                  <Lightbulb className="w-4 h-4 text-gray-400" />
                  <span className="truncate">{idea.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Account */}
          <Command.Group heading="Account">
            <Command.Item
              onSelect={() => runCommand(() => signOut())}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-watershed-50 text-red-600"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </Command.Item>
          </Command.Group>
        </Command.List>

        {/* Footer with keyboard hints - hidden on mobile */}
        <div className="hidden sm:flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">Esc</kbd>
              Close
            </span>
          </div>
        </div>
        {/* Mobile close button */}
        <div className="sm:hidden border-t border-gray-200 p-3">
          <button
            onClick={() => setOpen(false)}
            className="w-full py-3 text-center text-sm font-medium text-gray-500 hover:text-gray-700 active:bg-gray-50 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </Command>
    </div>
  );
}
