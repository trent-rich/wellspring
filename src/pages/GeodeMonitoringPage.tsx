import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  Bell,
  User,
  MessageSquare,
  Mail,
  Target,
  Zap,
  Clock,
  AlertTriangle,
  Edit3,
  Calendar,
  Plus,
  Trash2,
  Settings,
} from 'lucide-react';
import { useGeodeChapterStore, useTrentChapters, useOverdueChapters } from '../store/geodeChapterStore';
import type { GeodeState } from '../types/geode';
import {
  GEODE_STATES,
  GEODE_GOOGLE_DRIVE_FOLDER,
  getAllChapterTypes,
  getChapterTypeInfo,
  type ChapterTypeDefinition,
} from '../types/geode';
import {
  getStepMeta,
  calculateDaysOnStep,
  isStepOverdue,
  calculateWorkflowProgress,
} from '../types/geodeWorkflow';
import { cn } from '../lib/utils';
import ChapterDetailModal from '../components/geode/ChapterDetailModal';
import type { ChapterWorkflowState } from '../types/geodeWorkflow';

// ============================================
// SUB-COMPONENTS
// ============================================

interface StateTabProps {
  state: typeof GEODE_STATES[number];
  isActive: boolean;
  onClick: () => void;
  daysUntilDeadline: number;
  chaptersComplete: number;
  totalChapters: number;
}

function StateTab({ state, isActive, onClick, daysUntilDeadline, chaptersComplete, totalChapters }: StateTabProps) {
  const isUrgent = daysUntilDeadline <= 14;
  const isNear = daysUntilDeadline <= 30;

  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap',
        isActive
          ? 'bg-white border-watershed-600 text-watershed-700'
          : 'bg-gray-50 border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      <div className="flex items-center space-x-2">
        <span>{state.abbreviation}</span>
        {isUrgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        {!isUrgent && isNear && <span className="w-2 h-2 rounded-full bg-amber-500" />}
      </div>
      <div className="flex items-center justify-between text-xs mt-0.5">
        <span className="text-gray-400">{daysUntilDeadline}d</span>
        <span className="text-gray-400">{chaptersComplete}/{totalChapters}</span>
      </div>
    </button>
  );
}

interface ChapterRowProps {
  chapter: ChapterWorkflowState;
  onClick: () => void;
}

