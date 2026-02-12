// Monday.com API Integration Service for GEODE State Reports
// Handles two-way sync between Command Center and Monday.com boards

import type {
  MondayBoard,
  MondayItem,
  MondayColumnValue,
  MondaySyncState,
  GeodeReport,
  GeodeSection,
  GeodeState,
  GeodeReportStatus,
} from '../types/geode';

// ============================================
// CONFIGURATION
// ============================================

const MONDAY_API_URL = 'https://api.monday.com/v2';

interface MondayConfig {
  apiToken: string;
  workspaceId: string;
  geodeBoardId: string;
}

// Column IDs - these would be configured per board
interface GeodeMondayColumnMapping {
  status: string;
  state: string;
  progress: string;
  deadline: string;
  contentOwner: string;
  ghostWriter: string;
  wordCount: string;
  notes: string;
  blockers: string;
  googleDriveLink: string;
}

// Default column mapping (customize per installation)
const DEFAULT_COLUMN_MAPPING: GeodeMondayColumnMapping = {
  status: 'status',
  state: 'state__1',
  progress: 'numbers',
  deadline: 'date',
  contentOwner: 'people',
  ghostWriter: 'people__1',
  wordCount: 'numbers__1',
  notes: 'long_text',
  blockers: 'text',
  googleDriveLink: 'link',
};

// ============================================
// API CLIENT
// ============================================

class MondayClient {
  private apiToken: string;

  constructor(apiToken: string, _workspaceId: string) {
    this.apiToken = apiToken;
    // workspaceId stored for future use
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiToken,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`Monday.com GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  // ============================================
  // BOARD OPERATIONS
  // ============================================

  async getBoard(boardId: string): Promise<MondayBoard | null> {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          workspace_id
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;

    const data = await this.query<{ boards: MondayBoard[] }>(query, { boardId });
    return data.boards[0] || null;
  }

  async getBoardItems(boardId: string, limit = 100): Promise<MondayItem[]> {
    const query = `
      query ($boardId: ID!, $limit: Int!) {
        boards(ids: [$boardId]) {
          items_page(limit: $limit) {
            items {
              id
              name
              group {
                id
              }
              column_values {
                id
                text
                value
              }
              created_at
              updated_at
            }
          }
        }
      }
    `;

    const data = await this.query<{ boards: { items_page: { items: MondayItem[] } }[] }>(
      query,
      { boardId, limit }
    );

    return data.boards[0]?.items_page.items || [];
  }

  // ============================================
  // ITEM OPERATIONS
  // ============================================

  async createItem(
    boardId: string,
    groupId: string,
    itemName: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItem> {
    const query = `
      mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId
          group_id: $groupId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
          created_at
          updated_at
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const data = await this.query<{ create_item: MondayItem }>(query, {
      boardId,
      groupId,
      itemName,
      columnValues: JSON.stringify(columnValues),
    });

    return data.create_item;
  }

  async updateItem(
    boardId: string,
    itemId: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItem> {
    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId
          item_id: $itemId
          column_values: $columnValues
        ) {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const data = await this.query<{ change_multiple_column_values: MondayItem }>(query, {
      boardId,
      itemId,
      columnValues: JSON.stringify(columnValues),
    });

    return data.change_multiple_column_values;
  }

  async deleteItem(itemId: string): Promise<void> {
    const query = `
      mutation ($itemId: ID!) {
        delete_item(item_id: $itemId) {
          id
        }
      }
    `;

    await this.query(query, { itemId });
  }

  // ============================================
  // UPDATE/COMMENT OPERATIONS
  // ============================================

  async addUpdate(itemId: string, body: string): Promise<string> {
    const query = `
      mutation ($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `;

    const data = await this.query<{ create_update: { id: string } }>(query, {
      itemId,
      body,
    });

    return data.create_update.id;
  }

  // ============================================
  // WEBHOOK OPERATIONS
  // ============================================

  async createWebhook(boardId: string, url: string, event: string): Promise<string> {
    const query = `
      mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!) {
        create_webhook(board_id: $boardId, url: $url, event: $event) {
          id
        }
      }
    `;

    const data = await this.query<{ create_webhook: { id: string } }>(query, {
      boardId,
      url,
      event,
    });

    return data.create_webhook.id;
  }
}

// ============================================
// GEODE SYNC SERVICE
// ============================================

export class MondaySyncService {
  private client: MondayClient;
  private boardId: string;
  private columnMapping: GeodeMondayColumnMapping;
  private lastSyncState: MondaySyncState | null = null;

