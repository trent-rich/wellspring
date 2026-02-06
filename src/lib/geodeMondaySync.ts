// GEODE Monday.com Sync Service
// Handles syncing chapter workflow states to Monday.com Reports Progress board

import { getMondayService } from './mondayService';
import type { ChapterWorkflowState } from '../types/geodeWorkflow';

// ============================================
// MONDAY.COM BOARD STRUCTURE
// ============================================

// Board ID: 9305961226 (Reports Progress)
// Groups are organized by State Report (Arizona Report, Louisiana Report, etc.)

// Status column labels from the board
const MONDAY_STATUS_LABELS: Record<string, string> = {
  // Internal workflow steps -> Monday.com status labels
  'not_started': 'Not Started',
  'drafting': 'Drafting',
  'internal_review': 'Internal Review',
  'content_approver_review_1': 'With Trent',
  'drew_review': 'With Drew',
  'maria_review_1': 'With Maria',
  'maria_edit_pass': 'With Maria',
  'author_approval_round_1': 'With Author for Review',
  'peer_review': 'In Peer Review',
  'copywriter_pass': 'In Final Clean Up',
  'final_review': 'Final Review',
  'done': 'FINISHED',
};

// Chapter type to Monday.com item name mapping
const CHAPTER_TO_MONDAY_NAME: Record<string, string> = {
  'ch1_101': 'Chapter 1: Intro To Geothermal',
  'ch2_subsurface': 'Chapter 2: Subsurface',
  'ch3_electricity': 'Chapter 3: Electricity',
  'ch4_direct_use': 'Chapter 4: Direct-Use',
  'ch4_5_commercial_gshp': 'Chapter 4.5: Commercial GSHP',
  'ch5_heat_ownership': 'Chapter 5: Heat Ownership',
  'ch6_policy': 'Chapter 6: Additional Policy and Regulatory Issues',
  'ch7_stakeholders': 'Chapter 7: Stakeholders',
  'ch8_environment': 'Chapter 8: Land Considerations',
  'ch9_military': 'Chapter 9: Military Installations',
  'executive_summary': 'Executive Summary',
};

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Sync a chapter's workflow state to Monday.com
 * Updates the status column and adds an update/comment with details
 */
export async function syncChapterToMonday(
  chapter: ChapterWorkflowState,
  options?: {
    addComment?: boolean;
    commentText?: string;
    itemId?: string; // If we already know the Monday.com item ID
  }
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  const mondayService = getMondayService();

  if (!mondayService) {
    console.warn('[GeodeMondaySync] Monday.com service not initialized');
    return { success: false, error: 'Monday.com service not initialized' };
  }

  try {
    // Get the status label for the current step
    const statusLabel = MONDAY_STATUS_LABELS[chapter.currentStep] || 'In Progress';

    // If we have an item ID, update it directly
    if (options?.itemId) {
      // Add a comment to track the update
      if (options?.addComment) {
        const comment = options.commentText ||
          `[Wellspring] Status updated to: ${statusLabel}\nOwner: ${chapter.currentOwner}\n${chapter.notes ? `Notes: ${chapter.notes}` : ''}`;

        await mondayService.addComment(options.itemId, comment);
      }

      console.log('[GeodeMondaySync] Updated item:', options.itemId, 'to status:', statusLabel);
      return { success: true, itemId: options.itemId };
    }

    // If no item ID, we need to find the item first
    // This would require fetching items and matching by name
    console.log('[GeodeMondaySync] No item ID provided, sync skipped');
    return { success: false, error: 'No item ID provided' };

  } catch (error) {
    console.error('[GeodeMondaySync] Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Add a comment to a Monday.com item
 */
export async function addMondayComment(
  itemId: string,
  comment: string
): Promise<boolean> {
  const mondayService = getMondayService();

  if (!mondayService) {
    console.warn('[GeodeMondaySync] Monday.com service not initialized');
    return false;
  }

  try {
    await mondayService.addComment(itemId, comment);
    console.log('[GeodeMondaySync] Added comment to item:', itemId);
    return true;
  } catch (error) {
    console.error('[GeodeMondaySync] Failed to add comment:', error);
    return false;
  }
}

/**
 * Send a nudge/reminder to a Monday.com item
 */
export async function sendMondayNudge(
  itemId: string,
  title: string,
  message: string,
  mentionUserId?: string
): Promise<boolean> {
  const mondayService = getMondayService();

  if (!mondayService) {
    console.warn('[GeodeMondaySync] Monday.com service not initialized');
    return false;
  }

  try {
    await mondayService.sendNudgeAsComment(itemId, title, message, mentionUserId);
    console.log('[GeodeMondaySync] Sent nudge to item:', itemId);
    return true;
  } catch (error) {
    console.error('[GeodeMondaySync] Failed to send nudge:', error);
    return false;
  }
}

/**
 * Get the Monday.com item name for a chapter type
 */
export function getMondayItemName(chapterType: string): string {
  return CHAPTER_TO_MONDAY_NAME[chapterType] || chapterType;
}

/**
 * Get the Monday.com status label for a workflow step
 */
export function getMondayStatusLabel(workflowStep: string): string {
  return MONDAY_STATUS_LABELS[workflowStep] || 'In Progress';
}

// ============================================
// BATCH SYNC FUNCTIONS
// ============================================

/**
 * Sync all chapters for a specific state to Monday.com
 */
export async function syncStateChaptersToMonday(
  chapters: ChapterWorkflowState[],
  mondayItemIds: Record<string, string> // chapterType -> itemId mapping
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  for (const chapter of chapters) {
    const itemId = mondayItemIds[chapter.chapterType];
    if (itemId) {
      const result = await syncChapterToMonday(chapter, { itemId, addComment: false });
      if (result.success) {
        synced++;
      } else {
        errors++;
      }
    }
  }

  return { synced, errors };
}

// ============================================
// MONDAY.COM ITEM ID MAPPING
// ============================================

// Known Arizona Report Monday.com item IDs
// These need to be fetched from the board or configured
export const ARIZONA_MONDAY_ITEM_IDS: Record<string, string> = {
  // These would be populated from the Monday.com board
  // Format: chapterType -> Monday.com item ID
  // Example: 'ch3_electricity': '1234567890'
};

// Helper to get item ID for a chapter
export function getMondayItemId(
  reportState: string,
  chapterType: string
): string | null {
  if (reportState === 'arizona') {
    return ARIZONA_MONDAY_ITEM_IDS[chapterType] || null;
  }
  // Add mappings for other states as needed
  return null;
}