function ChapterRow({ chapter, onClick }: ChapterRowProps) {
  const customChapterTypes = useGeodeChapterStore(s => s.customChapterTypes);
  const chapterType = getChapterTypeInfo(chapter.chapterType, customChapterTypes);
  const stepMeta = getStepMeta(chapter.workflowType, chapter.currentStep);
  const progress = calculateWorkflowProgress(chapter.workflowType, chapter.currentStep);
  const daysOnStep = calculateDaysOnStep(chapter.currentStepStartedAt);
  const overdue = stepMeta ? isStepOverdue(chapter.currentStepStartedAt, stepMeta.typicalDurationDays) : false;

  const getStatusColor = () => {
    if (chapter.currentStep === 'done') return 'bg-green-100 text-green-800 border-green-200';
    if (chapter.currentStep === 'not_started') return 'bg-gray-100 text-gray-500 border-gray-200';
    if (overdue) return 'bg-red-100 text-red-800 border-red-200';
    if (chapter.currentOwner.toLowerCase().includes('trent')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (chapter.currentOwner.toLowerCase().includes('maria')) return 'bg-pink-100 text-pink-800 border-pink-200';
    if (chapter.currentOwner.toLowerCase().includes('author')) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-purple-100 text-purple-800 border-purple-200';
  };

  const getCommunicationIcon = () => {
    const ownerLower = chapter.currentOwner.toLowerCase();
    if (ownerLower.includes('maria') || ownerLower.includes('trent') || ownerLower.includes('ryan')) {
      return <span title="Slack"><MessageSquare className="w-3 h-3 text-purple-500" /></span>;
    }
    return <span title="Email"><Mail className="w-3 h-3 text-blue-500" /></span>;
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-watershed-300 hover:shadow-sm transition-all text-left"
    >
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        {/* Chapter number */}
        <div className="w-10 text-center flex-shrink-0">
          <span className="text-sm font-mono text-gray-500">Ch {chapterType?.chapterNum}</span>
        </div>

        {/* Chapter title and step */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-900 truncate">{chapterType?.label}</p>
            {chapter.blockers && (
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {stepMeta?.shortLabel || chapter.currentStep}
            {chapter.notes && ` • ${chapter.notes}`}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3 flex-shrink-0">
        {/* Progress bar mini */}
        <div className="w-16 hidden sm:block">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                chapter.currentStep === 'done' ? 'bg-green-500' : 'bg-watershed-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center mt-0.5">{progress}%</p>
        </div>

        {/* Days on step */}
        {chapter.currentStep !== 'done' && chapter.currentStep !== 'not_started' && (
          <div className={cn(
            'text-xs px-2 py-1 rounded-full',
            overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          )}>
            {daysOnStep}d
          </div>
        )}

        {/* Current Owner */}
        <div className="flex items-center space-x-1 text-sm text-gray-600 min-w-[90px]">
          <User className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{chapter.currentOwner || '—'}</span>
          {chapter.currentOwner && getCommunicationIcon()}
        </div>

        {/* Status badge */}
        <span className={cn(
          'px-2 py-1 text-xs font-medium rounded-full border min-w-[70px] text-center',
          getStatusColor()
        )}>
          {chapter.currentStep === 'done' ? 'Done' :
           chapter.currentStep === 'not_started' ? 'Not Started' :
           stepMeta?.shortLabel || 'In Progress'}
        </span>

        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  );
}

interface MyGeodeTasksProps {
  trentChapters: ChapterWorkflowState[];
}

function MyGeodeTasks({ trentChapters }: MyGeodeTasksProps) {
  const navigate = useNavigate();
  const customChapterTypes = useGeodeChapterStore(s => s.customChapterTypes);

  if (trentChapters.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p className="text-sm">No chapters currently with you</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trentChapters.slice(0, 6).map((chapter) => {
        const stateInfo = GEODE_STATES.find(s => s.value === chapter.reportState);
        const chapterType = getChapterTypeInfo(chapter.chapterType, customChapterTypes);
        const daysOnStep = calculateDaysOnStep(chapter.currentStepStartedAt);
        const stepMeta = getStepMeta(chapter.workflowType, chapter.currentStep);
        const overdue = stepMeta ? isStepOverdue(chapter.currentStepStartedAt, stepMeta.typicalDurationDays) : false;

        return (
          <button
            key={chapter.chapterId}
            onClick={() => navigate(`/geode?state=${chapter.reportState}`)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                overdue ? 'bg-red-500' : 'bg-blue-500'
              )} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {stateInfo?.abbreviation} Ch {chapterType?.chapterNum}: {chapterType?.label}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {stepMeta?.shortLabel} • {daysOnStep} days
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
        );
      })}
      {trentChapters.length > 6 && (
        <p className="text-xs text-gray-500 text-center">
          +{trentChapters.length - 6} more chapters
        </p>
      )}
    </div>
  );
}

// ============================================
// DOE DEADLINE EDITOR
// ============================================

interface DeadlineEditorProps {
  currentDeadline: string;
  onSave: (newDeadline: string) => void;
}

function DeadlineEditor({ currentDeadline, onSave }: DeadlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentDeadline);

  const handleSave = () => {
    onSave(value);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center space-x-1 text-sm text-gray-600 hover:text-watershed-600 transition-colors"
      >
        <Calendar className="w-4 h-4" />
        <span>{new Date(currentDeadline).toLocaleDateString()}</span>
        <Edit3 className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-watershed-500"
      />
      <button
        onClick={handleSave}
        className="px-2 py-1 text-xs text-white bg-watershed-600 rounded hover:bg-watershed-700"
      >
        Save
      </button>
      <button
        onClick={() => setIsEditing(false)}
        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
      >
        Cancel
      </button>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function GeodeMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeState, setActiveState] = useState<GeodeState>('arizona');
  const [selectedChapter, setSelectedChapter] = useState<ChapterWorkflowState | null>(null);
  const [showManageChapters, setShowManageChapters] = useState(false);
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [newChapterNum, setNewChapterNum] = useState('');
  const [newChapterLabel, setNewChapterLabel] = useState('');
  const [newChapterSlug, setNewChapterSlug] = useState('');
  const [newChapterScope, setNewChapterScope] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const {
    chapters,
    doeDeadlines,
    customChapterTypes,
    getChaptersForState,
    setDoeDeadline,
    initializeChapters,
    addChapterToState,
    removeChapterFromState,
    getStateChapterTypes,
    addCustomChapterType,
    removeCustomChapterType,
  } = useGeodeChapterStore();

  const allChapterTypes = getAllChapterTypes(customChapterTypes);

  const trentChapters = useTrentChapters();
  const overdueChapters = useOverdueChapters();

  // Initialize chapters on mount
  useEffect(() => {
    if (Object.keys(chapters).length === 0) {
      initializeChapters();
    }
  }, [chapters, initializeChapters]);

  // Get active state from URL or default
  useEffect(() => {
    const stateParam = searchParams.get('state');
    if (stateParam && GEODE_STATES.some(s => s.value === stateParam)) {
      setActiveState(stateParam as GeodeState);
    }
  }, [searchParams]);

  // Update URL when state changes
  const handleStateChange = (state: GeodeState) => {
    setActiveState(state);
    setSearchParams({ state });
  };

  // Calculate days until deadline for each state
  const getDaysUntilDeadline = (state: GeodeState) => {
    const deadline = doeDeadlines[state];
    return Math.ceil(
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
  };

  const activeDeadline = doeDeadlines[activeState];
  const activeDaysUntil = getDaysUntilDeadline(activeState);
  const activeChapters = getChaptersForState(activeState);
  const completedCount = activeChapters.filter(ch => ch.currentStep === 'done').length;
  const totalCount = activeChapters.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GEODE Monitoring</h1>
          <p className="text-gray-500 mt-1">Track chapter progress across all state reports</p>
        </div>
        <div className="flex items-center space-x-3">
          <a
            href={GEODE_GOOGLE_DRIVE_FOLDER}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Drive</span>
          </a>
        </div>
      </div>

      {/* Alerts */}
      {overdueChapters.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="font-medium text-red-800">
              {overdueChapters.length} chapter{overdueChapters.length !== 1 ? 's' : ''} overdue
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {overdueChapters.slice(0, 5).map(ch => {
              const stateInfo = GEODE_STATES.find(s => s.value === ch.reportState);
              const chapterType = getChapterTypeInfo(ch.chapterType, customChapterTypes);
              return (
                <button
                  key={ch.chapterId}
                  onClick={() => {
                    handleStateChange(ch.reportState as GeodeState);
                    setSelectedChapter(ch);
                  }}
                  className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded-full hover:bg-red-200 transition-colors"
                >
                  {stateInfo?.abbreviation} Ch {chapterType?.chapterNum}
                </button>
              );
            })}
            {overdueChapters.length > 5 && (
              <span className="text-xs text-red-600">+{overdueChapters.length - 5} more</span>
            )}
          </div>
        </div>
      )}

      {/* State Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-1 overflow-x-auto">
          {GEODE_STATES.map((state) => {
            const stateChapters = getChaptersForState(state.value);
            const stateComplete = stateChapters.filter(c => c.currentStep === 'done').length;
            return (
              <StateTab
                key={state.value}
                state={state}
                isActive={activeState === state.value}
                onClick={() => handleStateChange(state.value)}
                daysUntilDeadline={getDaysUntilDeadline(state.value)}
                chaptersComplete={stateComplete}
                totalChapters={stateChapters.length}
              />
            );
          })}
        </div>
      </div>

      {/* Active State Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Chapter List */}
        <div className="lg:col-span-2 space-y-4">
          {/* State Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MapPin className="w-6 h-6 text-watershed-600" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {GEODE_STATES.find(s => s.value === activeState)?.label}
                  </h2>
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <span>DOE Deadline:</span>
                    <DeadlineEditor
                      currentDeadline={activeDeadline}
                      onSave={(newDeadline) => setDoeDeadline(activeState, newDeadline)}
                    />
                  </div>
                </div>
              </div>
              <div className={cn(
                'px-4 py-2 rounded-lg',
                activeDaysUntil <= 14 ? 'bg-red-50 border border-red-200' :
                activeDaysUntil <= 30 ? 'bg-amber-50 border border-amber-200' :
                'bg-green-50 border border-green-200'
              )}>
                <div className="flex items-center space-x-2">
                  <Target className={cn(
                    'w-4 h-4',
                    activeDaysUntil <= 14 ? 'text-red-600' :
                    activeDaysUntil <= 30 ? 'text-amber-600' : 'text-green-600'
                  )} />
                  <span className={cn(
                    'text-sm font-medium',
                    activeDaysUntil <= 14 ? 'text-red-800' :
                    activeDaysUntil <= 30 ? 'text-amber-800' : 'text-green-800'
                  )}>
                    {activeDaysUntil} days until deadline
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Chapter Progress</span>
                <span>{completedCount}/{totalCount} complete</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Chapter List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-medium text-gray-700">Chapters</h3>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowManageChapters(!showManageChapters)}
                  className={cn(
                    'flex items-center space-x-1 text-xs px-2 py-1 rounded-lg transition-colors',
                    showManageChapters
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  )}
                >
                  <Settings className="w-3 h-3" />
                  <span>Manage</span>
                </button>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>= Days on step</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <MessageSquare className="w-3 h-3 text-purple-500" />
                    <span>= Slack</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Mail className="w-3 h-3 text-blue-500" />
                    <span>= Email</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Manage Chapters Panel */}
            {showManageChapters && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-indigo-800">
                    Manage Chapters — {GEODE_STATES.find(s => s.value === activeState)?.label}
                  </h4>
                </div>
                <div className="space-y-1">
                  {allChapterTypes.map(chType => {
                    const enabledList = getStateChapterTypes(activeState);
                    const isEnabled = enabledList.includes(chType.value);
                    return (
                      <div
                        key={chType.value}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                          isEnabled ? 'bg-white' : 'bg-indigo-100/50 opacity-60'
                        )}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono text-gray-400 w-8">
                            {chType.chapterNum}
                          </span>
                          <span className={isEnabled ? 'text-gray-900' : 'text-gray-500'}>
                            {chType.label}
                          </span>
                          {chType.isCustom && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-200 text-indigo-700 rounded-full">Custom</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          {isEnabled ? (
                            <button
                              onClick={() => {
                                if (confirm(`Remove Ch ${chType.chapterNum}: ${chType.label} from ${GEODE_STATES.find(s => s.value === activeState)?.label}?`)) {
                                  removeChapterFromState(activeState, chType.value);
                                }
                              }}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => addChapterToState(activeState, chType.value)}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-100 rounded transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          )}
                          {chType.isCustom && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete custom chapter type "${chType.label}"? This removes it from all states.`)) {
                                  removeCustomChapterType(chType.value);
                                }
                              }}
                              className="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete this custom chapter type"
                            >
                              Delete Type
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Create New Chapter Type */}
                {!showCreateChapter ? (
                  <button
                    onClick={() => setShowCreateChapter(true)}
                    className="flex items-center space-x-1 mt-3 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors w-full justify-center border border-dashed border-indigo-300"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Create New Chapter Type</span>
                  </button>
                ) : (
                  <div className="mt-3 bg-white border border-indigo-200 rounded-lg p-3 space-y-3">
                    <h5 className="text-sm font-medium text-indigo-800">New Chapter Type</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Chapter Number *</label>
                        <input
                          type="text"
                          placeholder="e.g. 10, 4.2"
                          value={newChapterNum}
                          onChange={(e) => {
                            setNewChapterNum(e.target.value);
                            if (!slugManuallyEdited && newChapterLabel) {
                              const cleanNum = e.target.value.replace(/\./g, '_');
                              const cleanLabel = newChapterLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
                              setNewChapterSlug(`ch${cleanNum}_${cleanLabel}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Label *</label>
                        <input
                          type="text"
                          placeholder="e.g. Workforce Development"
                          value={newChapterLabel}
                          onChange={(e) => {
                            setNewChapterLabel(e.target.value);
                            if (!slugManuallyEdited && newChapterNum) {
                              const cleanNum = newChapterNum.replace(/\./g, '_');
                              const cleanLabel = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
                              setNewChapterSlug(`ch${cleanNum}_${cleanLabel}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Slug (auto-generated, editable)</label>
                      <input
                        type="text"
                        value={newChapterSlug}
                        onChange={(e) => {
                          setNewChapterSlug(e.target.value);
                          setSlugManuallyEdited(true);
                        }}
                        className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="ch10_workforce_development"
                      />
                      {newChapterSlug && allChapterTypes.some(c => c.value === newChapterSlug) && (
                        <p className="text-xs text-red-500 mt-1">This slug already exists.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Contract Scope Text (optional)</label>
                      <textarea
                        value={newChapterScope}
                        onChange={(e) => setNewChapterScope(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        rows={2}
                        placeholder="Description for contract generation..."
                      />
                    </div>
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => {
                          setShowCreateChapter(false);
                          setNewChapterNum('');
                          setNewChapterLabel('');
                          setNewChapterSlug('');
                          setNewChapterScope('');
                          setSlugManuallyEdited(false);
                        }}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!newChapterNum || !newChapterLabel || !newChapterSlug) return;
                          if (allChapterTypes.some(c => c.value === newChapterSlug)) return;
                          const def: ChapterTypeDefinition = {
                            value: newChapterSlug,
                            label: newChapterLabel,
                            chapterNum: newChapterNum,
                            isCustom: true,
                            contractScopeText: newChapterScope || undefined,
                          };
                          addCustomChapterType(def);
                          // Auto-add to current state
                          addChapterToState(activeState, newChapterSlug);
                          // Reset form
                          setShowCreateChapter(false);
                          setNewChapterNum('');
                          setNewChapterLabel('');
                          setNewChapterSlug('');
                          setNewChapterScope('');
                          setSlugManuallyEdited(false);
                        }}
                        disabled={!newChapterNum || !newChapterLabel || !newChapterSlug || allChapterTypes.some(c => c.value === newChapterSlug)}
                        className={cn(
                          'flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                          (!newChapterNum || !newChapterLabel || !newChapterSlug || allChapterTypes.some(c => c.value === newChapterSlug))
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        )}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create & Add to {GEODE_STATES.find(s => s.value === activeState)?.abbreviation}</span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-indigo-400 mt-3">
                  Changes are saved automatically and persist across sessions.
                </p>
              </div>
            )}

            {activeChapters.map((chapter) => (
              <ChapterRow
                key={chapter.chapterId}
                chapter={chapter}
                onClick={() => setSelectedChapter(chapter)}
              />
            ))}
          </div>

          {/* Trent's Priorities (for Arizona) */}
          {activeState === 'arizona' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-800">Trent's AZ Priorities</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Subsurface', 'Policy', 'Electricity', 'Direct Use'].map((priority) => (
                  <span
                    key={priority}
                    className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full"
                  >
                    {priority}
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-700 mt-2">
                Subsurface and policy can be quick. Electricity and Direct Use are going to be hard.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* My GEODE Tasks */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">My GEODE Chapters</h3>
              <span className="text-xs text-gray-500">{trentChapters.length} with you</span>
            </div>
            <MyGeodeTasks trentChapters={trentChapters} />
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <Bell className="w-4 h-4 text-gray-500" />
                <span>Send status update to team</span>
              </button>
              <button className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <span>Message Maria on Slack</span>
              </button>
              <button className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <Mail className="w-4 h-4 text-gray-500" />
                <span>Email bylined authors</span>
              </button>
            </div>
          </div>

          {/* All States Overview */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">All States Overview</h3>
            <div className="space-y-2">
              {GEODE_STATES.map((state) => {
                const days = getDaysUntilDeadline(state.value);
                const stateChapters = getChaptersForState(state.value);
                const complete = stateChapters.filter(c => c.currentStep === 'done').length;
                const isUrgent = days <= 14;
                const isNear = days <= 30;
                return (
                  <button
                    key={state.value}
                    onClick={() => handleStateChange(state.value)}
                    className={cn(
                      'w-full flex items-center justify-between p-2 rounded-lg transition-colors',
                      activeState === state.value
                        ? 'bg-watershed-50 border border-watershed-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    )}
                  >
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        isUrgent ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-green-500'
                      )} />
                      <span className="text-sm font-medium text-gray-900">
                        {state.abbreviation}
                      </span>
                      <span className="text-xs text-gray-400">
                        {complete}/{stateChapters.length}
                      </span>
                    </div>
                    <span className={cn(
                      'text-xs',
                      isUrgent ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-gray-500'
                    )}>
                      {days}d
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Chapter Detail Modal */}
      {selectedChapter && (
        <ChapterDetailModal
          isOpen={!!selectedChapter}
          onClose={() => setSelectedChapter(null)}
          chapterState={selectedChapter}
          onUpdateStep={(newStep, owner, notes) => {
            // Update the chapter step in the store
            const { updateChapterStep } = useGeodeChapterStore.getState();
            updateChapterStep(
              selectedChapter.reportState as GeodeState,
              selectedChapter.chapterType,
              newStep,
              owner,
              notes
            );
            // Refresh the selected chapter
            const updated = useGeodeChapterStore.getState().getChapter(
              selectedChapter.reportState as GeodeState,
              selectedChapter.chapterType
            );
            if (updated) setSelectedChapter(updated);
          }}
          onActionSubmit={(action) => {
            console.log('AI Action submitted:', action);
            // TODO: Send to AI backend for processing
            // For now, just log it
          }}
        />
      )}
    </div>
  );
}
