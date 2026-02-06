import { useUserStateStore } from '../store/userStateStore';
import { cn, formatTimeUntil, getUserStateColor, getUserStateLabel } from '../lib/utils';
import { Leaf, Moon, Brain, X } from 'lucide-react';

export default function StateOverlay() {
  const { currentState, stateUntil, exitProtectedState } = useUserStateStore();

  // Only show overlay for protected states
  if (currentState === 'normal' || currentState === 'meeting_mode') {
    return null;
  }

  const getStateIcon = () => {
    switch (currentState) {
      case 'embodied':
        return <Leaf className="w-6 h-6" />;
      case 'settle':
        return <Moon className="w-6 h-6" />;
      case 'focus':
        return <Brain className="w-6 h-6" />;
      default:
        return null;
    }
  };

  const getStateMessage = () => {
    switch (currentState) {
      case 'embodied':
        return 'Embodied time. Be present. Notifications are silenced.';
      case 'settle':
        return 'Settling after embodied time. Take a moment to transition.';
      case 'focus':
        return 'Focus mode active. Interruptions are minimized.';
      default:
        return '';
    }
  };

  const getStateColor = () => {
    switch (currentState) {
      case 'embodied':
        return 'from-embodied-500/10 to-embodied-500/5 border-embodied-200';
      case 'settle':
        return 'from-settle-500/10 to-settle-500/5 border-settle-200';
      case 'focus':
        return 'from-blue-500/10 to-blue-500/5 border-blue-200';
      default:
        return '';
    }
  };

  const getTextColor = () => {
    switch (currentState) {
      case 'embodied':
        return 'text-embodied-700';
      case 'settle':
        return 'text-settle-700';
      case 'focus':
        return 'text-blue-700';
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 p-4 rounded-xl border shadow-lg bg-gradient-to-br backdrop-blur-sm max-w-sm',
        getStateColor(),
        currentState === 'settle' && 'animate-settle-breathe'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', getUserStateColor(currentState))}>
          {getStateIcon()}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className={cn('font-medium', getTextColor())}>
              {getUserStateLabel(currentState)}
            </h3>
            <button
              onClick={exitProtectedState}
              className="p-1 hover:bg-white/50 rounded transition-colors"
              title="Exit protected state"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">{getStateMessage()}</p>
          {stateUntil && (
            <p className="text-xs text-gray-500 mt-2">
              Ends {formatTimeUntil(stateUntil)}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar for settle state */}
      {currentState === 'settle' && stateUntil && (
        <div className="mt-3">
          <div className="h-1 bg-settle-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-settle-500 transition-all duration-1000"
              style={{
                width: `${Math.max(0, 100 - (new Date(stateUntil).getTime() - Date.now()) / (30 * 60 * 1000) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
