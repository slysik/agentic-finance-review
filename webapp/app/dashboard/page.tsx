'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { parseCSV, processTransactions, type ProcessedData, type ParsedCSV, type Transaction } from '@/lib/csv-processor';
import { categorizeAllTransactions } from '@/lib/categorizer';
import { validateParsedCSV, validateIIF, type ValidationResult, type IIFValidationResult } from '@/lib/validators';
import { generateNovelInsights, type NovelInsights } from '@/lib/insights';
import { parseQBO, qboToParsedCSV, isQBOFormat } from '@/lib/qbo-parser';
import { downloadIIF, generateIIF } from '@/lib/iif-exporter';
import { applyRulesToAll, type SplitTransaction } from '@/lib/custom-rules';
import { TransactionsTable } from '@/components/transactions-table';
import { RulesEditor } from '@/components/rules-editor';
import Papa from 'papaparse';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface FileValidation {
  filename: string;
  result: ValidationResult;
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<ProcessedData | null>(null);
  const [processedTransactions, setProcessedTransactions] = useState<(Transaction | SplitTransaction)[]>([]);
  const [novelInsights, setNovelInsights] = useState<NovelInsights | null>(null);
  const [validations, setValidations] = useState<FileValidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'insights'>('overview');
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [iifValidation, setIifValidation] = useState<IIFValidationResult | null>(null);

  useEffect(() => {
    const storedData = localStorage.getItem('financeData');
    if (!storedData) {
      router.push('/');
      return;
    }

    try {
      const files = JSON.parse(storedData) as { name: string; content: string; type?: string }[];

      // Run validators on CSV files (mirrors .claude/hooks/validators/)
      const fileValidations: FileValidation[] = files
        .filter(f => !isQBOFormat(f.content) && f.type !== 'qbo')
        .map(f => {
          const parsed = Papa.parse(f.content, { header: true, skipEmptyLines: true });
          const rows = parsed.data as Record<string, string>[];
          const headers = parsed.meta.fields || [];
          return {
            filename: f.name,
            result: validateParsedCSV(rows, headers, f.name, { validateBalance: true }),
          };
        });
      setValidations(fileValidations);

      // Parse and process - handle both CSV and QBO formats
      const parsedFiles: ParsedCSV[] = files.map(f => {
        if (isQBOFormat(f.content) || f.type === 'qbo') {
          // Parse QBO/OFX file
          const qboResult = parseQBO(f.content, f.name);
          return qboToParsedCSV(qboResult);
        } else {
          // Parse CSV file
          return parseCSV(f.content, f.name);
        }
      });

      // Categorize all transactions
      parsedFiles.forEach(pf => {
        pf.transactions = categorizeAllTransactions(pf.transactions);
      });

      const processed = processTransactions(parsedFiles);
      setData(processed);

      // Apply custom rules (from rules-editor)
      const withRules = applyRulesToAll(processed.transactions);
      setProcessedTransactions(withRules);

      // Generate novel insights (from graph-agent patterns)
      const insights = generateNovelInsights(processed.transactions, processed);
      setNovelInsights(insights);
    } catch (error) {
      console.error('Error processing data:', error);
    }
    setIsLoading(false);
  }, [router]);

  // Re-apply rules when they change
  const handleRulesChange = () => {
    if (data) {
      const withRules = applyRulesToAll(data.transactions);
      setProcessedTransactions(withRules);
      // Clear any previous IIF validation
      setIifValidation(null);
    }
  };

  // Export to IIF with validation
  const handleExportIIF = () => {
    if (!processedTransactions.length) return;

    const dateStr = new Date().toISOString().split('T')[0];
    const iifContent = generateIIF(processedTransactions);

    // Validate the IIF content
    const validation = validateIIF(iifContent);
    setIifValidation(validation);

    // Show validation result but still allow export if there are only warnings
    if (!validation.valid) {
      const proceed = confirm(
        `IIF validation found issues:\n\n${validation.errors.join('\n')}\n\nExport anyway?`
      );
      if (!proceed) return;
    }

    downloadIIF(processedTransactions, `transactions_${dateStr}.iif`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Processing your data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No data found. Please upload your CSV files.</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  const categoryData = Object.entries(data.categoryBreakdown)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const weekdayData = Object.entries(data.weekdaySpending).map(([name, value]) => ({ name, value }));

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Dashboard</h1>
        <p className="text-gray-600">
          {data.summary.startDate} - {data.summary.endDate} • {data.summary.transactionCount} transactions
        </p>
      </div>

      {/* Validation Status - mirrors .claude/hooks/validators/ output */}
      {validations.length > 0 && (
        <div className="mb-6">
          <div className={`rounded-xl p-4 ${
            validations.every(v => v.result.valid)
              ? 'bg-green-50 border border-green-200'
              : 'bg-yellow-50 border border-yellow-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {validations.every(v => v.result.valid) ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-green-800">All validations passed</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium text-yellow-800">Validation warnings</span>
                </>
              )}
            </div>
            <div className="text-sm space-y-1">
              {validations.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  {v.result.valid ? (
                    <span className="text-green-700">✓ {v.filename}: CSV structure and balances validated</span>
                  ) : (
                    <div className="text-yellow-700">
                      <span>⚠ {v.filename}:</span>
                      {v.result.errors.slice(0, 2).map((e, j) => (
                        <div key={j} className="ml-4 text-xs">{e.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['overview', 'transactions', 'insights'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="metric-card animate-fade-in">
              <div className="metric-value positive">{formatCurrency(data.summary.totalIncome)}</div>
              <div className="metric-label">Total Income</div>
            </div>
            <div className="metric-card animate-fade-in">
              <div className="metric-value negative">{formatCurrency(data.summary.totalExpenses)}</div>
              <div className="metric-label">Total Expenses</div>
            </div>
            <div className="metric-card animate-fade-in">
              <div className={`metric-value ${data.summary.netChange >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(data.summary.netChange)}
              </div>
              <div className="metric-label">Net Change</div>
            </div>
            <div className="metric-card animate-fade-in">
              <div className="metric-value neutral">{formatCurrency(data.summary.endBalance)}</div>
              <div className="metric-label">Current Balance</div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Category Pie Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {categoryData.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Daily Spending Trend */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Spending Trend</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailySpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      stroke="#9CA3AF"
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      stroke="#9CA3AF"
                      fontSize={12}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#3B82F6"
                      fill="#93C5FD"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Top Merchants */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Merchants</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topMerchants.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} stroke="#9CA3AF" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      stroke="#9CA3AF"
                      fontSize={11}
                      tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + '...' : v}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="#10B981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Spending by Weekday */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Day of Week</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                    <YAxis tickFormatter={(v) => `$${v}`} stroke="#9CA3AF" fontSize={12} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="value" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Income vs Expenses */}
          <div className="card mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Income vs Expenses</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: 'Total', income: data.summary.totalIncome, expenses: data.summary.totalExpenses }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis tickFormatter={(v) => `$${v}`} stroke="#9CA3AF" />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {activeTab === 'transactions' && (
        <TransactionsTable transactions={data.transactions} />
      )}

      {activeTab === 'insights' && (
        <div className="space-y-6">
          {/* AI-Style Insights - from graph-agent patterns */}
          {novelInsights && (
            <div className="card bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-2xl">✨</span> Financial Insights
              </h3>
              <div className="space-y-3">
                {novelInsights.insights.map((insight, i) => (
                  <p key={i} className="text-gray-700 pl-2 border-l-4 border-blue-400 bg-white/50 p-3 rounded-r-lg">
                    {insight}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Novel Stats from graph-agent - Burn Rate & Velocity */}
          {novelInsights && (
            <div className="grid md:grid-cols-4 gap-4">
              <div className="card">
                <h4 className="font-medium text-gray-500 mb-2">Monthly Burn Rate</h4>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(novelInsights.burnRate.currentMonthlyBurn)}
                </p>
                <p className="text-xs text-gray-500">avg {formatCurrency(novelInsights.burnRate.averageDailyBurn)}/day</p>
              </div>
              <div className="card">
                <h4 className="font-medium text-gray-500 mb-2">Spending Trend</h4>
                <p className={`text-2xl font-bold ${
                  novelInsights.spendingVelocity.trend === 'decreasing' ? 'text-green-600' :
                  novelInsights.spendingVelocity.trend === 'increasing' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {novelInsights.spendingVelocity.trend === 'increasing' ? '📈' :
                   novelInsights.spendingVelocity.trend === 'decreasing' ? '📉' : '➡️'}
                  {' '}{Math.abs(novelInsights.spendingVelocity.changePercent).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500">{novelInsights.spendingVelocity.trend}</p>
              </div>
              <div className="card">
                <h4 className="font-medium text-gray-500 mb-2">Recurring Expenses</h4>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(novelInsights.recurringAnalysis.recurringTotal)}
                </p>
                <p className="text-xs text-gray-500">{novelInsights.recurringAnalysis.recurringCount} subscriptions</p>
              </div>
              <div className="card">
                <h4 className="font-medium text-gray-500 mb-2">One-Time Expenses</h4>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(novelInsights.recurringAnalysis.oneTimeTotal)}
                </p>
                <p className="text-xs text-gray-500">{novelInsights.recurringAnalysis.oneTimeCount} purchases</p>
              </div>
            </div>
          )}

          {/* Recurring vs One-Time Pie - from graph-agent */}
          {novelInsights && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recurring vs One-Time</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Recurring', value: novelInsights.recurringAnalysis.recurringTotal },
                          { name: 'One-Time', value: novelInsights.recurringAnalysis.oneTimeTotal },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#8B5CF6" />
                        <Cell fill="#F59E0B" />
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Savings Rate Over Time - from graph-insights */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Savings Rate</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={novelInsights.savingsRate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis
                        dataKey="period"
                        tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        stroke="#9CA3AF"
                        fontSize={11}
                      />
                      <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} stroke="#9CA3AF" fontSize={11} />
                      <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                      <Area
                        type="monotone"
                        dataKey="savingsRate"
                        stroke="#10B981"
                        fill="#D1FAE5"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Category Treemap - from generative-ui */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Treemap</h3>
            <div className="flex flex-wrap gap-2" style={{ minHeight: '200px' }}>
              {categoryData.slice(0, 10).map((cat, i) => {
                const percentage = (cat.value / data.summary.totalExpenses) * 100;
                return (
                  <div
                    key={i}
                    className="rounded-lg p-3 text-white flex flex-col justify-between"
                    style={{
                      backgroundColor: COLORS[i % COLORS.length],
                      flexGrow: Math.max(percentage, 5),
                      minWidth: '100px',
                      minHeight: '80px',
                    }}
                  >
                    <span className="font-medium text-sm truncate">{cat.name}</span>
                    <span className="text-lg font-bold">{formatCurrency(cat.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Recurring Subscriptions - from categorize-csv patterns */}
          {novelInsights && novelInsights.recurringAnalysis.recurringItems.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Subscriptions</h3>
              <div className="space-y-2">
                {novelInsights.recurringAnalysis.recurringItems.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium text-gray-700">{item.name}</span>
                    <span className="font-bold text-purple-600">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Original Category Breakdown */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
            <div className="space-y-3">
              {categoryData.slice(0, 12).map((cat, i) => {
                const percentage = (cat.value / data.summary.totalExpenses) * 100;
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-32 font-medium text-gray-700 truncate">{cat.name}</div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right font-medium text-gray-900">{formatCurrency(cat.value)}</div>
                    <div className="w-16 text-right text-gray-500 text-sm">{percentage.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Savings Rate */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Savings Rate</h3>
            <div className="flex items-center gap-8">
              <div className="flex-1">
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      data.summary.netChange >= 0 ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs((data.summary.netChange / data.summary.totalIncome) * 100), 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${data.summary.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {((data.summary.netChange / data.summary.totalIncome) * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500">of income saved</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IIF Validation Status */}
      {iifValidation && (
        <div className={`mt-6 rounded-xl p-4 ${
          iifValidation.valid
            ? 'bg-green-50 border border-green-200'
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {iifValidation.valid ? (
              <>
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-green-800">IIF export validated</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-medium text-yellow-800">IIF validation warnings</span>
              </>
            )}
          </div>
          <div className="text-sm">
            <p className="text-gray-600">
              {iifValidation.stats.transactionCount} transactions, {iifValidation.stats.splitCount} splits
            </p>
            {iifValidation.errors.length > 0 && (
              <ul className="mt-2 text-yellow-700">
                {iifValidation.errors.slice(0, 3).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-4 mt-8">
        <button onClick={() => router.push('/')} className="btn-secondary">
          Upload New Files
        </button>
        <button
          onClick={() => setShowRulesEditor(true)}
          className="btn-secondary text-blue-600 hover:bg-blue-50"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage Rules
          </span>
        </button>
        <button
          onClick={handleExportIIF}
          className="btn-secondary text-purple-600 hover:bg-purple-50"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export to QuickBooks (IIF)
          </span>
        </button>
        <button
          onClick={() => {
            localStorage.removeItem('financeData');
            localStorage.removeItem('financeDataTimestamp');
            router.push('/');
          }}
          className="btn-secondary text-red-600 hover:bg-red-50"
        >
          Clear Data
        </button>
      </div>

      {/* Rules Editor Modal */}
      <RulesEditor
        isOpen={showRulesEditor}
        onClose={() => setShowRulesEditor(false)}
        onRulesChange={handleRulesChange}
      />
    </div>
  );
}
