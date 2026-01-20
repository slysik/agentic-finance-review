/**
 * IIF (Intuit Interchange Format) Exporter
 *
 * IIF is a tab-delimited text format used to import data into QuickBooks Desktop.
 * This exporter creates valid IIF files from transaction data.
 *
 * IIF Structure:
 * - Header rows define column names (!TRNS, !SPL, !ENDTRNS)
 * - Each transaction has a TRNS row (main entry) and SPL row (split/offset)
 * - ENDTRNS marks the end of each transaction
 *
 * Reference: https://quickbooks.intuit.com/learn-support/en-us/import-or-export-data-files/
 */

import { Transaction, ProcessedData } from './csv-processor';
import { SplitTransaction } from './custom-rules';

export interface IIFExportOptions {
  bankAccountName?: string;      // QuickBooks bank account name (default: "Checking")
  defaultExpenseAccount?: string; // Default expense account (default: "Uncategorized Expense")
  defaultIncomeAccount?: string;  // Default income account (default: "Other Income")
  includeMemo?: boolean;          // Include transaction description as memo
  categoryMapping?: Record<string, string>; // Map app categories to QB accounts
}

const DEFAULT_OPTIONS: IIFExportOptions = {
  bankAccountName: 'Checking',
  defaultExpenseAccount: 'Uncategorized Expense',
  defaultIncomeAccount: 'Other Income',
  includeMemo: true,
  categoryMapping: {},
};

// Default category to QuickBooks account mapping
const DEFAULT_CATEGORY_MAPPING: Record<string, string> = {
  // Expenses
  'Groceries': 'Groceries',
  'Restaurants and Dining': 'Meals & Entertainment',
  'Entertainment': 'Entertainment',
  'Gas': 'Auto:Fuel',
  'Travel': 'Travel',
  'Utilities': 'Utilities',
  'Cable': 'Utilities:Cable',
  'Phone': 'Utilities:Telephone',
  'Insurance': 'Insurance',
  'Healthcare': 'Medical',
  'Subscriptions and Renewals': 'Subscriptions',
  'Services and Supplies': 'Office Supplies',
  'Software & Services': 'Computer & Internet',
  'General Merchandise': 'Supplies',
  'Clothing': 'Clothing',
  'Personal Care': 'Personal Care',
  'Home Improvement': 'Repairs & Maintenance',
  'Loans': 'Loan Interest',
  'Transfers': 'Transfer',
  'ATM': 'Cash',
  'Fees': 'Bank Service Charges',

  // Income
  'Salary': 'Payroll Income',
  'Other Income': 'Other Income',
  'Interest': 'Interest Income',
  'Refund': 'Other Income',

  // Default
  'Uncategorized': 'Uncategorized Expense',
};

/**
 * Format date for IIF (MM/DD/YYYY)
 */
function formatIIFDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Escape special characters for IIF format
 */
function escapeIIF(str: string): string {
  // IIF uses tab as delimiter, so remove/replace tabs
  // Also limit length to prevent issues
  return str
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' ')
    .substring(0, 100);
}

/**
 * Get QuickBooks account name for a category
 */
function getQBAccount(
  category: string,
  type: 'income' | 'expense',
  options: IIFExportOptions
): string {
  // Check custom mapping first
  if (options.categoryMapping?.[category]) {
    return options.categoryMapping[category];
  }

  // Check default mapping
  if (DEFAULT_CATEGORY_MAPPING[category]) {
    return DEFAULT_CATEGORY_MAPPING[category];
  }

  // Return default based on type
  return type === 'income'
    ? (options.defaultIncomeAccount || 'Other Income')
    : (options.defaultExpenseAccount || 'Uncategorized Expense');
}

/**
 * Check if transaction is a split transaction
 */
function isSplitTransaction(txn: Transaction | SplitTransaction): txn is SplitTransaction {
  return 'isSplit' in txn && txn.isSplit === true;
}

/**
 * Group split transactions by their parent ID
 */
function groupSplitTransactions(
  transactions: (Transaction | SplitTransaction)[]
): { regular: Transaction[]; splitGroups: Map<string, SplitTransaction[]> } {
  const regular: Transaction[] = [];
  const splitGroups = new Map<string, SplitTransaction[]>();

  for (const txn of transactions) {
    if (isSplitTransaction(txn) && txn.splitParentId) {
      const group = splitGroups.get(txn.splitParentId) || [];
      group.push(txn);
      splitGroups.set(txn.splitParentId, group);
    } else {
      regular.push(txn);
    }
  }

  return { regular, splitGroups };
}

/**
 * Generate IIF content from transactions (supports split transactions)
 */
