import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useTaskStore } from './store/taskStore';
import { useCalendarStore } from './store/calendarStore';
import { useUserStateStore } from './store/userStateStore';
import { useIdeaStore } from './store/ideaStore';
import { useMessageStore } from './store/messageStore';
import { initializeIntegrations } from './lib/integrations';

// Pages
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import TasksPage from './pages/TasksPage';
import IdeasPage from './pages/IdeasPage';
import CalendarPage from './pages/CalendarPage';
import SettingsPage from './pages/SettingsPage';
import GeodePage from './pages/GeodePage';
import GeodeMonitoringPage from './pages/GeodeMonitoringPage';
import JobsPage from './pages/JobsPage';

// Components
import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import StateOverlay from './components/StateOverlay';
import MeetingMode from './components/MeetingMode';
import LoadingScreen from './components/LoadingScreen';

function App() {
  const { user, isLoading: authLoading, initialize } = useAuthStore();
  const { fetchTasks, subscribeToTasks } = useTaskStore();
  const { fetchEvents, subscribeToEvents } = useCalendarStore();
  const { fetchState, fetchPolicy, subscribeToState } = useUserStateStore();
  const { fetchIdeas, subscribeToIdeas } = useIdeaStore();
  const { fetchMessagesForActor, subscribeToMessages } = useMessageStore();

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth and integrations on mount
  useEffect(() => {
    const init = async () => {
      await initialize();
      // Initialize Monday.com and Slack integrations
      const integrationStatus = await initializeIntegrations();
      console.log('[App] Integration status:', integrationStatus);
      setIsInitialized(true);
    };
    init();
  }, [initialize]);

  // Initialize data stores when user is authenticated
  useEffect(() => {
    if (!user) return;

    // Fetch initial data
    const initData = async () => {
      await Promise.all([
        fetchTasks(),
        fetchEvents(),
        fetchState(),
        fetchPolicy(),
        fetchIdeas(),
        fetchMessagesForActor(`person_${user.id}`),
      ]);
    };

    initData();

    // Set up realtime subscriptions
    const unsubTasks = subscribeToTasks();
    const unsubEvents = subscribeToEvents();
    const unsubState = subscribeToState();
    const unsubIdeas = subscribeToIdeas();
    const unsubMessages = subscribeToMessages(`person_${user.id}`);

    return () => {
      unsubTasks();
      unsubEvents();
      unsubState();
      unsubIdeas();
      unsubMessages();
    };
  }, [user]);

  // Show loading screen while initializing
  if (!isInitialized || authLoading) {
    return <LoadingScreen />;
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  return (
    <>
      {/* Command Palette - always available via Cmd+K */}
      <CommandPalette />

      {/* State overlay for protected states */}
      <StateOverlay />

      {/* Meeting mode panel */}
      <MeetingMode />

      {/* Main app routes */}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:taskId" element={<TasksPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="geode" element={<GeodeMonitoringPage />} />
          <Route path="geode/overview" element={<GeodePage />} />
          <Route path="geode/reports/:reportId" element={<GeodePage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default App;
