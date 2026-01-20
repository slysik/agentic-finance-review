/**
 * QBO (Quicken/QuickBooks Online) File Parser
 *
 * QBO files are based on OFX (Open Financial Exchange) format.
 * They use SGML-like markup to represent bank transactions.
 *
 * Structure:
 * - Header section with metadata
 * - <OFX> root element
 * - <BANKMSGSRSV1> or <CREDITCARDMSGSRSV1> for transactions
 * - <STMTTRN> elements for each transaction
 */

import { Transaction, ParsedCSV } from './csv-processor';

export interface QBOTransaction {
  fitId: string;        // Financial institution transaction ID
  type: string;         // DEBIT, CREDIT, etc.
  date: string;         // YYYYMMDD format
  amount: number;
  name: string;         // Payee name
  memo?: string;
  checkNum?: string;
}

export interface QBOParseResult {
  transactions: Transaction[];
  account: string;
  bankId?: string;
  accountId?: string;
  accountType?: string;
  startDate?: string;
  endDate?: string;
  startBalance: number;
  endBalance: number;
}

/**
 * Parse QBO/OFX date format (YYYYMMDD or YYYYMMDDHHMMSS)
 */
function parseOFXDate(dateStr: string): string {
  if (!dateStr) return '';

  // Remove timezone info if present (e.g., "20240315120000[-5:EST]")
  const cleanDate = dateStr.split('[')[0];

  const year = cleanDate.substring(0, 4);
  const month = cleanDate.substring(4, 6);
  const day = cleanDate.substring(6, 8);

  return `${year}-${month}-${day}`;
}

/**
 * Extract value between OFX tags
 * Handles both SGML-style (no closing tag) and XML-style (with closing tag)
 * SGML: <TAG>value
 * XML:  <TAG>value</TAG>
 */
function extractTag(content: string, tag: string): string {
  // Try XML-style first (with closing tag)
  const xmlRegex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const xmlMatch = content.match(xmlRegex);
  if (xmlMatch) return xmlMatch[1].trim();

  // Fall back to SGML-style (no closing tag)
  const sgmlRegex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
  const sgmlMatch = content.match(sgmlRegex);
  return sgmlMatch ? sgmlMatch[1].trim() : '';
}

/**
 * Extract all occurrences of a block between tags
 */
function extractBlocks(content: string, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;

  let pos = 0;
  while (true) {
    const start = content.indexOf(openTag, pos);
    if (start === -1) break;

    const end = content.indexOf(closeTag, start);
    if (end === -1) break;

    blocks.push(content.substring(start + openTag.length, end));
    pos = end + closeTag.length;
  }

  return blocks;
}

/**
 * Infer account type from filename or content
 */
function inferAccountType(filename: string, content: string): string {
  const lower = filename.toLowerCase();

  if (lower.includes('check') || lower.includes('chk')) return 'Checking';
  if (lower.includes('saving') || lower.includes('sav')) return 'Savings';
  if (lower.includes('credit') || lower.includes('cc')) return 'Credit Card';

  // Check OFX content for account type
  const acctType = extractTag(content, 'ACCTTYPE');
  if (acctType) {
    if (acctType.toUpperCase() === 'CHECKING') return 'Checking';
    if (acctType.toUpperCase() === 'SAVINGS') return 'Savings';
    if (acctType.toUpperCase() === 'CREDITCARD') return 'Credit Card';
  }

  // Check if it's a credit card statement
  if (content.includes('<CREDITCARDMSGSRSV1>')) return 'Credit Card';

  return 'Account';
}

/**
 * Parse a QBO/OFX file and extract transactions
 */
export function parseQBO(content: string, filename: string = 'upload.qbo'): QBOParseResult {
  const transactions: Transaction[] = [];

  // Extract account info
  const bankId = extractTag(content, 'BANKID');
  const accountId = extractTag(content, 'ACCTID');
  const accountType = inferAccountType(filename, content);

  // Extract balance info
  const ledgerBal = extractTag(content, 'BALAMT');
  const endBalance = ledgerBal ? parseFloat(ledgerBal) : 0;

  // Extract date range
  const startDate = parseOFXDate(extractTag(content, 'DTSTART'));
  const endDate = parseOFXDate(extractTag(content, 'DTEND'));

  // Extract all transaction blocks
  const txnBlocks = extractBlocks(content, 'STMTTRN');

  let runningBalance = endBalance;
  const parsedTxns: { txn: Transaction; amount: number }[] = [];

  for (const block of txnBlocks) {
    const trnType = extractTag(block, 'TRNTYPE');
    const datePosted = parseOFXDate(extractTag(block, 'DTPOSTED'));
    const amountStr = extractTag(block, 'TRNAMT');
    const name = extractTag(block, 'NAME') || extractTag(block, 'PAYEE');
    const memo = extractTag(block, 'MEMO');
    const fitId = extractTag(block, 'FITID');
    const checkNum = extractTag(block, 'CHECKNUM');

    const amount = parseFloat(amountStr) || 0;
    const absAmount = Math.abs(amount);

    // Determine if income or expense based on amount sign
    const isIncome = amount > 0;

    const description = memo
      ? `${name} - ${memo}`
      : checkNum
        ? `${name} #${checkNum}`
        : name;

    parsedTxns.push({
      txn: {
        date: datePosted,
        description: description,
        amount: absAmount,
        type: isIncome ? 'income' : 'expense',
        category: 'Uncategorized',
        balance: 0, // Will calculate after sorting
        account: accountType,
      },
      amount: amount,
    });
  }

  // Sort by date descending (newest first) to match CSV processor behavior
  parsedTxns.sort((a, b) => new Date(b.txn.date).getTime() - new Date(a.txn.date).getTime());

  // Calculate running balance (working backwards from end balance)
  let balance = endBalance;
  for (const { txn, amount } of parsedTxns) {
    txn.balance = balance;
    balance -= amount; // Subtract to go backwards in time
  }

  const startBalance = balance;

  return {
    transactions: parsedTxns.map(p => p.txn),
    account: accountType,
    bankId,
    accountId: accountId ? `****${accountId.slice(-4)}` : undefined,
    accountType,
    startDate,
    endDate,
    startBalance,
    endBalance,
  };
}

/**
 * Convert QBO parse result to standard ParsedCSV format
 * for compatibility with existing processing pipeline
 */
export function qboToParsedCSV(qboResult: QBOParseResult): ParsedCSV {
  return {
    transactions: qboResult.transactions,
    account: qboResult.account,
    startBalance: qboResult.startBalance,
    endBalance: qboResult.endBalance,
  };
}

/**
 * Check if content appears to be QBO/OFX format
 */
export function isQBOFormat(content: string): boolean {
  // Check for OFX headers or tags
  return (
    content.includes('OFXHEADER') ||
    content.includes('<OFX>') ||
    content.includes('<STMTTRN>') ||
    content.includes('BANKMSGSRSV1') ||
    content.includes('CREDITCARDMSGSRSV1')
  );
}
