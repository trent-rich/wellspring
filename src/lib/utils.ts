import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, isToday, isTomorrow, isPast, differenceInHours, differenceInMinutes } from 'date-fns';

// Tailwind class merging utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatEventTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'h:mm a');
}

export function formatEventDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

// Time until helpers
export function getTimeUntil(date: string | Date): { hours: number; minutes: number; isPast: boolean } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const past = isPast(d);

  if (past) {
    return { hours: 0, minutes: 0, isPast: true };
  }

  const hours = differenceInHours(d, now);
  const minutes = differenceInMinutes(d, now) % 60;

  return { hours, minutes, isPast: false };
}

export function formatTimeUntil(date: string | Date): string {
  const { hours, minutes, isPast } = getTimeUntil(date);

  if (isPast) return 'Now';
  if (hours === 0 && minutes <= 5) return 'Starting soon';
  if (hours === 0) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// 72-hour containment helpers
export function getContainmentRemaining(blockedUntil: string | null): {
  canExecute: boolean;
  hoursRemaining: number;
  percentComplete: number;
} {
  if (!blockedUntil) {
    return { canExecute: true, hoursRemaining: 0, percentComplete: 100 };
  }

  const blocked = new Date(blockedUntil);
  const now = new Date();

  if (isPast(blocked)) {
    return { canExecute: true, hoursRemaining: 0, percentComplete: 100 };
  }

  const hoursRemaining = differenceInHours(blocked, now);
  const percentComplete = Math.max(0, Math.min(100, ((72 - hoursRemaining) / 72) * 100));

  return { canExecute: false, hoursRemaining, percentComplete };
}

// Priority helpers
export function getPriorityColor(priority: number): string {
  if (priority >= 80) return 'text-red-600 bg-red-50';
  if (priority >= 60) return 'text-orange-600 bg-orange-50';
  if (priority >= 40) return 'text-yellow-600 bg-yellow-50';
  return 'text-gray-600 bg-gray-50';
}

export function getPriorityLabel(priority: number): string {
  if (priority >= 80) return 'Critical';
  if (priority >= 60) return 'High';
  if (priority >= 40) return 'Medium';
  return 'Low';
}

// Status helpers
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-green-600 bg-green-50';
    case 'in_progress':
      return 'text-blue-600 bg-blue-50';
    case 'blocked':
      return 'text-red-600 bg-red-50';
    case 'waiting':
      return 'text-yellow-600 bg-yellow-50';
    case 'snoozed':
      return 'text-gray-600 bg-gray-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

// Stage helpers
export function getStageColor(stage: string): string {
  switch (stage) {
    case 'done':
      return 'text-green-600';
    case 'in_execution':
      return 'text-blue-600';
    case 'routed':
      return 'text-purple-600';
    case 'ripening':
      return 'text-amber-600';
    case 'blocked':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

// Cell affiliation helpers
export function getCellColor(cell: string | null): string {
  if (!cell) return 'bg-gray-100 text-gray-700';

  const cellColors: Record<string, string> = {
    'cell_1': 'bg-blue-100 text-blue-700',
    'cell_2': 'bg-purple-100 text-purple-700',
    'cell_3': 'bg-green-100 text-green-700',
    'cell_4': 'bg-orange-100 text-orange-700',
    'cell_5': 'bg-red-100 text-red-700',
  };

  return cellColors[cell] || 'bg-gray-100 text-gray-700';
}

export function getCellName(cell: string | null): string {
  if (!cell) return 'Unassigned';

  const cellNames: Record<string, string> = {
    'cell_1': 'Thermal Commons',
    'cell_2': 'Political/Jurisdictional',
    'cell_3': 'Engineering',
    'cell_4': 'Narrative/Cultural',
    'cell_5': 'Legal/Ethical',
  };

  return cellNames[cell] || cell;
}

// User state helpers
export function getUserStateColor(state: string): string {
  switch (state) {
    case 'embodied':
      return 'bg-embodied-100 text-embodied-700';
    case 'settle':
      return 'bg-settle-100 text-settle-700';
    case 'focus':
      return 'bg-blue-100 text-blue-700';
    case 'meeting_mode':
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function getUserStateLabel(state: string): string {
  switch (state) {
    case 'embodied':
      return 'Embodied Time';
    case 'settle':
      return 'Settling';
    case 'focus':
      return 'Focus Mode';
    case 'meeting_mode':
      return 'In Meeting';
    default:
      return 'Available';
  }
}

// Keyboard shortcut helpers
export function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('cmd', '⌘')
    .replace('ctrl', '⌃')
    .replace('alt', '⌥')
    .replace('shift', '⇧')
    .replace('+', ' ');
}

// Debounce utility
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function (this: unknown, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Throttle utility
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

// Generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// Parse voice command for task ID
export function parseTaskId(text: string): string | null {
  const match = text.match(/T-?(\d{1,4})/i);
  if (match) {
    return `T-${match[1].padStart(4, '0')}`;
  }
  return null;
}
