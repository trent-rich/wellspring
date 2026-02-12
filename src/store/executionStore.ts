/**
 * Execution Store
 *
 * Tracks background GEODE workflow executions and provides toast-style
 * notifications. When the user clicks Execute, the modal closes immediately
 * and execution continues here in the background.
 */

import { create } from 'zustand';

export interface ExecutionJob {
  id: string;
  taskShortId: string;
  taskId: string;
  workflowTitle: string;
  state: string;
  chapter: string;
  authorName?: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  message?: string;
  startedAt: number;
  completedAt?: number;
}

interface ExecutionState {
  jobs: ExecutionJob[];
  addJob: (job: Omit<ExecutionJob, 'status' | 'startedAt'>) => void;
  updateJob: (id: string, updates: Partial<ExecutionJob>) => void;
  dismissJob: (id: string) => void;
  clearCompleted: () => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  jobs: [],

  addJob: (job) => set((state) => ({
    jobs: [
      ...state.jobs,
      { ...job, status: 'running', startedAt: Date.now() },
    ],
  })),

  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map((j) =>
      j.id === id ? { ...j, ...updates, completedAt: updates.status !== 'running' ? Date.now() : j.completedAt } : j
    ),
  })),

  dismissJob: (id) => set((state) => ({
    jobs: state.jobs.filter((j) => j.id !== id),
  })),

  clearCompleted: () => set((state) => ({
    jobs: state.jobs.filter((j) => j.status === 'running'),
  })),
}));
