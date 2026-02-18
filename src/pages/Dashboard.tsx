import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  Zap,
  TrendingUp,
  Calendar,
  Lightbulb,
  ArrowRight,
  Activity,
  MapPin,
  Target,
  FileText,
  User,
} from 'lucide-react';
import { useTaskStore, usePriorityTasks, useJudgmentQueue, useHardGateTasks } from '../store/taskStore';
import { useRipeningIdeas, useReadyToExecuteIdeas } from '../store/ideaStore';
import { useTodayEvents } from '../store/calendarStore';
import { useUserStateStore } from '../store/userStateStore';
import { useGeodeChapterStore, useTrentChapters, useOverdueChapters } from '../store/geodeChapterStore';
import { useHighPriorityEmailTasks } from '../store/geodeEmailStore';
import { GEODE_STATES, getChapterTypeInfo } from '../types/geode';
import type { GeodeState } from '../types/geode';
import { getStepMeta, calculateDaysOnStep, isStepOverdue } from '../types/geodeWorkflow';
import type { KPIData } from '../types';
import EmailConfirmationCard from '../components/geode/EmailConfirmationCard';
import {
  cn,
  formatEventTime,
  getContainmentRemaining,
} from '../lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const { tasks } = useTaskStore();
  const todayEvents = useTodayEvents();
  const { currentState } = useUserStateStore();

  const priorityTasks = usePriorityTasks();
  const judgmentQueue = useJudgmentQueue();
  const hardGateTasks = useHardGateTasks();
  const ripeningIdeas = useRipeningIdeas();
  const readyIdeas = useReadyToExecuteIdeas();

  // GEODE chapter store
  const { chapters, doeDeadlines, customChapterTypes, initializeChapters } = useGeodeChapterStore();
  const trentChapters = useTrentChapters();
  const overdueGeodeChapters = useOverdueChapters();

  // GEODE email store
  const highPriorityEmailTasks = useHighPriorityEmailTasks();

  // Initialize GEODE chapters on mount (email mock data removed - use real data only)
  useEffect(() => {
    if (Object.keys(chapters).length === 0) {
      initializeChapters();
    }
  }, [chapters, initializeChapters]);

  const [kpis, setKpis] = useState<KPIData>({
    open_tasks: 0,
    due_today: 0,
    completed_this_week: 0,
    judgment_queue_size: 0,
    judgment_median_age_hours: 0,
    hard_gate_items_open: 0,
    escalations_by_level: {},
    reality_check_breaches: 0,
  });

  // Calculate KPIs
  useEffect(() => {
    const openTasks = tasks.filter((t) => t.status !== 'completed').length;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const dueToday = tasks.filter(
      (t) => t.due_date && new Date(t.due_date) <= today && t.status !== 'completed'
    ).length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const completedThisWeek = tasks.filter(
      (t) => t.completed_at && new Date(t.completed_at) >= weekAgo
    ).length;

    // Calculate escalations by level
    const escalations: Record<number, number> = {};
    tasks.forEach((t) => {
      if (t.escalation_level > 0) {
        escalations[t.escalation_level] = (escalations[t.escalation_level] || 0) + 1;
      }
    });

    // Reality check breaches (SLA > 48 hours past)
    const now = new Date();
    const breaches = tasks.filter((t) => {
      if (!t.sla_due_at) return false;
      const slaDue = new Date(t.sla_due_at);
      return slaDue < now && t.status !== 'completed';
    }).length;

    setKpis({
      open_tasks: openTasks,
      due_today: dueToday,
      completed_this_week: completedThisWeek,
      judgment_queue_size: judgmentQueue.length,
      judgment_median_age_hours: 0, // Would need to calculate
      hard_gate_items_open: hardGateTasks.length,
      escalations_by_level: escalations,
      reality_check_breaches: breaches,
    });
  }, [tasks, judgmentQueue, hardGateTasks]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Command Center</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">
          {currentState === 'normal'
            ? "Here's what needs your attention"
            : `You're in ${currentState.replace('_', ' ')} mode`}
        </p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <button
          onClick={() => navigate('/tasks')}
          className="kpi-tile text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <CheckSquare className="w-5 h-5 text-watershed-600" />
            <span className="text-2xl font-bold text-gray-900">{kpis.open_tasks}</span>
          </div>
          <p className="text-sm text-gray-600">Open Tasks</p>
        </button>

        <button
          onClick={() => navigate('/tasks?filter=due_today')}
          className={cn('kpi-tile text-left', kpis.due_today > 0 && 'kpi-tile-alert')}
        >
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <span className="text-2xl font-bold text-gray-900">{kpis.due_today}</span>
          </div>
          <p className="text-sm text-gray-600">Due Today</p>
        </button>

        <button
          onClick={() => navigate('/tasks?filter=judgment')}
          className={cn('kpi-tile text-left', kpis.judgment_queue_size > 0 && 'border-amber-300')}
        >
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-5 h-5 text-amber-600" />
            <span className="text-2xl font-bold text-gray-900">{kpis.judgment_queue_size}</span>
          </div>
          <p className="text-sm text-gray-600">Judgment Queue</p>
        </button>

        <button
          onClick={() => navigate('/tasks?filter=hard_gate')}
          className={cn('kpi-tile text-left', kpis.hard_gate_items_open > 0 && 'kpi-tile-alert')}
        >
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-2xl font-bold text-gray-900">{kpis.hard_gate_items_open}</span>
          </div>
          <p className="text-sm text-gray-600">Hard Gates Open</p>
        </button>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Priority tasks */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Priority Tasks</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-sm text-watershed-600 hover:text-watershed-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* AI-Detected Email Tasks (highest priority) */}
          {highPriorityEmailTasks.length > 0 && (
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <span className="animate-pulse">✨</span>
                <span className="font-medium">AI detected {highPriorityEmailTasks.length} item{highPriorityEmailTasks.length !== 1 ? 's' : ''} needing confirmation</span>
              </div>
              {highPriorityEmailTasks.map((task) => (
                <EmailConfirmationCard key={task.id} task={task} />
              ))}
            </div>
          )}

          {/* Combined Priority: GEODE Chapters + Regular Tasks */}
          {(trentChapters.length > 0 || priorityTasks.length > 0) ? (
            <div className="space-y-3">
              {/* GEODE Chapters with Trent as owner (high priority) */}
              {trentChapters.slice(0, 4).map((chapter) => {
                const stateInfo = GEODE_STATES.find(s => s.value === chapter.reportState);
                const chapterType = getChapterTypeInfo(chapter.chapterType, customChapterTypes);
                const stepMeta = getStepMeta(chapter.workflowType, chapter.currentStep);
                const daysOnStep = calculateDaysOnStep(chapter.currentStepStartedAt);
                const overdue = stepMeta ? isStepOverdue(chapter.currentStepStartedAt, stepMeta.typicalDurationDays) : false;
                const deadline = doeDeadlines[chapter.reportState as GeodeState];
                const daysUntil = Math.ceil(
                  (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const isUrgent = daysUntil <= 14;

                return (
                  <button
                    key={chapter.chapterId}
                    onClick={() => navigate(`/geode?state=${chapter.reportState}`)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-all',
                      overdue
                        ? 'bg-red-50 border-red-200 hover:border-red-300'
                        : isUrgent
                        ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                        : 'bg-watershed-50 border-watershed-200 hover:border-watershed-300'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold',
                        overdue
                          ? 'bg-red-100 text-red-700'
                          : isUrgent
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-watershed-100 text-watershed-700'
                      )}>
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {stateInfo?.abbreviation} Ch {chapterType?.chapterNum}: {chapterType?.label}
                          </span>
                          {overdue && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          <span>{stepMeta?.shortLabel || chapter.currentStep}</span>
                          <span>•</span>
                          <span>{daysOnStep}d on step</span>
                          {chapter.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate">{chapter.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className={cn(
                          'text-xs font-medium hidden sm:inline',
                          isUrgent ? 'text-amber-600' : 'text-gray-500'
                        )}>
                          {daysUntil}d to DOE
                        </span>
                        <span className="text-xs px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="hidden sm:inline">GEODE</span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Regular priority tasks */}
              {priorityTasks.slice(0, Math.max(1, 5 - trentChapters.length)).map((task) => (
                <button
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="task-card w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400">{task.short_id}</span>
                    <span className="font-medium text-gray-900 truncate flex-1">{task.title}</span>
                    {task.judgment_required && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                        Judgment
                      </span>
                    )}
                  </div>
                </button>
              ))}

              {/* Show count if more GEODE chapters with Trent */}
              {trentChapters.length > 4 && (
                <button
                  onClick={() => navigate('/geode')}
                  className="w-full text-center text-sm text-watershed-600 hover:text-watershed-700 py-2"
                >
                  +{trentChapters.length - 4} more GEODE chapters with you
                </button>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No priority tasks right now</p>
            </div>
          )}

          {/* GEODE State Reports - High Priority */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-watershed-600" />
                GEODE Reports
                {overdueGeodeChapters.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {overdueGeodeChapters.length} overdue
                  </span>
                )}
              </h2>
              <button
                onClick={() => navigate('/geode')}
                className="text-sm text-watershed-600 hover:text-watershed-700 flex items-center gap-1"
              >
                Monitor <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              {GEODE_STATES.map((state) => {
                const deadline = doeDeadlines[state.value];
                const daysUntil = Math.ceil(
                  (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const isUrgent = daysUntil <= 14;
                const isNear = daysUntil <= 30;

                // Get deadline label based on date
                const deadlineDate = new Date(deadline);
                const monthLabel = deadlineDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                return (
                  <button
                    key={state.value}
                    onClick={() => navigate(`/geode?state=${state.value}`)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all hover:shadow-sm',
                      isUrgent
                        ? 'bg-red-50 border-red-200 hover:border-red-300'
                        : isNear
                        ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{state.abbreviation}</span>
                      <div className="flex items-center space-x-1">
                        <Target className={cn(
                          'w-3 h-3',
                          isUrgent ? 'text-red-500' : isNear ? 'text-amber-500' : 'text-gray-400'
                        )} />
                        <span className={cn(
                          'text-xs font-medium',
                          isUrgent ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-gray-500'
                        )}>
                          {daysUntil}d
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{monthLabel}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Today's schedule */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Today's Schedule
            </h2>

            {todayEvents.length > 0 ? (
              <div className="space-y-2">
                {todayEvents.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      'p-3 rounded-lg border',
                      event.embodied_flag
                        ? 'bg-embodied-50 border-embodied-200'
                        : 'bg-white border-gray-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {event.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatEventTime(event.start_time)}
                      </span>
                    </div>
                    {event.preread_required && (
                      <span className="text-xs text-amber-600 mt-1 inline-block">
                        Pre-read required
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">No meetings today</p>
              </div>
            )}

            <button
              onClick={() => navigate('/calendar')}
              className="text-sm text-watershed-600 hover:text-watershed-700 mt-2 flex items-center gap-1"
            >
              Full calendar <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Ideas ripening */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Ideas
            </h2>

            {readyIdeas.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-green-700">
                  <strong>{readyIdeas.length}</strong> idea{readyIdeas.length > 1 ? 's' : ''} ready
                  to execute
                </p>
              </div>
            )}

            {ripeningIdeas.length > 0 ? (
              <div className="space-y-2">
                {ripeningIdeas.slice(0, 3).map((idea) => {
                  const { hoursRemaining, percentComplete } = getContainmentRemaining(
                    idea.execution_blocked_until
                  );
                  return (
                    <div key={idea.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-amber-900 truncate">{idea.title}</p>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-amber-600 mb-1">
                          <span>Ripening</span>
                          <span>{hoursRemaining}h remaining</span>
                        </div>
                        <div className="containment-progress">
                          <div
                            className="containment-progress-bar"
                            style={{ width: `${percentComplete}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">No ideas ripening</p>
              </div>
            )}

            <button
              onClick={() => navigate('/ideas')}
              className="text-sm text-watershed-600 hover:text-watershed-700 mt-2 flex items-center gap-1"
            >
              All ideas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Escalation status */}
          {Object.keys(kpis.escalations_by_level).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Escalations
              </h2>
              <div className="space-y-2">
                {Object.entries(kpis.escalations_by_level).map(([level, count]) => (
                  <div
                    key={level}
                    className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg"
                  >
                    <span className="text-sm text-orange-700">Level {level}</span>
                    <span className="font-semibold text-orange-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reality check breaches */}
          {kpis.reality_check_breaches > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">{kpis.reality_check_breaches} SLA Breaches</span>
              </div>
              <p className="text-sm text-red-600 mt-1">
                Reality Check items past 48-hour deadline
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Weekly progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">This Week</h2>
          <span className="text-sm text-gray-500">
            {kpis.completed_this_week} tasks completed
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-watershed-400 to-watershed-600 transition-all duration-500"
            style={{
              width: `${Math.min(100, (kpis.completed_this_week / Math.max(1, kpis.open_tasks + kpis.completed_this_week)) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
