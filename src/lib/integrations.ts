// Integration Services Initialization
// Handles setup for Monday.com and Slack integrations

import { initializeMondayService, getMondayService, type MondayConfig } from './mondayService';
import { initializeSlackService, getSlackService, type SlackConfig } from './slackService';

// ============================================
// CONFIGURATION FROM ENVIRONMENT
// ============================================

interface IntegrationsConfig {
  monday: MondayConfig | null;
  slack: SlackConfig | null;
}

function getIntegrationsConfig(): IntegrationsConfig {
  const mondayToken = import.meta.env.VITE_MONDAY_API_TOKEN;
  const mondayBoardId = import.meta.env.VITE_MONDAY_GEODE_BOARD_ID;

  const slackToken = import.meta.env.VITE_SLACK_BOT_TOKEN;
  const slackSecret = import.meta.env.VITE_SLACK_SIGNING_SECRET;
  const slackChannel = import.meta.env.VITE_SLACK_DEFAULT_CHANNEL_ID;

  return {
    monday: mondayToken && mondayBoardId ? {
      apiToken: mondayToken,
      workspaceId: 'projectinnerspace', // From your Monday.com URL
      geodeBoardId: mondayBoardId,
    } : null,
    slack: slackToken && slackSecret ? {
      botToken: slackToken,
      signingSecret: slackSecret,
      defaultChannelId: slackChannel || '',
      mariaUserId: '', // Will be configured in settings
    } : null,
  };
}

// ============================================
// INITIALIZATION
// ============================================

let initialized = false;

export interface IntegrationStatus {
  monday: {
    enabled: boolean;
    connected: boolean;
    geodeBoardId?: string;
    paymentsBoardId?: string;
  };
  slack: {
    enabled: boolean;
    connected: boolean;
    channelId?: string;
  };
}

export async function initializeIntegrations(): Promise<IntegrationStatus> {
  if (initialized) {
    return getIntegrationStatus();
  }

  const config = getIntegrationsConfig();
  const status: IntegrationStatus = {
    monday: { enabled: false, connected: false },
    slack: { enabled: false, connected: false },
  };

  // Initialize Monday.com
  if (config.monday) {
    try {
      const mondayService = initializeMondayService(config.monday);
      const connected = await mondayService.testConnection();
      status.monday = {
        enabled: true,
        connected,
        geodeBoardId: config.monday.geodeBoardId,
        paymentsBoardId: import.meta.env.VITE_MONDAY_PAYMENTS_BOARD_ID,
      };
      console.log('[Integrations] Monday.com:', connected ? 'Connected' : 'Failed to connect');
      console.log('[Integrations] Monday.com boards - GEODE:', config.monday.geodeBoardId, '| Payments:', import.meta.env.VITE_MONDAY_PAYMENTS_BOARD_ID);
    } catch (error) {
      console.error('[Integrations] Monday.com initialization error:', error);
      status.monday = { enabled: true, connected: false };
    }
  } else {
    console.log('[Integrations] Monday.com: Not configured');
  }

  // Initialize Slack
  if (config.slack) {
    try {
      const slackService = initializeSlackService(config.slack);
      const connected = await slackService.testConnection();
      status.slack = {
        enabled: true,
        connected,
        channelId: config.slack.defaultChannelId,
      };
      console.log('[Integrations] Slack:', connected ? 'Connected' : 'Failed to connect');
    } catch (error) {
      console.error('[Integrations] Slack initialization error:', error);
      status.slack = { enabled: true, connected: false };
    }
  } else {
    console.log('[Integrations] Slack: Not configured');
  }

  initialized = true;
  return status;
}

// ============================================
// STATUS HELPERS
// ============================================

export function getIntegrationStatus(): IntegrationStatus {
  const mondayService = getMondayService();
  const slackService = getSlackService();

  return {
    monday: {
      enabled: mondayService !== null,
      connected: mondayService !== null,
      geodeBoardId: import.meta.env.VITE_MONDAY_GEODE_BOARD_ID,
      paymentsBoardId: import.meta.env.VITE_MONDAY_PAYMENTS_BOARD_ID,
    },
    slack: {
      enabled: slackService !== null,
      connected: slackService !== null,
      channelId: import.meta.env.VITE_SLACK_DEFAULT_CHANNEL_ID,
    },
  };
}

export function isIntegrationReady(integration: 'monday' | 'slack'): boolean {
  if (integration === 'monday') {
    return getMondayService() !== null;
  }
  return getSlackService() !== null;
}

// ============================================
// RE-EXPORT SERVICES FOR CONVENIENCE
// ============================================

export { getMondayService, getSlackService };
