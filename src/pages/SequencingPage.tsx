import { useState, useMemo } from 'react';
import {
  GitBranch,
  Users,
  Network,
  Zap,
  ChevronDown,
  ChevronRight,
  Check,
  Send,
  Clock,
  XCircle,
  MessageSquare,
  FileText,
  Lock,
  Unlock,
  User,
  Settings,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSequencingStore } from '../store/sequencingStore';
import { useAuthStore } from '../store/authStore';
import InviteeDetail from '../components/sequencing/InviteeDetail';
import DraftComposer from '../components/sequencing/DraftComposer';
import ResponseTracker from '../components/sequencing/ResponseTracker';
import type { Invitee, InvitationPhase, InvitationStatus } from '../types/sequencing';
import { canExecuteForInvitee, isOwnInvitee } from '../types/sequencing';

type TabView = 'invitations' | 'dependencies' | 'automations';

const PHASE_META: Record<
  InvitationPhase,
  { label: string; description: string; timeline: string; color: string }
> = {
  0: {
    label: 'Jamie Approval',
    description: 'Present complete package to Jamie for approval',
    timeline: 'Feb 10-14',
    color: 'bg-purple-500',
  },
  1: {
    label: 'Anchors',
    description: 'Lock 4-5 names whose presence makes every subsequent invitation a yes',
    timeline: 'Weeks 1-2',
    color: 'bg-blue-500',
  },
  2: {
    label: 'Demand Signal',
    description: 'Use anchor names to pull in hyperscalers, data center operators, and grid operators',
    timeline: 'Weeks 2-3',
    color: 'bg-green-500',
  },
  3: {
    label: 'Civic + Infrastructure + International',
    description: 'Fill Panels 3, 2.5, and 4 with the speakers who make the Watershed seed inevitable',
    timeline: 'Weeks 3-4',
    color: 'bg-amber-500',
  },
  4: {
    label: 'Final Seats + Alternates',
    description: 'Fill remaining seats and confirm alternates',
    timeline: 'Weeks 4-5',
    color: 'bg-red-500',
  },
};

const STATUS_CONFIG: Record<InvitationStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  not_started: { label: 'Not Started', color: 'bg-gray-100 text-gray-600', icon: Clock },
  pre_warming: { label: 'Pre-warming', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  draft_pending: { label: 'Draft Pending', color: 'bg-orange-100 text-orange-700', icon: FileText },
  draft_ready: { label: 'Draft Ready', color: 'bg-orange-100 text-orange-700', icon: FileText },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700', icon: Check },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-700', icon: Check },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-600', icon: XCircle },
  more_info: { label: 'More Info', color: 'bg-amber-100 text-amber-700', icon: MessageSquare },
  meeting_requested: { label: 'Meeting Req.', color: 'bg-purple-100 text-purple-700', icon: MessageSquare },
  follow_up_draft: { label: 'Follow-up Draft', color: 'bg-orange-100 text-orange-700', icon: FileText },
  follow_up_sent: { label: 'Follow-up Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
};

const OWNER_COLORS: Record<string, string> = {
  trent: 'text-blue-600',
  jamie: 'text-purple-600',
  drew: 'text-green-600',
};

