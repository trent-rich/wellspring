// Slack Integration Service for GEODE State Reports
// Handles notifications, nudges, and assignment workflows

import type {
  SlackChannel,
  SlackMessage,
  SlackBlock,
  GeodeNudge,
  GeodeNudgeType,
  GeodeStakeholder,
  GeodeAIDraft,
  GeodeSection,
  GeodeReport,
} from '../types/geode';
import { GEODE_GOOGLE_DRIVE_FOLDER } from '../types/geode';

// ============================================
// CONFIGURATION
// ============================================

// Use Supabase Edge Function as proxy to avoid CORS issues
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SLACK_PROXY_URL = `${SUPABASE_URL}/functions/v1/slack-proxy`;

interface SlackConfig {
  botToken: string;
  signingSecret: string;
  defaultChannelId: string;
  mariaUserId: string; // Maria's Slack user ID for assignment notifications
}

// ============================================
// SLACK API CLIENT
// ============================================

class SlackClient {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  private async apiCall<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    // Use Edge Function proxy to avoid CORS
    const response = await fetch(SLACK_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack proxy error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  // ============================================
  // MESSAGE OPERATIONS
  // ============================================

  async postMessage(message: SlackMessage): Promise<{ ts: string; channel: string }> {
    const result = await this.apiCall<{ ts: string; channel: string }>('chat.postMessage', {
      channel: message.channel_id,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments,
      thread_ts: message.thread_ts,
    });

    return { ts: result.ts, channel: result.channel };
  }

  async updateMessage(
    channelId: string,
    ts: string,
    message: Partial<SlackMessage>
  ): Promise<void> {
    await this.apiCall('chat.update', {
      channel: channelId,
      ts,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments,
    });
  }

  async deleteMessage(channelId: string, ts: string): Promise<void> {
    await this.apiCall('chat.delete', {
      channel: channelId,
      ts,
    });
  }

  // ============================================
  // DIRECT MESSAGE OPERATIONS
  // ============================================

  async openDirectMessage(userId: string): Promise<string> {
    const result = await this.apiCall<{ channel: { id: string } }>('conversations.open', {
      users: userId,
    });
    return result.channel.id;
  }

  async sendDirectMessage(userId: string, message: SlackMessage): Promise<{ ts: string; channel: string }> {
    const channelId = await this.openDirectMessage(userId);
    return this.postMessage({
      ...message,
      channel_id: channelId,
    });
  }

  // ============================================
  // USER OPERATIONS
  // ============================================

  async getUserInfo(userId: string): Promise<{
    id: string;
    name: string;
    real_name: string;
    email?: string;
  }> {
    const result = await this.apiCall<{ user: any }>('users.info', { user: userId });
    return {
      id: result.user.id,
      name: result.user.name,
      real_name: result.user.real_name,
      email: result.user.profile?.email,
    };
  }

  async lookupUserByEmail(email: string): Promise<string | null> {
    try {
      const result = await this.apiCall<{ user: { id: string } }>('users.lookupByEmail', {
        email,
      });
      return result.user.id;
    } catch {
      return null;
    }
  }

  // ============================================
  // CHANNEL OPERATIONS
  // ============================================

  async getChannelInfo(channelId: string): Promise<SlackChannel> {
    const result = await this.apiCall<{ channel: any }>('conversations.info', {
      channel: channelId,
    });
    return {
      id: result.channel.id,
      name: result.channel.name,
      is_private: result.channel.is_private,
      purpose: result.channel.purpose?.value || null,
    };
  }

  async listChannels(limit = 100): Promise<SlackChannel[]> {
    const result = await this.apiCall<{ channels: any[] }>('conversations.list', {
      limit,
      types: 'public_channel,private_channel',
    });
    return result.channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private,
      purpose: ch.purpose?.value || null,
    }));
  }
}

// ============================================
// GEODE SLACK SERVICE
// ============================================

