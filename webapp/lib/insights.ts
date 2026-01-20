/**
 * Financial Insights Generator
 *
 * Ported from .claude/agents/graph-agent.md and .claude/commands/graph-insights.md
 *
 * Generates "novel" financial insights that go beyond standard charts:
 * - Spending velocity (rate of spending over time)
 * - Recurring vs one-time analysis
 * - Monthly burn rate projection
 * - Savings rate over time
 * - Category trends
 */

import { Transaction, ProcessedData } from './csv-processor';

export interface SpendingVelocity {
  period: string;
  dailyAverage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface RecurringAnalysis {
  recurringTotal: number;
  oneTimeTotal: number;
  recurringCount: number;
  oneTimeCount: number;
  recurringItems: { name: string; amount: number; frequency: string }[];
}

export interface BurnRateProjection {
  currentMonthlyBurn: number;
  projectedRunway: number; // months until balance hits 0 at current rate
  averageDailyBurn: number;
  projectedEndOfMonth: number;
}

export interface SavingsRateData {
  period: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number; // percentage
}

export interface CategoryTrend {
  category: string;
  data: { date: string; amount: number }[];
  trend: 'increasing' | 'decreasing' | 'stable';
  percentChange: number;
}

export interface NovelInsights {
  spendingVelocity: SpendingVelocity;
  recurringAnalysis: RecurringAnalysis;
  burnRate: BurnRateProjection;
  savingsRate: SavingsRateData[];
  categoryTrends: CategoryTrend[];
  insights: string[]; // AI-style insights
}

/**
 * Patterns that indicate recurring transactions
 * From .claude/commands/categorize-csv.md
 */
const RECURRING_PATTERNS = [
  /netflix/i, /spotify/i, /hulu/i, /disney/i, /hbo/i, /max\.com/i,
  /openai/i, /anthropic/i, /cursor/i, /github/i, /vercel/i,
  /aws/i, /google cloud/i, /azure/i, /digitalocean/i,
  /rent/i, /mortgage/i, /insurance/i, /spectrum/i, /verizon/i,
  /con ?ed/i, /national grid/i, /utility/i,
  /gym/i, /fitness/i, /subscription/i, /membership/i,
  /recurring/i, /monthly/i,
];

function isRecurring(description: string): boolean {
  return RECURRING_PATTERNS.some(pattern => pattern.test(description));
}

function extractMerchantName(description: string): string {
  // Clean up common prefixes
  let cleaned = description
    .replace(/^(POS PURCHASE|DEBIT CARD|RECURRING|ACH)\s*/i, '')
    .replace(/XXXXX\d+\s*/g, '')
    .split(/\s{2,}/)[0]
    .trim();

  return cleaned.substring(0, 25);
}

/**
 * Calculate spending velocity - how fast money is being spent
 */
export function calculateSpendingVelocity(
  transactions: Transaction[],
  data: ProcessedData
): SpendingVelocity {
  const days = data.dailySpending.length || 1;
  const dailyAverage = data.summary.totalExpenses / days;

  // Compare first half vs second half of period
  const midpoint = Math.floor(data.dailySpending.length / 2);
  const firstHalf = data.dailySpending.slice(0, midpoint);
  const secondHalf = data.dailySpending.slice(midpoint);

  const firstHalfAvg = firstHalf.reduce((s, d) => s + d.amount, 0) / (firstHalf.length || 1);
  const secondHalfAvg = secondHalf.reduce((s, d) => s + d.amount, 0) / (secondHalf.length || 1);

  const changePercent = firstHalfAvg > 0
    ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
    : 0;

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (changePercent > 10) trend = 'increasing';
  if (changePercent < -10) trend = 'decreasing';

  return {
    period: `${data.summary.startDate} - ${data.summary.endDate}`,
    dailyAverage,
    trend,
    changePercent,
  };
}

/**
 * Analyze recurring vs one-time expenses
 * From graph-agent.md: "Recurring vs one-time: Pie chart of recurring subscriptions vs one-time purchases"
 */
export function analyzeRecurring(transactions: Transaction[]): RecurringAnalysis {
  const recurring: { name: string; amount: number }[] = [];
  const oneTime: Transaction[] = [];

  const expenses = transactions.filter(t => t.type === 'expense');

  for (const t of expenses) {
    if (isRecurring(t.description)) {
      const name = extractMerchantName(t.description);
      const existing = recurring.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.amount += t.amount;
      } else {
        recurring.push({ name, amount: t.amount });
      }
    } else {
      oneTime.push(t);
    }
  }

  const recurringTotal = recurring.reduce((s, r) => s + r.amount, 0);
  const oneTimeTotal = oneTime.reduce((s, t) => s + t.amount, 0);

  return {
    recurringTotal,
    oneTimeTotal,
    recurringCount: recurring.length,
    oneTimeCount: oneTime.length,
    recurringItems: recurring
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map(r => ({ ...r, frequency: 'monthly' })),
  };
}

/**
 * Calculate burn rate and runway projection
 * From graph-agent.md: "Monthly burn rate projection: Based on current spending patterns"
 */
export function calculateBurnRate(data: ProcessedData): BurnRateProjection {
  const days = data.dailySpending.length || 30;
  const averageDailyBurn = data.summary.totalExpenses / days;
  const currentMonthlyBurn = averageDailyBurn * 30;

  // Project runway based on current balance
  const netDailyChange = (data.summary.totalIncome - data.summary.totalExpenses) / days;
  const projectedRunway = netDailyChange < 0
    ? Math.floor(data.summary.endBalance / Math.abs(netDailyChange) / 30)
    : Infinity;

  // Project end of month balance
  const daysRemaining = 30 - new Date().getDate();
  const projectedEndOfMonth = data.summary.endBalance + (netDailyChange * daysRemaining);

  return {
    currentMonthlyBurn,
    projectedRunway: projectedRunway === Infinity ? 999 : projectedRunway,
    averageDailyBurn,
    projectedEndOfMonth,
  };
}