  constructor(config: MondayConfig, columnMapping?: Partial<GeodeMondayColumnMapping>) {
    this.client = new MondayClient(config.apiToken, config.workspaceId);
    this.boardId = config.geodeBoardId;
    this.columnMapping = { ...DEFAULT_COLUMN_MAPPING, ...columnMapping };
  }

  // ============================================
  // STATUS MAPPING
  // ============================================

  private mapStatusToMonday(status: GeodeReportStatus): Record<string, unknown> {
    // Monday.com status column uses label indices
    const statusMap: Record<GeodeReportStatus, { index: number }> = {
      not_started: { index: 0 },
      research: { index: 1 },
      drafting: { index: 2 },
      internal_review: { index: 3 },
      peer_review: { index: 4 },
      editing: { index: 5 },
      design: { index: 6 },
      final_review: { index: 7 },
      published: { index: 8 },
    };

    return statusMap[status] || { index: 0 };
  }

  private mapMondayToStatus(mondayStatus: string): GeodeReportStatus {
    const reverseMap: Record<string, GeodeReportStatus> = {
      'Not Started': 'not_started',
      'Research': 'research',
      'Drafting': 'drafting',
      'Internal Review': 'internal_review',
      'Peer Review': 'peer_review',
      'Editing': 'editing',
      'Design': 'design',
      'Final Review': 'final_review',
      'Published': 'published',
    };

    return reverseMap[mondayStatus] || 'not_started';
  }

  // ============================================
  // SYNC REPORT TO MONDAY
  // ============================================

  async syncReportToMonday(report: GeodeReport, groupId: string): Promise<string> {
    const columnValues: Record<string, unknown> = {
      [this.columnMapping.status]: this.mapStatusToMonday(report.status),
      [this.columnMapping.state]: { labels: [report.state.toUpperCase()] },
      [this.columnMapping.progress]: report.overall_progress_percent,
      [this.columnMapping.deadline]: { date: report.target_publish_date },
    };

    if (report.monday_item_id) {
      // Update existing item
      await this.client.updateItem(this.boardId, report.monday_item_id, columnValues);
      return report.monday_item_id;
    } else {
      // Create new item
      const item = await this.client.createItem(
        this.boardId,
        groupId,
        report.title,
        columnValues
      );
      return item.id;
    }
  }

  // ============================================
  // SYNC SECTION TO MONDAY (as sub-item)
  // ============================================

  async syncSectionToMonday(
    section: GeodeSection,
    parentItemId: string
  ): Promise<string> {
    const columnValues: Record<string, unknown> = {
      [this.columnMapping.status]: this.mapStatusToMonday(section.status),
      [this.columnMapping.progress]: section.progress_percent,
      [this.columnMapping.wordCount]: section.word_count_current || 0,
      [this.columnMapping.notes]: section.notes || '',
      [this.columnMapping.blockers]: section.blockers || '',
    };

    if (section.draft_deadline) {
      columnValues[this.columnMapping.deadline] = { date: section.draft_deadline };
    }

    if (section.monday_item_id) {
      await this.client.updateItem(this.boardId, section.monday_item_id, columnValues);
      return section.monday_item_id;
    } else {
      // For sub-items, we'd need to use the sub-items API
      // This is a simplified version
      const item = await this.client.createItem(
        this.boardId,
        parentItemId, // Using parent as group for now
        section.title,
        columnValues
      );
      return item.id;
    }
  }

  // ============================================
  // SYNC FROM MONDAY TO COMMAND CENTER
  // ============================================