export class GeodeSlackService {
  private client: SlackClient;
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.client = new SlackClient(config.botToken);
    this.config = config;
  }

  // ============================================
  // NUDGE NOTIFICATIONS
  // ============================================

  async sendNudge(
    nudge: GeodeNudge,
    stakeholder: GeodeStakeholder,
    section?: GeodeSection,
    report?: GeodeReport
  ): Promise<{ ts: string; channel: string }> {
    // Build the message blocks
    const blocks = this.buildNudgeBlocks(nudge, stakeholder, section, report);

    // Determine color based on priority
    const colorMap = { 1: '#FF0000', 2: '#FFA500', 3: '#36C5F0' };
    const color = colorMap[nudge.priority] || '#36C5F0';

    const message: SlackMessage = {
      channel_id: this.config.defaultChannelId,
      text: nudge.title,
      blocks,
      attachments: [
        {
          color,
          fallback: nudge.message,
          fields: [
            {
              title: 'Priority',
              value: nudge.priority === 1 ? 'Urgent' : nudge.priority === 2 ? 'Normal' : 'Low',
              short: true,
            },
            {
              title: 'Type',
              value: this.formatNudgeType(nudge.nudge_type),
              short: true,
            },
          ],
        },
      ],
    };

    // Send via DM if stakeholder has Slack ID
    if (stakeholder.slack_user_id) {
      return this.client.sendDirectMessage(stakeholder.slack_user_id, message);
    }

    // Otherwise post to default channel
    return this.client.postMessage(message);
  }

  private buildNudgeBlocks(
    nudge: GeodeNudge,
    _stakeholder: GeodeStakeholder,
    section?: GeodeSection,
    report?: GeodeReport
  ): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: nudge.title,
      },
    });

    // Main message
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: nudge.message,
      },
    });

    // Context about report/section
    if (report || section) {
      const contextElements: SlackBlock['elements'] = [];

      if (report) {
        contextElements?.push({
          type: 'mrkdwn',
          text: `*Report:* ${report.title} (${report.state.toUpperCase()})`,
        });
      }

      if (section) {
        contextElements?.push({
          type: 'mrkdwn',
          text: `*Section:* ${section.title}`,
        });
      }

      blocks.push({
        type: 'context',
        elements: contextElements,
      });
    }

    blocks.push({ type: 'divider' });

    // Action buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Acknowledge',
          },
          action_id: `nudge_acknowledge_${nudge.id}`,
          value: nudge.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View in Command Center',
          },
          action_id: `nudge_view_${nudge.id}`,
          url: `/geode/reports/${nudge.report_id}`,
        },
      ],
    });

    return blocks;
  }

  private formatNudgeType(type: GeodeNudgeType): string {
    const typeMap: Record<GeodeNudgeType, string> = {
      deadline_approaching: 'Deadline Approaching',
      deliverable_overdue: 'Overdue',
      review_requested: 'Review Requested',
      revision_needed: 'Revision Needed',
      approval_needed: 'Approval Needed',
      payment_pending: 'Payment Pending',
      milestone_reached: 'Milestone Reached',
      blocker_detected: 'Blocker Detected',
    };
    return typeMap[type] || type;
  }

  // ============================================
  // AI DRAFT ASSIGNMENT WORKFLOW
  // ============================================

  async notifyMariaOfNewDraft(
    draft: GeodeAIDraft,
    section: GeodeSection,
    report: GeodeReport
  ): Promise<{ ts: string; channel: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'New AI Draft Ready for Assignment',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Deep Research AI has generated a first draft for the *${section.title}* section of the *${report.title}* report.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Word Count:* ${draft.word_count}\n*Generated:* ${new Date(draft.generated_at).toLocaleDateString()}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Google Drive:* <${draft.google_drive_url || GEODE_GOOGLE_DRIVE_FOLDER}|View in Drive>`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Please assign this draft to a ghost writer. You can:',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Assign Ghost Writer',
            },
            action_id: `assign_ghost_writer_${draft.id}`,
            value: draft.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Draft',
            },
            action_id: `view_draft_${draft.id}`,
            url: draft.google_drive_url || GEODE_GOOGLE_DRIVE_FOLDER,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_You can also assign by forwarding an email or using your own Slack._',
          },
        ],
      },
    ];

    const message: SlackMessage = {
      channel_id: this.config.defaultChannelId,
      text: `New AI Draft ready for ${section.title} - ${report.title}`,
      blocks,
    };

    // Send DM to Maria
    return this.client.sendDirectMessage(this.config.mariaUserId, message);
  }

  async notifyGhostWriterOfAssignment(
    ghostWriter: GeodeStakeholder,
    draft: GeodeAIDraft,
    section: GeodeSection,
    report: GeodeReport,
    dueDate: string
  ): Promise<{ ts: string; channel: string } | null> {
    if (!ghostWriter.slack_user_id) {
      console.warn(`Ghost writer ${ghostWriter.name} has no Slack ID`);
      return null;
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'New Writing Assignment',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You've been assigned to revise an AI-generated draft for the *${report.title}* (${report.state.toUpperCase()}) report.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Section:* ${section.title}\n*Word Count:* ${draft.word_count}\n*Due Date:* ${new Date(dueDate).toLocaleDateString()}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Resources:*',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View AI Draft',
            },
            action_id: `view_ai_draft_${draft.id}`,
            url: draft.google_drive_url || GEODE_GOOGLE_DRIVE_FOLDER,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'GEODE Google Drive',
            },
            action_id: 'view_geode_drive',
            url: GEODE_GOOGLE_DRIVE_FOLDER,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Assigned by Maria via Wellspring_`,
          },
        ],
      },
    ];

    const message: SlackMessage = {
      channel_id: '', // Will be set by sendDirectMessage
      text: `New assignment: ${section.title} for ${report.title}`,
      blocks,
    };

    return this.client.sendDirectMessage(ghostWriter.slack_user_id, message);
  }

  // ============================================
  // DEADLINE REMINDERS
  // ============================================

  async sendDeadlineReminder(
    stakeholder: GeodeStakeholder,
    section: GeodeSection,
    report: GeodeReport,
    daysUntil: number
  ): Promise<{ ts: string; channel: string } | null> {
    if (!stakeholder.slack_user_id) {
      return null;
    }

    const urgency = daysUntil <= 3 ? 'urgent' : daysUntil <= 7 ? 'important' : 'friendly';
    const emoji = urgency === 'urgent' ? '' : urgency === 'important' ? '' : '';

    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *Deadline Reminder*\n\nYour deliverable for *${section.title}* (${report.title}) is due in *${daysUntil} day${daysUntil === 1 ? '' : 's'}*.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Due Date:* ${section.draft_deadline || 'Not set'}\n*Current Progress:* ${section.progress_percent}%`,
        },
      },
    ];

    if (section.blockers) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Current Blocker:* ${section.blockers}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Update Progress',
          },
          action_id: `update_progress_${section.id}`,
          value: section.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Report Blocker',
          },
          action_id: `report_blocker_${section.id}`,
          value: section.id,
        },
      ],
    });

    const message: SlackMessage = {
      channel_id: '',
      text: `Deadline reminder: ${section.title} due in ${daysUntil} days`,
      blocks,
    };

    return this.client.sendDirectMessage(stakeholder.slack_user_id, message);
  }

  // ============================================
  // BLOCKER ALERTS
  // ============================================

  async sendBlockerAlert(
    section: GeodeSection,
    report: GeodeReport,
    blocker: string,
    affectedStakeholders: GeodeStakeholder[]
  ): Promise<void> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Blocker Detected',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `A blocker has been identified for *${section.title}* in the *${report.title}* report.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Blocker:*\n>${blocker}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Affected Team:* ${affectedStakeholders.map((s) => s.name).join(', ')}`,
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
            },
            action_id: `view_blocker_${section.id}`,
            url: `/geode/reports/${report.id}/sections/${section.id}`,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Escalate',
            },
            action_id: `escalate_blocker_${section.id}`,
            value: section.id,
          },
        ],
      },
    ];

    const message: SlackMessage = {
      channel_id: this.config.defaultChannelId,
      text: `Blocker detected: ${section.title}`,
      blocks,
    };

    // Post to channel
    await this.client.postMessage(message);

    // Also DM Maria
    await this.client.sendDirectMessage(this.config.mariaUserId, message);
  }

  // ============================================
  // MILESTONE CELEBRATIONS
  // ============================================

  async announceMilestone(
    report: GeodeReport,
    milestone: string,
    details?: string
  ): Promise<{ ts: string; channel: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ' Milestone Reached!',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${report.title}* (${report.state.toUpperCase()}) has reached a milestone:\n\n*${milestone}*`,
        },
      },
    ];

    if (details) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: details,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Overall progress: ${report.overall_progress_percent}% | Sections complete: ${report.sections_complete}/${report.sections_total}_`,
        },
      ],
    });

    const message: SlackMessage = {
      channel_id: this.config.defaultChannelId,
      text: `Milestone reached: ${milestone} for ${report.title}`,
      blocks,
    };

    return this.client.postMessage(message);
  }

  // ============================================
  // WEEKLY DIGEST
  // ============================================

  async sendWeeklyDigest(
    reports: GeodeReport[],
    upcomingDeadlines: { section: GeodeSection; report: GeodeReport; daysUntil: number }[],
    overdueCount: number,
    blockersCount: number
  ): Promise<{ ts: string; channel: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'GEODE Weekly Digest',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Report Progress*',
        },
      },
    ];

    // Add report summaries
    for (const report of reports) {
      const statusEmoji =
        report.status === 'published' ? '' :
        report.overall_progress_percent >= 75 ? '' :
        report.overall_progress_percent >= 50 ? '' : '';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${report.state.toUpperCase()}* - ${report.overall_progress_percent}% (${report.sections_complete}/${report.sections_total} sections)`,
        },
      });
    }

    blocks.push({ type: 'divider' });

    // Upcoming deadlines
    if (upcomingDeadlines.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `* Upcoming Deadlines (Next 7 Days)*\n${upcomingDeadlines
            .slice(0, 5)
            .map((d) => `\u2022 ${d.section.title} (${d.report.state.toUpperCase()}) - ${d.daysUntil} days`)
            .join('\n')}`,
        },
      });
    }

    // Alerts
    if (overdueCount > 0 || blockersCount > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `* Attention Needed*\n${overdueCount > 0 ? `\u2022 ${overdueCount} overdue item${overdueCount === 1 ? '' : 's'}\n` : ''}${blockersCount > 0 ? `\u2022 ${blockersCount} active blocker${blockersCount === 1 ? '' : 's'}` : ''}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Dashboard',
          },
          action_id: 'view_geode_dashboard',
          url: '/geode',
        },
      ],
    });

    const message: SlackMessage = {
      channel_id: this.config.defaultChannelId,
      text: 'GEODE Weekly Digest',
      blocks,
    };

    return this.client.postMessage(message);
  }

  // ============================================
  // UTILITIES
  // ============================================

  async testConnection(): Promise<boolean> {
    try {
      const channels = await this.client.listChannels(1);
      return channels.length >= 0;
    } catch {
      return false;
    }
  }

  async lookupUserByEmail(email: string): Promise<string | null> {
    return this.client.lookupUserByEmail(email);
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

let slackService: GeodeSlackService | null = null;

export function getSlackService(): GeodeSlackService | null {
  return slackService;
}

export function initializeSlackService(config: SlackConfig): GeodeSlackService {
  slackService = new GeodeSlackService(config);
  return slackService;
}

// ============================================
// TYPES EXPORT
// ============================================

export type { SlackConfig };