function StatusBadge({ status }: { status: InvitationStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function StatsBar() {
  const { invitees } = useSequencingStore();

  const stats = useMemo(() => {
    const confirmed = invitees.filter((i) => i.status === 'confirmed').length;
    const sent = invitees.filter(
      (i) => i.status === 'sent' || i.status === 'follow_up_sent'
    ).length;
    const awaiting = invitees.filter(
      (i) => i.status === 'more_info' || i.status === 'meeting_requested'
    ).length;
    const declined = invitees.filter((i) => i.status === 'declined').length;
    const queued = invitees.filter(
      (i) =>
        i.status === 'not_started' ||
        i.status === 'pre_warming' ||
        i.status === 'draft_pending' ||
        i.status === 'draft_ready' ||
        i.status === 'approved'
    ).length;
    return { confirmed, sent, awaiting, declined, queued, total: invitees.length };
  }, [invitees]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <StatCard label="Total" value={stats.total} color="text-gray-900" bg="bg-gray-50" />
      <StatCard label="Confirmed" value={stats.confirmed} color="text-green-700" bg="bg-green-50" />
      <StatCard label="Sent" value={stats.sent} color="text-blue-700" bg="bg-blue-50" />
      <StatCard label="Awaiting" value={stats.awaiting} color="text-amber-700" bg="bg-amber-50" />
      <StatCard label="Declined" value={stats.declined} color="text-red-600" bg="bg-red-50" />
      <StatCard label="Queued" value={stats.queued} color="text-gray-600" bg="bg-gray-50" />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={cn('rounded-lg p-3 border border-gray-200', bg)}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

function PhaseSection({
  phase,
  onSelectInvitee,
}: {
  phase: InvitationPhase;
  onSelectInvitee: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(phase <= 2);
  const { getInviteesByPhase, getPhaseProgress, getDependenciesMet, setShowDraftComposer } =
    useSequencingStore();
  const { user } = useAuthStore();

  const meta = PHASE_META[phase];
  const invitees = getInviteesByPhase(phase);
  const progress = getPhaseProgress(phase);

  const progressPercent =
    progress.total > 0 ? Math.round((progress.confirmed / progress.total) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-lg bg-white mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className={cn('w-2 h-2 rounded-full', meta.color)} />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">
              Phase {phase}: {meta.label}
            </h3>
            <p className="text-xs text-gray-500">{meta.timeline} — {meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', meta.color)}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-12 text-right">
              {progress.confirmed}/{progress.total}
            </span>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100">
          <div className="divide-y divide-gray-50">
            {invitees.map((invitee) => {
              const depsMet = getDependenciesMet(invitee.id);
              const canExecute = canExecuteForInvitee(user?.email, user?.role || 'admin', invitee.invitedBy);
              const isOwn = isOwnInvitee(user?.email, invitee.invitedBy);
              return (
                <InviteeRow
                  key={invitee.id}
                  invitee={invitee}
                  depsMet={depsMet}
                  canExecute={canExecute}
                  isOwn={isOwn}
                  onSelect={() => onSelectInvitee(invitee.id)}
                  onDraft={() => setShowDraftComposer(true, invitee.id)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InviteeRow({
  invitee,
  depsMet,
  canExecute,
  isOwn,
  onSelect,
  onDraft,
}: {
  invitee: Invitee;
  depsMet: boolean;
  canExecute: boolean;
  isOwn: boolean;
  onSelect: () => void;
  onDraft: () => void;
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group',
      isOwn && 'bg-watershed-50/30'
    )}>
      {/* Dependency indicator */}
      <div className="w-5 flex justify-center shrink-0">
        {invitee.dependencies.length > 0 ? (
          depsMet ? (
            <Unlock className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-gray-300" />
          )
        ) : (
          <div className="w-3.5" />
        )}
      </div>

      {/* Phase order */}
      <span className="text-[11px] font-mono text-gray-400 w-8 shrink-0">
        {invitee.phaseOrder}
      </span>

      {/* Name + org */}
      <button
        onClick={onSelect}
        className="flex-1 text-left min-w-0"
      >
        <span className={cn(
          'text-sm font-medium hover:text-watershed-600 transition-colors',
          isOwn ? 'text-gray-900' : 'text-gray-500'
        )}>
          {invitee.name}
        </span>
        <span className="text-xs text-gray-500 ml-2">{invitee.organization}</span>
      </button>

      {/* Panel */}
      <span className="text-[11px] text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded shrink-0">
        P{invitee.panel}
      </span>

      {/* Network owner */}
      <span className={cn('text-[11px] font-medium capitalize shrink-0 w-12', OWNER_COLORS[invitee.invitedBy])}>
        {invitee.invitedBy}
      </span>

      {/* Status */}
      <div className="shrink-0">
        <StatusBadge status={invitee.status} />
      </div>

      {/* Actions — only show draft button if user can execute for this invitee */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        {canExecute && (invitee.status === 'not_started' || invitee.status === 'pre_warming') && depsMet && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDraft();
            }}
            className="p-1 rounded hover:bg-watershed-50 text-watershed-600"
            title="Generate draft"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="p-1 rounded hover:bg-gray-100 text-gray-400"
          title="View details"
        >
          <User className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Panel definitions — panels are the actual session structure (different from phases)
const PANELS: { id: string; title: string; subtitle: string }[] = [
  { id: '1', title: 'Panel 1', subtitle: 'State Policy & the NASEO Accelerator' },
  { id: '2', title: 'Panel 2', subtitle: 'Demand Signal: Hyperscalers & Grid' },
  { id: '2.5', title: 'Panel 2.5', subtitle: 'Infrastructure: Compute, Power & Fiber' },
  { id: '3', title: 'Panel 3', subtitle: 'Civic Frameworks & Community Benefit' },
  { id: '4', title: 'Panel 4', subtitle: 'International & Design Innovation' },
  { id: '5', title: 'Panel 5', subtitle: 'Capital, Grid & Equity (Closing)' },
];

function PanelStatusBlock() {
  const { invitees } = useSequencingStore();

  const panelData = useMemo(() => {
    return PANELS.map((panel) => {
      const members = invitees.filter((i) => i.panel === panel.id);
      const confirmed = members.filter((i) => i.status === 'confirmed').length;
      const sent = members.filter(
        (i) => i.status === 'sent' || i.status === 'follow_up_sent'
      ).length;
      const inProgress = members.filter(
        (i) =>
          i.status === 'pre_warming' ||
          i.status === 'draft_pending' ||
          i.status === 'draft_ready' ||
          i.status === 'approved' ||
          i.status === 'more_info' ||
          i.status === 'meeting_requested' ||
          i.status === 'follow_up_draft'
      ).length;
      const declined = members.filter((i) => i.status === 'declined').length;
      const notStarted = members.filter((i) => i.status === 'not_started').length;
      const total = members.length;
      const fillPercent = total > 0 ? Math.round((confirmed / total) * 100) : 0;

      return { ...panel, members, confirmed, sent, inProgress, declined, notStarted, total, fillPercent };
    });
  }, [invitees]);

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Panel Composition</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {panelData.map((panel) => (
          <div
            key={panel.id}
            className="bg-white rounded-lg border border-gray-200 p-3 relative overflow-hidden"
          >
            {/* Background fill indicator */}
            <div
              className="absolute inset-0 bg-green-50 transition-all duration-500"
              style={{ width: `${panel.fillPercent}%` }}
            />
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-900">{panel.title}</span>
                <span className="text-[10px] font-medium text-gray-500">
                  {panel.confirmed}/{panel.total}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2 leading-tight">{panel.subtitle}</p>

              {/* Stacked progress bar */}
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-2">
                {panel.confirmed > 0 && (
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${(panel.confirmed / panel.total) * 100}%` }}
                  />
                )}
                {panel.sent > 0 && (
                  <div
                    className="bg-blue-400 transition-all"
                    style={{ width: `${(panel.sent / panel.total) * 100}%` }}
                  />
                )}
                {panel.inProgress > 0 && (
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${(panel.inProgress / panel.total) * 100}%` }}
                  />
                )}
                {panel.declined > 0 && (
                  <div
                    className="bg-red-400 transition-all"
                    style={{ width: `${(panel.declined / panel.total) * 100}%` }}
                  />
                )}
              </div>

              {/* Member dots */}
              <div className="flex flex-wrap gap-1">
                {panel.members.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border',
                      m.status === 'confirmed'
                        ? 'bg-green-100 border-green-400 text-green-700'
                        : m.status === 'sent' || m.status === 'follow_up_sent'
                        ? 'bg-blue-100 border-blue-400 text-blue-700'
                        : m.status === 'declined'
                        ? 'bg-red-100 border-red-400 text-red-600'
                        : m.status === 'not_started'
                        ? 'bg-gray-50 border-gray-200 text-gray-400'
                        : 'bg-amber-100 border-amber-400 text-amber-700'
                    )}
                    title={`${m.name} — ${STATUS_CONFIG[m.status].label}`}
                  >
                    {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Confirmed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Sent</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> In Progress</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Declined</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" /> Not Started</span>
      </div>
    </div>
  );
}

function DependencyGraph() {
  const { invitees, getInvitee } = useSequencingStore();

  const inviteesWithDeps = invitees.filter((inv) => inv.dependencies.length > 0);

  return (
    <div className="space-y-3">
      {inviteesWithDeps.map((invitee) => (
        <div key={invitee.id} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={invitee.status} />
            <span className="text-sm font-medium text-gray-900">{invitee.name}</span>
            <span className="text-xs text-gray-500">({invitee.organization})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Depends on:</span>
            <div className="flex flex-wrap gap-1">
              {invitee.dependencies.map((depId) => {
                const dep = getInvitee(depId);
                if (!dep) return null;
                const isConfirmed = dep.status === 'confirmed';
                return (
                  <span
                    key={depId}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                      isConfirmed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {isConfirmed ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    {dep.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApiKeySettings({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('sequencing_anthropic_key') || ''
  );
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('sequencing_anthropic_key', apiKey.trim());
    } else {
      localStorage.removeItem('sequencing_anthropic_key');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">AI Settings</h3>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
          Close
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Anthropic API Key
          </label>
          <p className="text-[11px] text-gray-400 mb-2">
            Used for AI-generated invitation drafts and response classification. Your key is stored locally in this browser only.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-watershed-500 focus:border-watershed-500"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 transition-colors"
            >
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SequencingPage() {
  const [activeTab, setActiveTab] = useState<TabView>('invitations');
  const [showSettings, setShowSettings] = useState(false);
  const {
    selectedInviteeId,
    setSelectedInviteeId,
    showDraftComposer,
    setShowDraftComposer,
    draftComposerInviteeId,
    getPendingActions,
  } = useSequencingStore();

  const pendingCount = getPendingActions().length;

  const tabs: { id: TabView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'invitations', label: 'Invitations', icon: Users },
    { id: 'dependencies', label: 'Dependencies', icon: Network },
    { id: 'automations', label: 'Automations', icon: Zap },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <GitBranch className="w-6 h-6 text-watershed-600" />
              <h1 className="text-2xl font-bold text-gray-900">Sequencing</h1>
            </div>
            <p className="text-sm text-gray-500">
              CERA Week 2026 Invitation Cascade — Track invitations, dependencies, and automations
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showSettings ? 'bg-watershed-50 text-watershed-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            )}
            title="AI Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* API Key Settings */}
      {showSettings && <ApiKeySettings onClose={() => setShowSettings(false)} />}

      {/* Stats */}
      <StatsBar />

      {/* Panel Status */}
      <PanelStatusBlock />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-watershed-500 text-watershed-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'automations' && pendingCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'invitations' && (
        <div>
          {([0, 1, 2, 3, 4] as InvitationPhase[]).map((phase) => (
            <PhaseSection
              key={phase}
              phase={phase}
              onSelectInvitee={(id) => setSelectedInviteeId(id)}
            />
          ))}
        </div>
      )}

      {activeTab === 'dependencies' && <DependencyGraph />}

      {activeTab === 'automations' && <ResponseTracker />}

      {/* Invitee Detail slide-over */}
      {selectedInviteeId && (
        <InviteeDetail
          inviteeId={selectedInviteeId}
          onClose={() => setSelectedInviteeId(null)}
          onDraft={(id) => setShowDraftComposer(true, id)}
        />
      )}

      {/* Draft Composer modal */}
      {showDraftComposer && draftComposerInviteeId && (
        <DraftComposer
          inviteeId={draftComposerInviteeId}
          onClose={() => setShowDraftComposer(false)}
        />
      )}
    </div>
  );
}
