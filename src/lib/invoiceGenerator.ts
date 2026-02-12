/**
 * GEODE Invoice Generator
 *
 * Generates prefilled invoice DOCX files matching the official GEODE Invoice Template.
 * Template reference: /Users/trentmcfadyen/Documents/Project InnerSpace/GEODE/GEODE Invoice Template.docx
 *
 * Template structure:
 * - Table 0 (Header): Logo area | Empty | Submission instructions
 * - Table 0 Row 1: "Invoicing Entity" + contact fields | Empty | Instructions text
 * - Table 1 (Invoice grid): Date | Facet-Task | Description | Fee — 9 data rows + Total Due row
 *
 * Facet-Task is always "3-6" for all GEODE invoices (DOE code, does not change).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from 'docx';

// ============================================
// TYPES
// ============================================

export interface InvoiceParams {
  authorName: string;
  authorEmail: string;
  state: string;          // e.g., 'arizona'
  stateName: string;      // e.g., 'Arizona'
  chapterTitle: string;   // e.g., 'Electricity'
  chapterNum: string;     // e.g., '3'
  paymentNumber: number;  // 1, 2, or 3
  paymentAmount: number;  // Dollar amount for THIS milestone
  totalGrantAmount: number; // Full contract value
  milestoneLabel: string; // e.g., "Contract Signed & Author Onboarded"
  invoiceDate?: Date;
}

export interface GeneratedInvoice {
  blob: Blob;
  filename: string;
  base64: string;
  mimeType: string;
}

// ============================================
// CONSTANTS
// ============================================

// DOE Facet-Task code — same for all GEODE invoices
const FACET_TASK = '3-6';

const SUBMISSION_INSTRUCTIONS = [
  'Submission Instructions',
  'Please categorize fees by Facet-Task, or your invoice cannot be processed by our automated system. For example, Facet 1, Task 4 should be entered as "1-4" in the table below.',
  'Submit completed invoice to GEODE@projectinnerspace.org for payment.',
  'Please note "INVOICE" must be written in the email subject line for processing.',
  'For queries on the invoicing process, contact accounting@projectinnerspace.org',
  'Invoices submitted in formats other than this template cannot be processed for payment by our system.',
];

// ============================================
// HELPERS
// ============================================

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Calculate the payment amount for a specific milestone.
 * Payment split: 37.5% / 37.5% / 25%
 */
export function getMilestonePaymentAmount(totalGrant: number, paymentNumber: number): number {
  switch (paymentNumber) {
    case 1: return totalGrant * 0.375;
    case 2: return totalGrant * 0.375;
    case 3: return totalGrant * 0.25;
    default: return 0;
  }
}

/**
 * Get the milestone label for a payment number
 */
export function getMilestoneLabel(paymentNumber: number): string {
  switch (paymentNumber) {
    case 1: return 'Contract Signed & Author Onboarded';
    case 2: return 'Author Review of First Draft Complete';
    case 3: return 'Final Publication Approval';
    default: return 'Unknown Milestone';
  }
}

// ============================================
// BORDER STYLE HELPER
// ============================================

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
} as const;

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
} as const;

// ============================================
// DOCX GENERATION
// ============================================

/**
 * Generate a prefilled GEODE Invoice DOCX matching the official template.
 *
 * Prefills:
 * - Invoicing Entity: author name
 * - Contact email: author email
 * - Contact phone: placeholder
 * - Invoice data row: date, Facet-Task 3-6, milestone description, fee amount
 * - Total Due: payment amount
 */
