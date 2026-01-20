import Papa from 'papaparse';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  balance: number;
  account: string;
}

export interface ParsedCSV {
  transactions: Transaction[];
  account: string;
  startBalance: number;
  endBalance: number;
}

export interface ProcessedData {
  transactions: Transaction[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netChange: number;
    startBalance: number;
    endBalance: number;
    transactionCount: number;
    startDate: string;
    endDate: string;
  };
  categoryBreakdown: Record<string, number>;
  dailySpending: { date: string; amount: number }[];
  topMerchants: { name: string; amount: number; count: number }[];
  weekdaySpending: Record<string, number>;
}

// Common bank CSV column mappings
const COLUMN_MAPPINGS = {
  date: ['date', 'trans date', 'transaction date', 'posted date', 'posting date'],
  description: ['description', 'memo', 'details', 'transaction description', 'payee'],
  amount: ['amount', 'transaction amount'],
  withdrawal: ['withdrawal', 'withdrawals', 'debit', 'debits', 'amount debit'],
  deposit: ['deposit', 'deposits', 'credit', 'credits', 'amount credit'],
  balance: ['balance', 'running balance', 'available balance'],
  category: ['category', 'type', 'transaction type'],
};

function findColumn(headers: string[], mappings: string[]): string | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const mapping of mappings) {
    const index = lowerHeaders.indexOf(mapping);
    if (index !== -1) return headers[index];
  }
  return null;
}

function parseAmount(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const str = String(value).replace(/[$,()]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.abs(num);
}

function inferAccountFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('check') || lower.includes('chk')) return 'Checking';
  if (lower.includes('saving') || lower.includes('sav')) return 'Savings';
  if (lower.includes('credit') || lower.includes('cc')) return 'Credit Card';
  return 'Account';
}

export function parseCSV(csvContent: string, filename: string = 'upload.csv'): ParsedCSV {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const rows = result.data as Record<string, string>[];

  // Find column mappings
  const dateCol = findColumn(headers, COLUMN_MAPPINGS.date);
  const descCol = findColumn(headers, COLUMN_MAPPINGS.description);
  const amountCol = findColumn(headers, COLUMN_MAPPINGS.amount);
  const withdrawalCol = findColumn(headers, COLUMN_MAPPINGS.withdrawal);
  const depositCol = findColumn(headers, COLUMN_MAPPINGS.deposit);
  const balanceCol = findColumn(headers, COLUMN_MAPPINGS.balance);
  const categoryCol = findColumn(headers, COLUMN_MAPPINGS.category);

  const account = inferAccountFromFilename(filename);
  const transactions: Transaction[] = [];

  for (const row of rows) {
    // Parse date
    const dateStr = dateCol ? row[dateCol] : '';
    if (!dateStr) continue;

    // Parse amounts
    let amount = 0;
    let type: 'income' | 'expense' = 'expense';

    if (amountCol) {
      const rawAmount = parseAmount(row[amountCol]);
      const rawStr = String(row[amountCol] || '');
      // Negative = expense, positive = income
      if (rawStr.includes('-') || rawStr.includes('(')) {
        type = 'expense';
        amount = rawAmount;
      } else {
        type = 'income';
        amount = rawAmount;
      }
    } else {
      // Separate withdrawal/deposit columns
      const withdrawal = withdrawalCol ? parseAmount(row[withdrawalCol]) : 0;
      const deposit = depositCol ? parseAmount(row[depositCol]) : 0;

      if (withdrawal > 0) {
        type = 'expense';
        amount = withdrawal;
      } else if (deposit > 0) {
        type = 'income';
        amount = deposit;
      }
    }

    if (amount === 0) continue;

    const description = descCol ? row[descCol]?.trim() || 'Unknown' : 'Unknown';
    const balance = balanceCol ? parseAmount(row[balanceCol]) : 0;
    const category = categoryCol ? row[categoryCol]?.trim() || '' : '';

    transactions.push({
      date: dateStr,
      description,
      amount,
      type,
      category,
      balance,
      account,
    });
  }

  // Sort by date (most recent first)
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const startBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
  const endBalance = transactions.length > 0 ? transactions[0].balance : 0;

  return {
    transactions,
    account,
    startBalance,
    endBalance,
  };
}

export function processTransactions(parsedData: ParsedCSV[]): ProcessedData {
  // Merge all transactions
  const allTransactions = parsedData.flatMap(p => p.transactions);

  // Sort by date
  allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate summary
  const totalIncome = allTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = allTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const dates = allTransactions.map(t => new Date(t.date).getTime());
  const startDate = new Date(Math.min(...dates)).toLocaleDateString();
  const endDate = new Date(Math.max(...dates)).toLocaleDateString();

  // Calculate balances across all accounts
  const startBalance = parsedData.reduce((sum, p) => sum + p.startBalance, 0);
  const endBalance = parsedData.reduce((sum, p) => sum + p.endBalance, 0);

  // Category breakdown (expenses only)
  const categoryBreakdown: Record<string, number> = {};
  allTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
    });

  // Daily spending
  const dailyMap: Record<string, number> = {};
  allTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const dateKey = new Date(t.date).toISOString().split('T')[0];
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + t.amount;
    });
  const dailySpending = Object.entries(dailyMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top merchants
  const merchantMap: Record<string, { amount: number; count: number }> = {};
  allTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const merchant = extractMerchant(t.description);
      if (!merchantMap[merchant]) {
        merchantMap[merchant] = { amount: 0, count: 0 };
      }
      merchantMap[merchant].amount += t.amount;
      merchantMap[merchant].count += 1;
    });
  const topMerchants = Object.entries(merchantMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Weekday spending
  const weekdaySpending: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
    Thursday: 0, Friday: 0, Saturday: 0,
  };
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  allTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const day = weekdays[new Date(t.date).getDay()];
      weekdaySpending[day] += t.amount;
    });

  return {
    transactions: allTransactions,
    summary: {
      totalIncome,
      totalExpenses,
      netChange: totalIncome - totalExpenses,
      startBalance,
      endBalance,
      transactionCount: allTransactions.length,
      startDate,
      endDate,
    },
    categoryBreakdown,
    dailySpending,
    topMerchants,
    weekdaySpending,
  };
}

function extractMerchant(description: string): string {
  // Clean up common transaction prefixes
  let cleaned = description
    .replace(/^(POS PURCHASE|DEBIT CARD PURCHASE|RECURRING DEBIT CARD|ACH WEB|ACH CREDIT)\s*/i, '')
    .replace(/XXXXX\d+\s*/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Extract first meaningful part (usually merchant name)
  const parts = cleaned.split(/\s{2,}|\t/);
  const merchant = parts[0] || cleaned;

  // Capitalize properly
  return merchant.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .substring(0, 30);
}
