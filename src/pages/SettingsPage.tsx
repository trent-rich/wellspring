import { useState, useEffect, useRef } from 'react';
import {
  User,
  Bell,
  Calendar,
  Shield,
  Save,
  RefreshCw,
  Check,
  X,
  Bot,
  Play,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUserStateStore } from '../store/userStateStore';
import { useCalendarStore } from '../store/calendarStore';
import type { InterruptPolicy } from '../types';
import { cn } from '../lib/utils';
import {
  isGoogleConnected,
  disconnectGoogle,
  fetchGoogleCalendarEvents,
  convertGoogleEvent,
} from '../lib/googleCalendar';
import {
  processEmails,
  isRalphReady,
  getRalphStats,
  clearRalphData,
} from '../lib/emailProcessor';
import {
  getIntegrationStatus,
  getMondayService,
  getSlackService,
  type IntegrationStatus,
} from '../lib/integrations';
import {
  getActionProviders,
  setProviderForAction,
  resetToDefaultProviders,
  getAvailableProviders,
  getAvailableActions,
  isAIConfigured,
  type AIProvider,
  type AIAction,
  type ActionProviderConfig,
} from '../lib/aiService';

export default function SettingsPage() {
  const { user, updateProfile, signInWithGoogle: ssoSignIn } = useAuthStore();
  const { policy, updatePolicy } = useUserStateStore();
  const { syncEvent } = useCalendarStore();

  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'integrations' | 'policies'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Ralph AI state
  const [ralphStats, setRalphStats] = useState(getRalphStats());
  const [isRalphSyncing, setIsRalphSyncing] = useState(false);
  const [ralphSyncStatus, setRalphSyncStatus] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => {
    return localStorage.getItem('ralph_auto_sync') === 'true';
  });
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Integration status state
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(getIntegrationStatus());
  const [isMondayTesting, setIsMondayTesting] = useState(false);
  const [isSlackTesting, setIsSlackTesting] = useState(false);

  // AI Provider state - per-action configuration
  const [actionProviders, setActionProvidersState] = useState<ActionProviderConfig>(getActionProviders());
  const availableProviders = getAvailableProviders();
  const availableActions = getAvailableActions();

  // Profile form state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [cellAffiliation, setCellAffiliation] = useState(user?.cell_affiliation || '');

  // Policy form state
  const [policyForm, setPolicyForm] = useState<Partial<InterruptPolicy>>({});

  useEffect(() => {
    if (policy) {
      setPolicyForm(policy);
    }
  }, [policy]);

  // Auto-sync effect for Ralph AI
  useEffect(() => {
    const runAutoSync = async () => {
      const { ready } = isRalphReady();
      if (!ready || isRalphSyncing) return;

      setIsRalphSyncing(true);
      try {
        const result = await processEmails();
        if (result.success && result.tasksCreated > 0) {
          setRalphSyncStatus(`Auto-synced: ${result.tasksCreated} task(s) created`);
        }
        setRalphStats(getRalphStats());
      } catch {
        // Silently fail on auto-sync
      } finally {
        setIsRalphSyncing(false);
      }
    };

    if (autoSyncEnabled) {
      // Run immediately on enable
      runAutoSync();
      // Then every 15 minutes
      autoSyncIntervalRef.current = setInterval(runAutoSync, 15 * 60 * 1000);
    }

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, [autoSyncEnabled, isRalphSyncing]);

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    localStorage.setItem('ralph_auto_sync', enabled ? 'true' : 'false');
  };

  const handleActionProviderChange = (action: AIAction, provider: AIProvider) => {
    setProviderForAction(action, provider);
    setActionProvidersState(getActionProviders());
  };

  const handleResetToDefaults = () => {
    resetToDefaultProviders();
    setActionProvidersState(getActionProviders());
  };

  const handleManualRalphSync = async () => {
    setIsRalphSyncing(true);
    setRalphSyncStatus('Processing emails...');

    const result = await processEmails((status, _progress) => {
      setRalphSyncStatus(status);
    });

    if (result.success) {
      setRalphSyncStatus(`Processed ${result.emailsProcessed} emails, created ${result.tasksCreated} tasks`);
    } else {
      setRalphSyncStatus(`Error: ${result.errors.join(', ')}`);
    }

    setRalphStats(getRalphStats());
    setIsRalphSyncing(false);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        full_name: fullName || null,
        cell_affiliation: cellAffiliation || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePolicy = async () => {
    setIsSaving(true);
    try {
      await updatePolicy(policyForm);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'integrations', label: 'Integrations', icon: Calendar },
    { key: 'policies', label: 'Policies', icon: Shield },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-watershed-500 text-watershed-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="input bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cell Affiliation
              </label>
              <select
                value={cellAffiliation}
                onChange={(e) => setCellAffiliation(e.target.value)}
                className="select"
              >
                <option value="">None</option>
                <option value="cell_1">Cell 1 - Thermal Commons</option>
                <option value="cell_2">Cell 2 - Political/Jurisdictional</option>
                <option value="cell_3">Cell 3 - Engineering</option>
                <option value="cell_4">Cell 4 - Narrative/Cultural</option>
                <option value="cell_5">Cell 5 - Legal/Ethical</option>
              </select>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Profile
            </button>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Suppress in Focus Mode</p>
                <p className="text-sm text-gray-500">
                  Silence non-urgent notifications during focus
                </p>
              </div>
              <button
                onClick={() =>
                  setPolicyForm({
                    ...policyForm,
                    suppress_interrupts_in_focus: !policyForm.suppress_interrupts_in_focus,
                  })
                }
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  policyForm.suppress_interrupts_in_focus ? 'bg-watershed-500' : 'bg-gray-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    policyForm.suppress_interrupts_in_focus ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Interrupt Lead Time (minutes)
              </label>
              <input
                type="number"
                value={policyForm.meeting_interrupt_minutes || 5}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    meeting_interrupt_minutes: Number(e.target.value),
                  })
                }
                className="input w-32"
                min={1}
                max={30}
              />
              <p className="text-sm text-gray-500 mt-1">
                How early to show meeting reminders
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Judgment Request Budget
              </label>
              <input
                type="number"
                value={policyForm.judgment_request_budget || 5}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    judgment_request_budget: Number(e.target.value),
                  })
                }
                className="input w-32"
                min={1}
                max={20}
              />
              <p className="text-sm text-gray-500 mt-1">
                Max concurrent judgment requests before throttling
              </p>
            </div>

            <button
              onClick={handleSavePolicy}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Notification Settings
            </button>
          </div>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Google Integration */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Google Integration</h2>
              {googleConnected ? (
                <span className="flex items-center text-sm text-green-600">
                  <Check className="w-4 h-4 mr-1" />
                  Connected
                </span>
              ) : (
                <span className="text-sm text-amber-600">Not Connected</span>
              )}
            </div>
            <p className="text-gray-500 mb-4">
              Connect Google to sync Calendar events, process Gmail for task extraction, and enable meeting mode.
            </p>
            {syncStatus && (
              <p className={cn(
                "text-sm mb-4",
                syncStatus.includes('Error') ? 'text-red-600' : 'text-green-600'
              )}>
                {syncStatus}
              </p>
            )}
            <div className="flex gap-3">
              {!googleConnected ? (
                <button
                  onClick={async () => {
                    try {
                      setSyncStatus(null);
                      setSyncStatus('Redirecting to Google sign-in...');
                      await ssoSignIn();
                      // Browser will redirect — token is captured on return via onAuthStateChange
                    } catch (error) {
                      console.error('[Settings] Google connect error:', error);
                      setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Failed to connect'}`);
                    }
                  }}
                  className="btn btn-primary"
                >
                  Connect Google
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      if (!user) return;
                      setIsSyncing(true);
                      setSyncStatus('Syncing calendar...');
                      try {
                        const now = new Date();
                        const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
                        const events = await fetchGoogleCalendarEvents(now, twoWeeksLater);

                        let synced = 0;
                        for (const event of events) {
                          const converted = convertGoogleEvent(event, user.id);
                          await syncEvent(converted);
                          synced++;
                        }
                        setSyncStatus(`Synced ${synced} calendar events`);
                      } catch (error) {
                        setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Sync failed'}`);
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    disabled={isSyncing}
                    className="btn btn-secondary"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Calendar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      disconnectGoogle();
                      setGoogleConnected(false);
                      setSyncStatus(null);
                    }}
                    className="btn btn-secondary text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* AI Assistant (Ralph) */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  isAIConfigured() ? 'bg-purple-100' : 'bg-gray-100'
                )}>
                  <Bot className={cn(
                    'w-5 h-5',
                    isAIConfigured() ? 'text-purple-600' : 'text-gray-400'
                  )} />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Ralph AI Assistant</h2>
              </div>
              {isAIConfigured() ? (
                <span className="flex items-center text-sm text-green-600">
                  <Check className="w-4 h-4 mr-1" />
                  Connected
                </span>
              ) : (
                <span className="text-sm text-amber-600">Not Configured</span>
              )}
            </div>
            <p className="text-gray-500 mb-4">
              Powers Ralph AI for automatic email task extraction, prioritization, and artifact creation.
            </p>

            {/* AI Provider Selection - Per Action */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  AI Providers by Task
                </label>
                <button
                  onClick={handleResetToDefaults}
                  className="text-xs text-purple-600 hover:text-purple-700"
                >
                  Reset to defaults
                </button>
              </div>
              <div className="space-y-3">
                {availableActions.map((action) => (
                  <div key={action.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{action.name}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                    <div className="flex gap-1 ml-4">
                      {availableProviders.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => handleActionProviderChange(action.id, provider.id)}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                            actionProviders[action.id] === provider.id
                              ? 'bg-purple-500 text-white'
                              : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                          )}
                          title={provider.description}
                        >
                          {provider.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Each task type uses the AI best suited for it. Defaults: Claude for extraction &amp; artifacts, GPT-4 for prioritization, Gemini for voice.
              </p>
            </div>

            {isRalphReady().ready ? (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Last Sync</p>
                    <p className="font-semibold text-gray-900 text-sm">
                      {ralphStats.lastSync
                        ? new Date(ralphStats.lastSync).toLocaleTimeString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Emails Processed</p>
                    <p className="font-semibold text-gray-900">{ralphStats.totalEmailsProcessed}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Tasks Created</p>
                    <p className="font-semibold text-gray-900">{ralphStats.totalTasksCreated}</p>
                  </div>
                </div>

                {/* Status message */}
                {ralphSyncStatus && (
                  <p className={cn(
                    'text-sm mb-4',
                    ralphSyncStatus.includes('Error') ? 'text-red-600' : 'text-green-600'
                  )}>
                    {ralphSyncStatus}
                  </p>
                )}

                {/* Auto-sync toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
                  <div>
                    <p className="font-medium text-gray-900">Auto-Sync Emails</p>
                    <p className="text-sm text-gray-500">
                      Automatically process new emails every 15 minutes
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleAutoSync(!autoSyncEnabled)}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      autoSyncEnabled ? 'bg-purple-500' : 'bg-gray-300'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                        autoSyncEnabled ? 'translate-x-7' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleManualRalphSync}
                    disabled={isRalphSyncing}
                    className="btn btn-primary flex-1"
                  >
                    {isRalphSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Process Emails Now
                      </>
                    )}
                  </button>

                  {ralphStats.totalEmailsProcessed > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('Clear all Ralph AI sync data? This will reset the processed email history.')) {
                          clearRalphData();
                          setRalphStats(getRalphStats());
                          setRalphSyncStatus('Data cleared');
                        }
                      }}
                      className="btn btn-secondary"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear Data
                    </button>
                  )}
                </div>

                {/* Auto-sync status indicator */}
                {autoSyncEnabled && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-purple-600">
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                    Auto-sync active - checking every 15 minutes
                  </div>
                )}
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800 font-medium mb-1">Requirements:</p>
                <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                  {!googleConnected && <li>Connect Google (above)</li>}
                  {!isAIConfigured() && (
                    <li>Configure AI service in Supabase</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Monday.com Integration */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Monday Integration</h2>
              {integrationStatus.monday.connected ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  Connected
                </span>
              ) : integrationStatus.monday.enabled ? (
                <span className="text-sm text-amber-600">Configured</span>
              ) : (
                <span className="text-sm text-gray-400">Not Configured</span>
              )}
            </div>
            <p className="text-gray-500 mb-4">
              Sync GEODE Reports with Monday.com for bidirectional status updates.
            </p>

            {integrationStatus.monday.enabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={async () => {
                      setIsMondayTesting(true);
                      try {
                        const service = getMondayService();
                        if (service) {
                          const connected = await service.testConnection();
                          setIntegrationStatus(prev => ({
                            ...prev,
                            monday: { ...prev.monday, connected }
                          }));
                        }
                      } finally {
                        setIsMondayTesting(false);
                      }
                    }}
                    disabled={isMondayTesting}
                    className="btn btn-secondary"
                  >
                    {isMondayTesting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      'Test Connection'
                    )}
                  </button>
                </div>
                {integrationStatus.monday.connected && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    Syncing with GEODE boards
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  Monday.com integration requires environment variables. Contact admin to configure.
                </p>
              </div>
            )}
          </div>

          {/* Slack Integration */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Slack Integration</h2>
              {integrationStatus.slack.connected ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  Connected
                </span>
              ) : integrationStatus.slack.enabled ? (
                <span className="text-sm text-amber-600">Configured</span>
              ) : (
                <span className="text-sm text-gray-400">Not Configured</span>
              )}
            </div>
            <p className="text-gray-500 mb-4">
              Send GEODE notifications, nudges, and deadline reminders to Slack.
            </p>

            {integrationStatus.slack.enabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={async () => {
                      setIsSlackTesting(true);
                      try {
                        const service = getSlackService();
                        if (service) {
                          const connected = await service.testConnection();
                          setIntegrationStatus(prev => ({
                            ...prev,
                            slack: { ...prev.slack, connected }
                          }));
                        }
                      } finally {
                        setIsSlackTesting(false);
                      }
                    }}
                    disabled={isSlackTesting}
                    className="btn btn-secondary"
                  >
                    {isSlackTesting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      'Test Connection'
                    )}
                  </button>
                </div>
                {integrationStatus.slack.connected && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    Slack bot active and ready
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  Slack integration requires environment variables. Contact admin to configure.
                </p>
              </div>
            )}
          </div>

          {/* Clear Stale Data */}
          <div className="bg-white rounded-lg border border-red-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Clear Stale Data</h2>
            </div>
            <p className="text-gray-500 mb-4">
              Clear cached task data from this device. Use this if you see old/stale priority tasks that should have been cleared.
            </p>
            <button
              onClick={() => {
                // Clear the geode email store completely
                localStorage.removeItem('geode-email-store');
                // Force page reload to reinitialize
                window.location.reload();
              }}
              className="btn btn-secondary text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Stale Task Data
            </button>
          </div>
        </div>
      )}

      {/* Policies tab */}
      {activeTab === 'policies' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Workflow Policies</h2>

          <div className="space-y-6">
            {/* Meeting mode */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Meeting Mode</h3>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Auto-enter Meeting Mode</p>
                  <p className="text-sm text-gray-500">
                    Automatically enter meeting mode when calendar events start
                  </p>
                </div>
                <button
                  onClick={() =>
                    setPolicyForm({
                      ...policyForm,
                      auto_enter_meeting_mode: !policyForm.auto_enter_meeting_mode,
                    })
                  }
                  className={cn(
                    'w-12 h-6 rounded-full transition-colors relative',
                    policyForm.auto_enter_meeting_mode ? 'bg-watershed-500' : 'bg-gray-300'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                      policyForm.auto_enter_meeting_mode ? 'translate-x-7' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Embodied time */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Embodied Time</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Settle Buffer (minutes)
                </label>
                <input
                  type="number"
                  value={policyForm.embodied_default_settle_minutes || 30}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      embodied_default_settle_minutes: Number(e.target.value),
                    })
                  }
                  className="input w-32"
                  min={5}
                  max={120}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Time after embodied meetings for settling
                </p>
              </div>
            </div>

            {/* Meeting monitoring */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Meeting Monitoring</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Allow Meeting Monitoring</p>
                    <p className="text-sm text-gray-500">
                      Enable AI to process meeting transcripts (requires explicit opt-in per
                      meeting)
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPolicyForm({
                        ...policyForm,
                        allow_meeting_monitoring: !policyForm.allow_meeting_monitoring,
                      })
                    }
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      policyForm.allow_meeting_monitoring ? 'bg-watershed-500' : 'bg-gray-300'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                        policyForm.allow_meeting_monitoring ? 'translate-x-7' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retention Policy
                  </label>
                  <select
                    value={policyForm.retention_policy || 'summary_plus_actions'}
                    onChange={(e) =>
                      setPolicyForm({
                        ...policyForm,
                        retention_policy: e.target.value as InterruptPolicy['retention_policy'],
                      })
                    }
                    className="select"
                  >
                    <option value="summary_only">Summary Only</option>
                    <option value="summary_plus_actions">Summary + Action Items</option>
                    <option value="full_transcript">Full Transcript</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleSavePolicy}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Policies
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