export async function generateInvoiceDocx(params: InvoiceParams): Promise<GeneratedInvoice> {
  const {
    authorName,
    authorEmail,
    stateName,
    chapterTitle,
    chapterNum,
    paymentNumber,
    paymentAmount,
    totalGrantAmount,
    milestoneLabel,
  } = params;

  const invoiceDate = params.invoiceDate || new Date();
  const dateStr = fmtDate(invoiceDate);

  // Description for the invoice line item
  const description = `GEODE ${stateName} Report - Ch ${chapterNum}: ${chapterTitle} — Payment ${paymentNumber} of 3 (${milestoneLabel})`;

  // Build the DOCX
  const doc = new Document({
    sections: [
      {
        children: [
          // ==================
          // HEADER TABLE (Table 0)
          // Matches template: Logo | Empty | Submission Instructions
          // ==================
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Row 0: Title row
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    width: { size: 35, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'PROJECT INNERSPACE', bold: true, size: 24, color: '333333' }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'GEODE Invoice', bold: true, size: 20, color: '666666' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    borders: noBorder,
                    width: { size: 5, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [] })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    width: { size: 60, type: WidthType.PERCENTAGE },
                    children: [],
                  }),
                ],
              }),
              // Row 1: Invoicing Entity | Empty | Submission Instructions
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorder,
                    verticalAlign: VerticalAlign.TOP,
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'Invoicing Entity', bold: true, size: 18 })] }),
                      new Paragraph({
                        children: [new TextRun({ text: authorName, size: 18 })],
                      }),
                      new Paragraph({ children: [] }),
                      new Paragraph({ children: [] }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Contact email: ', bold: true, size: 16 }),
                          new TextRun({ text: authorEmail, size: 16 }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Contact phone: ', bold: true, size: 16 }),
                          new TextRun({ text: '[Your phone]', italics: true, size: 16, color: '999999' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    borders: noBorder,
                    children: [new Paragraph({ children: [] })],
                  }),
                  new TableCell({
                    borders: noBorder,
                    verticalAlign: VerticalAlign.TOP,
                    children: SUBMISSION_INSTRUCTIONS.map((line, i) =>
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: line,
                            bold: i === 0,
                            size: i === 0 ? 18 : 14,
                            color: i === 0 ? '333333' : '666666',
                          }),
                        ],
                      })
                    ),
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),

          // ==================
          // INVOICE TABLE (Table 1)
          // Matches template: Date | Facet-Task | Description | Fee
          // ==================
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                children: [
                  new TableCell({
                    borders: thinBorder,
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    shading: { fill: 'E8E8E8' },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Date', bold: true, size: 18 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    shading: { fill: 'E8E8E8' },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Facet-Task', bold: true, size: 18 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    shading: { fill: 'E8E8E8' },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 18 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    shading: { fill: 'E8E8E8' },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Fee', bold: true, size: 18 })] })],
                  }),
                ],
              }),
              // Data row 1: PREFILLED with invoice data
              new TableRow({
                children: [
                  new TableCell({
                    borders: thinBorder,
                    children: [new Paragraph({ children: [new TextRun({ text: dateStr, size: 18 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    children: [new Paragraph({ children: [new TextRun({ text: FACET_TASK, size: 18 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    children: [new Paragraph({ children: [new TextRun({ text: description, size: 16 })] })],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    children: [new Paragraph({ children: [new TextRun({ text: fmtCurrency(paymentAmount), size: 18 })] })],
                  }),
                ],
              }),
              // Empty rows 2-9 (matching template's 9 blank data rows)
              ...Array.from({ length: 8 }, () =>
                new TableRow({
                  children: [
                    new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                    new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                    new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                    new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                  ],
                })
              ),
              // Total Due row
              new TableRow({
                children: [
                  new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                  new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [] })] }),
                  new TableCell({
                    borders: thinBorder,
                    shading: { fill: 'F0F0F0' },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Total Due', size: 18 }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: '(USD)', size: 18 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    borders: thinBorder,
                    shading: { fill: 'F0F0F0' },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: fmtCurrency(paymentAmount), bold: true, size: 20 })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // Contract reference footer
          new Paragraph({
            children: [
              new TextRun({
                text: `Total Contract Value: ${fmtCurrency(totalGrantAmount)} | This invoice: ${fmtCurrency(paymentAmount)} (Payment ${paymentNumber} of 3)`,
                size: 16,
                color: '888888',
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  // Pack the document into a Blob
  const blob = await Packer.toBlob(doc);

  // Convert to base64 for email attachment
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const filename = `GEODE_Invoice_${stateName}_Ch${chapterNum}_P${paymentNumber}_${authorName.replace(/\s+/g, '_')}.docx`;

  return {
    blob,
    filename,
    base64,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
