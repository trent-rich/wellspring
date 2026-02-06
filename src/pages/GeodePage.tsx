import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  FileText,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  ExternalLink,
  ChevronRight,
  Bell,
  Sparkles,
  DollarSign,
  Target,
} from 'lucide-react';
import { useGeodeStore } from '../store/geodeStore';
import type {
  GeodeReport,
  GeodeDeadline,
  GeodeOverdueItem,
} from '../types/geode';
import {
  GEODE_STATES,
  GEODE_DEADLINE,
  GEODE_ROLES,
  GEODE_GOOGLE_DRIVE_FOLDER,
} from '../types/geode';
import { cn } from '../lib/utils';

// ============================================
// SUB-COMPONENTS
// ============================================

interface KPITileProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  onClick?: () => void;
  alert?: boolean;
  success?: boolean;
}

function KPITile({ icon, value, label, onClick, alert, success }: KPITileProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'kpi-tile text-left transition-all hover:shadow-md',
        alert && 'border-red-300 bg-red-50',
        success && 'border-green-300 bg-green-50'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <p className="text-sm text-gray-600">{label}</p>
    </button>
  );
}

interface StateCardProps {
  report: GeodeReport;
  onClick: () => void;
}

function StateCard({ report, onClick }: StateCardProps) {
  const stateInfo = GEODE_STATES.find((s) => s.value === report.state);
  const progressColor =
    report.overall_progress_percent >= 75
      ? 'bg-green-500'
      : report.overall_progress_percent >= 50
      ? 'bg-yellow-500'
      : report.overall_progress_percent >= 25
      ? 'bg-orange-500'
      : 'bg-red-500';

  const statusLabel = report.status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-watershed-600" />
          <span className="font-semibold text-lg">{stateInfo?.label || report.state}</span>
          <span className="text-xs text-gray-400 font-mono">{stateInfo?.abbreviation}</span>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-watershed-600 transition-colors" />
      </div>

      <div className="space-y-3">
        {/* Status badge */}
        <span
          className={cn(
            'inline-block px-2 py-0.5 text-xs font-medium rounded-full',
            report.status === 'published' && 'bg-green-100 text-green-800',
            report.status === 'not_started' && 'bg-gray-100 text-gray-800',
            ['research', 'drafting'].includes(report.status) && 'bg-blue-100 text-blue-800',
            ['internal_review', 'peer_review', 'editing'].includes(report.status) &&
              'bg-purple-100 text-purple-800',
            ['design', 'final_review'].includes(report.status) && 'bg-amber-100 text-amber-800'
          )}
        >
          {statusLabel}
        </span>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{report.overall_progress_percent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', progressColor)}
              style={{ width: `${report.overall_progress_percent}%` }}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Sections</span>
          <span className="font-medium">
            {report.sections_complete}/{report.sections_total}
          </span>
        </div>
      </div>
    </button>
  );
}

interface DeadlineItemProps {
  deadline: GeodeDeadline;
  onClick?: () => void;
}

function DeadlineItem({ deadline, onClick }: DeadlineItemProps) {
  const isUrgent = deadline.days_until <= 3;
  const isNear = deadline.days_until <= 7;

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left w-full"
    >
      <div className="flex items-center space-x-3">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isUrgent ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-blue-500'
          )}
        />
        <div>
          <p className="text-sm font-medium text-gray-900">{deadline.title}</p>
          <p className="text-xs text-gray-500">
            {deadline.stakeholder_name || 'Unassigned'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'text-sm font-medium',
            isUrgent ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-gray-600'
          )}
        >
          {deadline.days_until} day{deadline.days_until !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-gray-400">
          {new Date(deadline.due_date).toLocaleDateString()}
        </p>
      </div>
    </button>
  );
}

interface OverdueItemRowProps {
  item: GeodeOverdueItem;
  onClick?: () => void;
}