/**
 * Calculate savings rate over time
 * From graph-insights.md: "Savings Rate: Line chart of (income - spending) / income over time"
 */
export function calculateSavingsRate(
  transactions: Transaction[],
  data: ProcessedData
): SavingsRateData[] {
  // Group by week
  const weeklyData: Record<string, { income: number; expenses: number }> = {};

  for (const t of transactions) {
    const date = new Date(t.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { income: 0, expenses: 0 };
    }

    if (t.type === 'income') {
      weeklyData[weekKey].income += t.amount;
    } else {
      weeklyData[weekKey].expenses += t.amount;
    }
  }

  return Object.entries(weeklyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expenses }]) => {
      const savings = income - expenses;
      const savingsRate = income > 0 ? (savings / income) * 100 : 0;
      return { period, income, expenses, savings, savingsRate };
    });
}

/**
 * Analyze category trends over time
 * From graph-insights.md: "Category Trend Lines: Multi-line chart showing category spending over time"
 */
export function analyzeCategoryTrends(
  transactions: Transaction[],
  topCategories: string[]
): CategoryTrend[] {
  const trends: CategoryTrend[] = [];

  for (const category of topCategories.slice(0, 5)) {
    const categoryTxns = transactions.filter(
      t => t.type === 'expense' && t.category === category
    );

    // Group by week
    const weeklyData: Record<string, number> = {};
    for (const t of categoryTxns) {
      const date = new Date(t.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      weeklyData[weekKey] = (weeklyData[weekKey] || 0) + t.amount;
    }

    const data = Object.entries(weeklyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    // Calculate trend
    if (data.length >= 2) {
      const firstHalf = data.slice(0, Math.floor(data.length / 2));
      const secondHalf = data.slice(Math.floor(data.length / 2));
      const firstAvg = firstHalf.reduce((s, d) => s + d.amount, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, d) => s + d.amount, 0) / secondHalf.length;
      const percentChange = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (percentChange > 15) trend = 'increasing';
      if (percentChange < -15) trend = 'decreasing';

      trends.push({ category, data, trend, percentChange });
    }
  }

  return trends;
}

/**
 * Generate AI-style textual insights
 * Mimics what Claude would say about the financial data
 */
export function generateInsights(
  data: ProcessedData,
  recurring: RecurringAnalysis,
  burnRate: BurnRateProjection,
  velocity: SpendingVelocity
): string[] {
  const insights: string[] = [];

  // Savings insight
  const savingsRate = data.summary.totalIncome > 0
    ? ((data.summary.netChange / data.summary.totalIncome) * 100).toFixed(1)
    : '0';

  if (parseFloat(savingsRate) > 20) {
    insights.push(`💪 Excellent! You're saving ${savingsRate}% of your income this period.`);
  } else if (parseFloat(savingsRate) > 0) {
    insights.push(`📊 You're saving ${savingsRate}% of your income. Consider increasing to 20%+ for long-term goals.`);
  } else {
    insights.push(`⚠️ You're spending more than you earn. Review discretionary spending.`);
  }

  // Recurring expenses insight
  const recurringPercent = data.summary.totalExpenses > 0
    ? ((recurring.recurringTotal / data.summary.totalExpenses) * 100).toFixed(0)
    : '0';
  insights.push(`🔄 Recurring expenses are ${recurringPercent}% of total spending (${recurring.recurringCount} subscriptions).`);

  // Velocity insight
  if (velocity.trend === 'increasing') {
    insights.push(`📈 Spending is increasing - up ${velocity.changePercent.toFixed(0)}% vs earlier in the period.`);
  } else if (velocity.trend === 'decreasing') {
    insights.push(`📉 Great job! Spending decreased ${Math.abs(velocity.changePercent).toFixed(0)}% vs earlier.`);
  }

  // Burn rate insight
  if (burnRate.projectedRunway < 12 && burnRate.projectedRunway > 0) {
    insights.push(`⏰ At current spending, your runway is ~${burnRate.projectedRunway} months.`);
  }

  // Top category insight
  const topCategories = Object.entries(data.categoryBreakdown)
    .sort(([, a], [, b]) => b - a);
  if (topCategories.length > 0) {
    const [topCat, topAmount] = topCategories[0];
    const percent = ((topAmount / data.summary.totalExpenses) * 100).toFixed(0);
    insights.push(`🏆 "${topCat}" is your biggest expense category at ${percent}% of spending.`);
  }

  return insights;
}

/**
 * Generate all novel insights
 * Main entry point - combines all insight generators
 */
export function generateNovelInsights(
  transactions: Transaction[],
  data: ProcessedData
): NovelInsights {
  const velocity = calculateSpendingVelocity(transactions, data);
  const recurringAnalysis = analyzeRecurring(transactions);
  const burnRate = calculateBurnRate(data);
  const savingsRate = calculateSavingsRate(transactions, data);

  const topCategories = Object.entries(data.categoryBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);
  const categoryTrends = analyzeCategoryTrends(transactions, topCategories);

  const insights = generateInsights(data, recurringAnalysis, burnRate, velocity);

  return {
    spendingVelocity: velocity,
    recurringAnalysis,
    burnRate,
    savingsRate,
    categoryTrends,
    insights,
  };
}