  async fetchMondayUpdates(): Promise<{
    reports: Partial<GeodeReport>[];
    sections: Partial<GeodeSection>[];
  }> {
    const items = await this.client.getBoardItems(this.boardId);
    const reports: Partial<GeodeReport>[] = [];
    const sections: Partial<GeodeSection>[] = [];

    for (const item of items) {
      const columnMap = new Map(
        item.column_values.map((cv: MondayColumnValue) => [cv.id, cv])
      );

      const statusCol = columnMap.get(this.columnMapping.status);
      const progressCol = columnMap.get(this.columnMapping.progress);
      const notesCol = columnMap.get(this.columnMapping.notes);
      const blockersCol = columnMap.get(this.columnMapping.blockers);

      // Determine if this is a report or section based on structure
      // This logic would depend on your Monday.com board structure
      const isReport = !item.group?.id?.includes('section');

      if (isReport) {
        reports.push({
          monday_item_id: item.id,
          status: statusCol?.text ? this.mapMondayToStatus(statusCol.text) : 'not_started',
          overall_progress_percent: progressCol?.text ? parseFloat(progressCol.text) : 0,
        });
      } else {
        sections.push({
          monday_item_id: item.id,
          status: statusCol?.text ? this.mapMondayToStatus(statusCol.text) : 'not_started',
          progress_percent: progressCol?.text ? parseFloat(progressCol.text) : 0,
          notes: notesCol?.text || null,
          blockers: blockersCol?.text || null,
        });
      }
    }

    return { reports, sections };
  }

  // ============================================
  // ADD COMMENT/UPDATE TO MONDAY ITEM
  // ============================================

  async addComment(itemId: string, message: string): Promise<string> {
    return this.client.addUpdate(itemId, message);
  }

  // ============================================
  // NUDGE VIA MONDAY COMMENT
  // ============================================

  async sendNudgeAsComment(
    itemId: string,
    nudgeTitle: string,
    nudgeMessage: string,
    mentionUserId?: string
  ): Promise<string> {
    let body = `<strong>${nudgeTitle}</strong>\n\n${nudgeMessage}`;

    if (mentionUserId) {
      body = `@[${mentionUserId}] ${body}`;
    }

    return this.addComment(itemId, body);
  }

  // ============================================
  // FULL BOARD SYNC
  // ============================================