export function generateIIF(
  transactions: (Transaction | SplitTransaction)[],
  options: Partial<IIFExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // IIF Header - defines the transaction format
  // TRNS = Transaction header row
  // SPL = Split (offset entry)
  lines.push('!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\tTOPRINT');
  lines.push('!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\tQNTY\tREIMBEXP');
  lines.push('!ENDTRNS');

  const { regular, splitGroups } = groupSplitTransactions(transactions);
  let trnsId = 0;

  // Process regular (non-split) transactions
  for (const txn of regular) {
    trnsId++;
    const date = formatIIFDate(txn.date);
    const amount = txn.type === 'expense' ? -txn.amount : txn.amount;
    const offsetAmount = -amount;
    const name = escapeIIF(txn.description.substring(0, 50));
    const memo = opts.includeMemo ? escapeIIF(txn.description) : '';
    const offsetAccount = getQBAccount(txn.category, txn.type, opts);

    // Transaction type: DEPOSIT for income, CHECK for expense
    const trnsType = txn.type === 'income' ? 'DEPOSIT' : 'CHECK';

    // TRNS row - the bank account entry
    lines.push([
      'TRNS',
      trnsId.toString(),
      trnsType,
      date,
      opts.bankAccountName,
      name,
      amount.toFixed(2),
      '', // DOCNUM (check number)
      memo,
      'N', // CLEAR (cleared status)
      'N', // TOPRINT
    ].join('\t'));

    // SPL row - the offset entry (expense/income account)
    lines.push([
      'SPL',
      trnsId.toString(),
      trnsType,
      date,
      offsetAccount,
      name,
      offsetAmount.toFixed(2),
      '', // DOCNUM
      memo,
      'N', // CLEAR
      '', // QNTY
      '', // REIMBEXP
    ].join('\t'));

    // ENDTRNS marks the end of this transaction
    lines.push('ENDTRNS');
  }

  // Process split transaction groups
  // Each group creates ONE TRNS row and MULTIPLE SPL rows
  for (const [, splits] of Array.from(splitGroups.entries())) {
    if (splits.length === 0) continue;

    trnsId++;
    const firstSplit = splits[0];
    const date = formatIIFDate(firstSplit.date);

    // Calculate total amount from original (use first split's originalAmount)
    const originalAmount = firstSplit.originalAmount || splits.reduce((sum: number, s: SplitTransaction) => sum + s.amount, 0);
    const amount = firstSplit.type === 'expense' ? -originalAmount : originalAmount;
    const name = escapeIIF(firstSplit.description.substring(0, 50));
    const memo = opts.includeMemo ? escapeIIF(firstSplit.description) : '';

    // Transaction type: DEPOSIT for income, CHECK for expense
    const trnsType = firstSplit.type === 'income' ? 'DEPOSIT' : 'CHECK';

    // TRNS row - the bank account entry (total amount)
    lines.push([
      'TRNS',
      trnsId.toString(),
      trnsType,
      date,
      opts.bankAccountName,
      name,
      amount.toFixed(2),
      '', // DOCNUM (check number)
      memo,
      'N', // CLEAR (cleared status)
      'N', // TOPRINT
    ].join('\t'));

    // Multiple SPL rows - one for each split
    for (const split of splits) {
      const splitAmount = split.type === 'expense' ? split.amount : -split.amount;
      const offsetAccount = getQBAccount(split.category, split.type, opts);
      const splitMemo = split.splitMemo || memo;

      lines.push([
        'SPL',
        trnsId.toString(),
        trnsType,
        date,
        offsetAccount,
        name,
        splitAmount.toFixed(2),
        '', // DOCNUM
        escapeIIF(splitMemo),
        'N', // CLEAR
        '', // QNTY
        '', // REIMBEXP
      ].join('\t'));
    }

    // ENDTRNS marks the end of this transaction
    lines.push('ENDTRNS');
  }

  return lines.join('\r\n');
}

/**
 * Generate IIF with account list header
 * Useful when importing to a fresh QuickBooks file
 */
export function generateIIFWithAccounts(
  transactions: Transaction[],
  options: Partial<IIFExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Collect unique accounts needed
  const accounts = new Set<string>();
  accounts.add(opts.bankAccountName || 'Checking');

  transactions.forEach(txn => {
    const account = getQBAccount(txn.category, txn.type, opts);
    accounts.add(account);
  });

  // Account list header
  lines.push('!ACCNT\tNAME\tACCNTTYPE\tDESC');

  // Add bank account
  lines.push(`ACCNT\t${opts.bankAccountName}\tBANK\tImported Bank Account`);

  // Add expense/income accounts
  accounts.forEach(account => {
    if (account !== opts.bankAccountName) {
      // Determine account type based on common patterns
      let accntType = 'EXP'; // Default to expense
      if (account.includes('Income') || account.includes('Payroll')) {
        accntType = 'INC';
      } else if (account.includes('Transfer') || account.includes('Cash')) {
        accntType = 'OASSET';
      }
      lines.push(`ACCNT\t${account}\t${accntType}\tImported Account`);
    }
  });

  // Add blank line before transactions
  lines.push('');

  // Add transaction data
  lines.push(generateIIF(transactions, options));

  return lines.join('\r\n');
}

/**
 * Export processed data to IIF format
 */
export function exportToIIF(
  data: ProcessedData,
  options: Partial<IIFExportOptions> = {}
): string {
  return generateIIF(data.transactions, options);
}

/**
 * Create a downloadable IIF file blob
 */
export function createIIFBlob(content: string): Blob {
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

/**
 * Trigger browser download of IIF file
 */
export function downloadIIF(
  transactions: (Transaction | SplitTransaction)[],
  filename: string = 'transactions.iif',
  options: Partial<IIFExportOptions> = {}
): void {
  const content = generateIIF(transactions, options);
  const blob = createIIFBlob(content);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