function OverdueItemRow({ item, onClick }: OverdueItemRowProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-left w-full border border-red-200"
    >
      <div className="flex items-center space-x-3">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <div>
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="text-xs text-gray-500">{item.stakeholder_name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-red-600">
          {item.days_overdue} day{item.days_overdue !== 1 ? 's' : ''} overdue
        </p>
        {item.last_nudge_at && (
          <p className="text-xs text-gray-400">
            Last nudge: {new Date(item.last_nudge_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function GeodePage() {
  const navigate = useNavigate();
  const {
    reports,
    kpis,
    isLoading,
    error,
    fetchReports,
    fetchStakeholders,
    fetchDashboardKPIs,
    getUpcomingDeadlines,
    getOverdueItems,
    getBlockers,
    subscribeToChanges,
  } = useGeodeStore();

  const [upcomingDeadlines, setUpcomingDeadlines] = useState<GeodeDeadline[]>([]);
  const [overdueItems, setOverdueItems] = useState<GeodeOverdueItem[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);

  // Initial data fetch
  useEffect(() => {
    fetchReports();
    fetchStakeholders();
    fetchDashboardKPIs();

    const unsubscribe = subscribeToChanges();
    return () => unsubscribe();
  }, []);

  // Update derived data when store changes
  useEffect(() => {
    setUpcomingDeadlines(getUpcomingDeadlines(14));
    setOverdueItems(getOverdueItems());
    setBlockers(getBlockers());
  }, [reports, getUpcomingDeadlines, getOverdueItems, getBlockers]);

  // Calculate days until deadline
  const daysUntilDeadline = Math.ceil(
    (GEODE_DEADLINE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (isLoading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-watershed-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GEODE State Reports</h1>
          <p className="text-gray-500 mt-1">DOE-funded geothermal assessments</p>
        </div>
        <div className="flex items-center space-x-3">
          <a
            href={GEODE_GOOGLE_DRIVE_FOLDER}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Google Drive</span>
          </a>
          <div className="px-4 py-2 bg-watershed-50 rounded-lg border border-watershed-200">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-watershed-600" />
              <span className="text-sm font-medium text-watershed-800">
                {daysUntilDeadline} days until deadline
              </span>
            </div>
            <p className="text-xs text-watershed-600 mt-0.5">April 30, 2026</p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPITile
          icon={<FileText className="w-5 h-5 text-watershed-600" />}
          value={kpis?.reports_total || 6}
          label="State Reports"
        />
        <KPITile
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          value={kpis?.reports_on_track || 0}
          label="On Track"
          success={kpis ? kpis.reports_on_track > 0 : undefined}
        />
        <KPITile
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          value={kpis?.reports_at_risk || 0}
          label="At Risk"
          alert={kpis ? kpis.reports_at_risk > 0 : undefined}
        />
        <KPITile
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          value={kpis?.deliverables_overdue || 0}
          label="Overdue"
          alert={kpis ? kpis.deliverables_overdue > 0 : undefined}
        />
        <KPITile
          icon={<Users className="w-5 h-5 text-purple-600" />}
          value={kpis?.stakeholders_active || 0}
          label="Active Contributors"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* State Reports Grid - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Report Progress</h2>
            <span className="text-sm text-gray-500">
              {kpis?.sections_complete || 0}/{kpis?.sections_total || 0} sections complete
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {GEODE_STATES.map((state) => {
              const report = reports.find((r) => r.state === state.value);
              if (report) {
                return (
                  <StateCard
                    key={state.value}
                    report={report}
                    onClick={() => navigate(`/geode/reports/${report.id}`)}
                  />
                );
              }
              // Placeholder for reports not yet created
              return (
                <div
                  key={state.value}
                  className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-4 flex flex-col items-center justify-center min-h-[140px]"
                >
                  <MapPin className="w-6 h-6 text-gray-400 mb-2" />
                  <span className="font-medium text-gray-600">{state.label}</span>
                  <span className="text-xs text-gray-400 mt-1">Not started</span>
                </div>
              );
            })}
          </div>

          {/* AI Drafts Section */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 p-4 mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">Deep Research AI Drafts</h3>
              </div>
              <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                New workflow
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              AI generates first drafts, then Maria assigns to ghost writers for revision.
            </p>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-gray-600">AI generates draft</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-600">Maria assigns writer</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-600">Ghost writer revises</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Deadlines & Alerts */}
        <div className="space-y-6">
          {/* Blockers Alert */}
          {blockers.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-red-800">
                  {blockers.length} Active Blocker{blockers.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="space-y-2">
                {blockers.slice(0, 3).map((blocker, i) => (
                  <p key={i} className="text-sm text-red-700 line-clamp-2">
                    {blocker}
                  </p>
                ))}
                {blockers.length > 3 && (
                  <p className="text-xs text-red-600">
                    +{blockers.length - 3} more blockers
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Overdue Items */}
          {overdueItems.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Overdue Items</h3>
                <Bell className="w-4 h-4 text-red-500" />
              </div>
              <div className="space-y-2">
                {overdueItems.slice(0, 5).map((item) => (
                  <OverdueItemRow key={item.id} item={item} />
                ))}
                {overdueItems.length > 5 && (
                  <p className="text-sm text-gray-500 text-center pt-2">
                    +{overdueItems.length - 5} more overdue
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Upcoming Deadlines</h3>
              <Calendar className="w-4 h-4 text-gray-400" />
            </div>
            {upcomingDeadlines.length > 0 ? (
              <div className="space-y-2">
                {upcomingDeadlines.slice(0, 6).map((deadline) => (
                  <DeadlineItem key={deadline.id} deadline={deadline} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No upcoming deadlines in the next 2 weeks
              </p>
            )}
          </div>

          {/* Stakeholder Roles */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Team Roles</h3>
            <div className="space-y-2">
              {GEODE_ROLES.slice(0, 6).map((role) => (
                <div key={role.value} className="flex items-center space-x-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      role.color === 'blue' && 'bg-blue-500',
                      role.color === 'purple' && 'bg-purple-500',
                      role.color === 'green' && 'bg-green-500',
                      role.color === 'indigo' && 'bg-indigo-500',
                      role.color === 'amber' && 'bg-amber-500',
                      role.color === 'red' && 'bg-red-500',
                      role.color === 'teal' && 'bg-teal-500',
                      role.color === 'pink' && 'bg-pink-500',
                      role.color === 'gray' && 'bg-gray-500'
                    )}
                  />
                  <span className="text-sm text-gray-600">{role.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <DollarSign className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Financials</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Contract Value</span>
                <span className="font-medium">
                  ${reports.reduce((sum, r) => sum + r.total_contract_value, 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Paid to Date</span>
                <span className="font-medium text-green-600">
                  ${reports.reduce((sum, r) => sum + r.amount_paid, 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-amber-600">
                  ${reports.reduce((sum, r) => sum + r.amount_pending, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Types Legend */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Content Sections per Report</h3>
        <div className="flex flex-wrap gap-2">
          {[
            'Executive Summary',
            'Heat Resources',
            'Direct Use',
            'Economics',
            'Policy',
            'Stakeholders',
            'Environment',
            'Subsurface',
            'Recommendations',
          ].map((section) => (
            <span
              key={section}
              className="px-3 py-1 text-xs font-medium bg-white border border-gray-200 rounded-full text-gray-600"
            >
              {section}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