  async performFullSync(
    reports: GeodeReport[],
    sections: GeodeSection[],
    groupMapping: Record<GeodeState, string>
  ): Promise<MondaySyncState> {
    const errors: string[] = [];
    let itemsSynced = 0;

    try {
      // Sync all reports
      for (const report of reports) {
        try {
          const groupId = groupMapping[report.state];
          if (groupId) {
            await this.syncReportToMonday(report, groupId);
            itemsSynced++;
          }
        } catch (err) {
          errors.push(`Failed to sync report ${report.id}: ${err}`);
        }
      }

      // Sync all sections
      for (const section of sections) {
        try {
          const report = reports.find(r => r.id === section.report_id);
          if (report?.monday_item_id) {
            await this.syncSectionToMonday(section, report.monday_item_id);
            itemsSynced++;
          }
        } catch (err) {
          errors.push(`Failed to sync section ${section.id}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Full sync failed: ${err}`);
    }

    this.lastSyncState = {
      board_id: this.boardId,
      last_sync_at: new Date().toISOString(),
      items_synced: itemsSynced,
      errors,
    };

    return this.lastSyncState;
  }

  // ============================================
  // WEBHOOK SETUP
  // ============================================

  async setupWebhooks(callbackUrl: string): Promise<string[]> {
    const webhookIds: string[] = [];

    // Set up webhooks for key events
    const events = [
      'change_column_value',
      'create_item',
      'delete_item',
      'create_update',
    ];

    for (const event of events) {
      try {
        const id = await this.client.createWebhook(this.boardId, callbackUrl, event);
        webhookIds.push(id);
      } catch (err) {
        console.error(`Failed to create webhook for ${event}:`, err);
      }
    }

    return webhookIds;
  }

  // ============================================
  // UTILITIES
  // ============================================

  getLastSyncState(): MondaySyncState | null {
    return this.lastSyncState;
  }

  async testConnection(): Promise<boolean> {
    try {
      const board = await this.client.getBoard(this.boardId);
      return board !== null;
    } catch {
      return false;
    }
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

let mondayService: MondaySyncService | null = null;

export function getMondayService(): MondaySyncService | null {
  return mondayService;
}

export function initializeMondayService(
  config: MondayConfig,
  columnMapping?: Partial<GeodeMondayColumnMapping>
): MondaySyncService {
  mondayService = new MondaySyncService(config, columnMapping);
  return mondayService;
}

// ============================================
// GEODE AUTHOR PAYMENTS SERVICE
// ============================================

// GEODE Payments: Report Contributors Board
// Board ID: 5640622226 (https://projectinnerspace.monday.com/boards/5640622226)
// Groups are organized by State Report (Arizona, Oklahoma, etc.)
const PAYMENTS_BOARD_ID = '5640622226';

// Cache for state-to-group ID mapping (populated dynamically from board)
let cachedStateGroupIds: Record<string, string> | null = null;

/**
 * Fetch and cache state group IDs from the Payments board
 * Group titles are expected to match state names (e.g., "Oklahoma", "Arizona")
 */
async function fetchStateGroupIds(apiToken: string): Promise<Record<string, string>> {
  if (cachedStateGroupIds) {
    return cachedStateGroupIds;
  }

  const result = await getPaymentsBoardGroups(apiToken);
  if (!result.success || !result.groups) {
    console.warn('[MondayService] Failed to fetch Payments board groups');
    return {};
  }

  // Build mapping from state value to group ID
  // Group titles like "Oklahoma" or "Arizona" map to state values like "oklahoma" or "arizona"
  const mapping: Record<string, string> = {};
  for (const group of result.groups) {
    // Normalize: "Oklahoma" -> "oklahoma", "New Mexico" -> "new_mexico"
    const stateKey = group.title.toLowerCase().replace(/\s+/g, '_');
    mapping[stateKey] = group.id;
  }

  cachedStateGroupIds = mapping;
  console.log('[MondayService] Cached state group IDs:', Object.keys(mapping).join(', '));
  return mapping;
}

/**
 * Clear the cached group IDs (useful after board structure changes)
 */
export function clearStateGroupCache(): void {
  cachedStateGroupIds = null;
}

export interface GeodeAuthorDetails {
  name: string;
  email: string;
  state: string;
  chapterType: string;
  chapterTitle: string;
  chapterNum: string;
  contractSignedDate?: string;
  grantAmount?: number;
}

/**
 * Check if an author already exists in a state group on the Payments board.
 * Searches by item name (author name) within the specified state group.
 * Returns the existing item ID if found, or null if not.
 */
export async function findAuthorInPaymentsBoard(
  apiToken: string,
  state: string,
  authorName: string
): Promise<{ exists: boolean; itemId?: string; itemName?: string }> {
  try {
    // Fetch state group IDs
    const stateGroupIds = await fetchStateGroupIds(apiToken);
    const groupId = stateGroupIds[state];

    if (!groupId) {
      console.warn('[MondayService] No group found for state:', state);
      return { exists: false };
    }

    // Query items in the board, then filter by group and name
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          items_page(limit: 200) {
            items {
              id
              name
              group {
                id
              }
            }
          }
        }
      }
    `;

    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({
        query,
        variables: { boardId: PAYMENTS_BOARD_ID },
      }),
    });

    if (!response.ok) {
      console.error('[MondayService] API error:', response.status);
      return { exists: false };
    }

    const result = await response.json();
    if (result.errors) {
      console.error('[MondayService] GraphQL errors:', result.errors);
      return { exists: false };
    }

    const items: Array<{ id: string; name: string; group: { id: string } }> =
      result.data?.boards?.[0]?.items_page?.items || [];

    // Filter to items in the same state group, then match by name (case-insensitive)
    const normalizedName = authorName.toLowerCase().trim();
    const match = items.find(
      (item) =>
        item.group.id === groupId &&
        item.name.toLowerCase().trim() === normalizedName
    );

    if (match) {
      console.log('[MondayService] Found existing author:', match.name, 'ID:', match.id);
      return { exists: true, itemId: match.id, itemName: match.name };
    }

    return { exists: false };
  } catch (error) {
    console.error('[MondayService] Error searching for author:', error);
    return { exists: false };
  }
}

/**
 * Add a GEODE author to the Payments board under the appropriate state group
 * Per SOP: Contract owner uploads contract details to Monday.com
 */
export async function addAuthorToPaymentsBoard(
  apiToken: string,
  author: GeodeAuthorDetails
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  try {
    // Dynamically fetch and cache state group IDs from the board
    const stateGroupIds = await fetchStateGroupIds(apiToken);

    // Get the group ID for this state
    const groupId = stateGroupIds[author.state];
    if (!groupId) {
      const availableStates = Object.keys(stateGroupIds).join(', ');
      return {
        success: false,
        error: `No group found for state "${author.state}" in Payments board. Available: ${availableStates || 'none (check board configuration)'}`,
      };
    }

    // Column values for the Payments board
    // These column IDs need to match the actual board structure
    const columnValues: Record<string, unknown> = {
      // Email column
      email: { email: author.email, text: author.email },
      // Chapter assignment (text column)
      text: `Ch ${author.chapterNum} - ${author.chapterTitle}`,
    };

    if (author.contractSignedDate) {
      columnValues.date = { date: author.contractSignedDate };
    }

    if (author.grantAmount) {
      columnValues.numbers = author.grantAmount;
    }

    // Create the item in the Payments board under the state group
    const query = `
      mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId
          group_id: $groupId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
        }
      }
    `;

    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({
        query,
        variables: {
          boardId: PAYMENTS_BOARD_ID,
          groupId,
          itemName: author.name,
          columnValues: JSON.stringify(columnValues),
        },
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Monday.com API error: ${response.status}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      return {
        success: false,
        error: `Monday.com error: ${JSON.stringify(result.errors)}`,
      };
    }

    return {
      success: true,
      itemId: result.data.create_item.id,
    };
  } catch (error) {
    console.error('[MondayService] Error adding author to Payments board:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add author to Payments board',
    };
  }
}

/**
 * Get the groups (state reports) in the Payments board
 * Use this to discover/configure group IDs
 */
export async function getPaymentsBoardGroups(
  apiToken: string
): Promise<{ success: boolean; groups?: Array<{ id: string; title: string }>; error?: string }> {
  try {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          groups {
            id
            title
          }
        }
      }
    `;

    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({
        query,
        variables: { boardId: PAYMENTS_BOARD_ID },
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Monday.com API error: ${response.status}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      return {
        success: false,
        error: `Monday.com error: ${JSON.stringify(result.errors)}`,
      };
    }

    return {
      success: true,
      groups: result.data.boards[0]?.groups || [],
    };
  } catch (error) {
    console.error('[MondayService] Error fetching groups:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch groups',
    };
  }
}

/**
 * Update a payment milestone column for an author item
 */
export async function updateAuthorPaymentMilestone(
  apiToken: string,
  itemId: string,
  columnId: string,
  value: boolean | string
): Promise<{ success: boolean; error?: string }> {
  try {
    const columnValue = typeof value === 'boolean'
      ? { checked: value ? 'true' : 'false' }
      : { date: value };

    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
        }
      }
    `;

    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({
        query,
        variables: {
          boardId: PAYMENTS_BOARD_ID,
          itemId,
          columnId,
          value: JSON.stringify(columnValue),
        },
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Monday.com API error: ${response.status}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      return {
        success: false,
        error: `Monday.com error: ${JSON.stringify(result.errors)}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[MondayService] Error updating payment milestone:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update milestone',
    };
  }
}

// ============================================
// TYPES EXPORT
// ============================================

export type { MondayConfig, GeodeMondayColumnMapping };
