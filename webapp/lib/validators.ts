/**
 * CSV Validators - Ported from .claude/hooks/validators/
 *
 * These validators mirror the Python validators used in the agentic-finance-review
 * Claude Code hooks, providing self-validation for the webapp.
 *
 * Based on:
 * - csv-single-validator.py
 * - normalized-balance-validator.py
 */

export interface ValidationError {
  file: string;
  row?: number;
  date?: string;
  message: string;
  expected?: number;
  actual?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Parse numeric value, handling currency formatting and empty values.
 * Mirrors parse_numeric() from Python validators.
 */
export function parseNumeric(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') {
    return 0;
  }
  const str = String(val).replace(/[$,()]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Validate CSV structure - can be parsed and not empty.
 * Mirrors validate_csv_parseable() from csv-single-validator.py
 */
export function validateCSVParseable(
  rows: Record<string, string>[],
  filename: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!rows || rows.length === 0) {
    errors.push({
      file: filename,
      message: 'CSV file is empty',
    });
    return errors;
  }

  if (Object.keys(rows[0]).length === 0) {
    errors.push({
      file: filename,
      message: 'CSV has no columns',
    });
  }

  return errors;
}

/**
 * Validate required columns exist.
 * For normalized CSVs, expects: date, description, category, deposit, withdrawal, balance
 */
export function validateRequiredColumns(
  headers: string[],
  filename: string,
  required: string[] = ['date', 'description', 'deposit', 'withdrawal', 'balance']
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lowerHeaders = headers.map(h => h.toLowerCase());

  const missing = required.filter(col => {
    // Check for exact match or common variations
    const variations = getColumnVariations(col);
    return !variations.some(v => lowerHeaders.includes(v));
  });

  if (missing.length > 0) {
    errors.push({
      file: filename,
      message: `Missing required columns: ${missing.join(', ')}`,
    });
  }

  return errors;
}

/**
 * Get column name variations for flexible matching.
 */
function getColumnVariations(col: string): string[] {
  const variations: Record<string, string[]> = {
    'date': ['date', 'trans date', 'transaction date', 'posted date'],
    'description': ['description', 'memo', 'details', 'payee'],
    'deposit': ['deposit', 'deposits', 'credit', 'credits', 'amount credit'],
    'withdrawal': ['withdrawal', 'withdrawals', 'debit', 'debits', 'amount debit'],
    'balance': ['balance', 'running balance', 'available balance'],
    'category': ['category', 'type', 'transaction type'],
  };
  return variations[col] || [col];
}

/**
 * Validate balance consistency in a CSV.
 * Mirrors validate_balance_consistency() from normalized-balance-validator.py
 *
 * Starting from the oldest (bottom) row, each subsequent row's balance should equal:
 *   previous_balance - withdrawal + deposit
 *
 * @param rows - CSV rows, ordered newest-to-oldest (top-to-bottom)
 * @param filename - For error reporting
 * @param columns - Column mapping { deposit, withdrawal, balance, date }
 */
export function validateBalanceConsistency(
  rows: Record<string, string>[],
  filename: string,
  columns: {
    deposit: string;
    withdrawal: string;
    balance: string;
    date: string;
  }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const maxErrors = 5;
  let errorCount = 0;

  if (rows.length < 2) {
    // Need at least 2 rows to validate balance progression
    return [];
  }

  // Parse all values upfront
  const deposits = rows.map(r => parseNumeric(r[columns.deposit]));
  const withdrawals = rows.map(r => parseNumeric(r[columns.withdrawal]));
  const balances = rows.map(r => parseNumeric(r[columns.balance]));
  const dates = rows.map(r => r[columns.date] || 'unknown');

  // Validate from bottom (oldest) to top (newest)
  // Index len-1 is oldest, index 0 is newest
  for (let i = rows.length - 2; i >= 0; i--) {
    const prevIdx = i + 1; // Previous row (older, lower in file)
    const currIdx = i;     // Current row (newer, higher in file)

    const prevBalance = balances[prevIdx];
    const currDeposit = deposits[currIdx];
    const currWithdrawal = withdrawals[currIdx];
    const currBalance = balances[currIdx];

    const expectedBalance = prevBalance - currWithdrawal + currDeposit;

    // Allow small floating point tolerance
    if (Math.abs(expectedBalance - currBalance) > 0.01) {
      errorCount++;
      if (errorCount <= maxErrors) {
        errors.push({
          file: filename,
          row: currIdx + 2, // 1-indexed, +1 for header
          date: dates[currIdx],
          message: `Balance mismatch! Expected $${expectedBalance.toFixed(2)}, got $${currBalance.toFixed(2)}`,
          expected: expectedBalance,
          actual: currBalance,
        });
      }
    }
  }

  if (errorCount > maxErrors) {
    errors.push({
      file: filename,
      message: `... and ${errorCount - maxErrors} more balance errors`,
    });
  }

  return errors;
}

/**
 * Full validation of a parsed CSV.
 * Combines all validators similar to Claude Code hooks.
 */
export function validateParsedCSV(
  rows: Record<string, string>[],
  headers: string[],
  filename: string,
  options: {
    validateBalance?: boolean;
    requiredColumns?: string[];
  } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // 1. Basic parsing check
  const parseErrors = validateCSVParseable(rows, filename);
  errors.push(...parseErrors);

  if (parseErrors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 2. Required columns check
  if (options.requiredColumns) {
    const columnErrors = validateRequiredColumns(headers, filename, options.requiredColumns);
    errors.push(...columnErrors);
  }

  // 3. Balance validation (for normalized CSVs or if requested)
  if (options.validateBalance !== false) {
    // Try to find balance-related columns
    const lowerHeaders = headers.map(h => h.toLowerCase());

    const depositCol = headers.find((_, i) =>
      ['deposit', 'deposits', 'credit'].includes(lowerHeaders[i])
    );
    const withdrawalCol = headers.find((_, i) =>
      ['withdrawal', 'withdrawals', 'debit'].includes(lowerHeaders[i])
    );
    const balanceCol = headers.find((_, i) =>
      ['balance', 'running balance'].includes(lowerHeaders[i])
    );
    const dateCol = headers.find((_, i) =>
      ['date', 'trans date', 'transaction date'].includes(lowerHeaders[i])
    );

    if (depositCol && withdrawalCol && balanceCol && dateCol) {
      const balanceErrors = validateBalanceConsistency(rows, filename, {
        deposit: depositCol,
        withdrawal: withdrawalCol,
        balance: balanceCol,
        date: dateCol,
      });
      errors.push(...balanceErrors);
    } else if (options.validateBalance === true) {
      warnings.push(`Could not validate balances: missing required columns`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for display.
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return '✓ Validation passed';
  }

  const lines: string[] = ['✗ Validation failed:'];

  for (const error of result.errors) {
    if (error.row) {
      lines.push(`  Row ${error.row} (${error.date}): ${error.message}`);
    } else {
      lines.push(`  ${error.file}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  return lines.join('\n');
}

// ============================================
// Custom Rules Validators
// ============================================

import type { CustomRule, SplitTransaction, SplitAllocation } from './custom-rules';

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a custom rule structure
 */
export function validateCustomRule(rule: Partial<CustomRule>): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!rule.name || rule.name.trim() === '') {
    errors.push('Rule name is required');
  }

  if (!rule.conditions || rule.conditions.length === 0) {
    errors.push('At least one condition is required');
  }

  if (!rule.action) {
    errors.push('Action is required');
  }

  // Validate conditions
  if (rule.conditions) {
    rule.conditions.forEach((cond, i) => {
      if (!cond.field) {
        errors.push(`Condition ${i + 1}: Field is required`);
      }
      if (!cond.matchType) {
        errors.push(`Condition ${i + 1}: Match type is required`);
      }
      if (cond.field !== 'amount' && (!cond.value || cond.value.trim() === '')) {
        errors.push(`Condition ${i + 1}: Value is required for non-amount conditions`);
      }
      if (cond.field === 'amount') {
        if (cond.minAmount === undefined && cond.maxAmount === undefined) {
          errors.push(`Condition ${i + 1}: Amount range (min or max) is required`);
        }
      }
      if (cond.matchType === 'regex') {
        try {
          new RegExp(cond.value || '');
        } catch {
          errors.push(`Condition ${i + 1}: Invalid regex pattern`);
        }
      }
    });
  }

  // Validate action
  if (rule.action) {
    switch (rule.action.type) {
      case 'categorize':
        if (!rule.action.category || rule.action.category.trim() === '') {
          errors.push('Categorize action requires a category');
        }
        break;
      case 'rename':
        if (!rule.action.newName || rule.action.newName.trim() === '') {
          errors.push('Rename action requires a new name');
        }
        break;
      case 'split':
        if (!rule.action.splits || rule.action.splits.length < 2) {
          errors.push('Split action requires at least 2 splits');
        } else {
          const splitValidation = validateSplitAllocations(rule.action.splits);
          errors.push(...splitValidation.errors);
          warnings.push(...splitValidation.warnings);
        }
        break;
      default:
        errors.push('Invalid action type');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate split allocations sum correctly
 */
export function validateSplitAllocations(splits: SplitAllocation[]): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (splits.length < 2) {
    errors.push('At least 2 splits are required');
    return { valid: false, errors, warnings };
  }

  // Check each split has required fields
  splits.forEach((split, i) => {
    if (!split.category || split.category.trim() === '') {
      errors.push(`Split ${i + 1}: Category is required`);
    }
    if (split.percentage === undefined && split.fixedAmount === undefined) {
      // Last split can be undefined (gets remainder)
      if (i < splits.length - 1) {
        warnings.push(`Split ${i + 1}: No percentage or fixed amount - will get remainder`);
      }
    }
    if (split.percentage !== undefined && (split.percentage < 0 || split.percentage > 100)) {
      errors.push(`Split ${i + 1}: Percentage must be between 0 and 100`);
    }
    if (split.fixedAmount !== undefined && split.fixedAmount < 0) {
      errors.push(`Split ${i + 1}: Fixed amount cannot be negative`);
    }
  });

  // Validate percentages sum to 100 or less
  const totalPercentage = splits
    .filter(s => s.percentage !== undefined)
    .reduce((sum, s) => sum + (s.percentage || 0), 0);

  if (totalPercentage > 100) {
    errors.push(`Split percentages sum to ${totalPercentage}% (must be ≤100%)`);
  } else if (totalPercentage < 100 && splits.every(s => s.percentage !== undefined)) {
    warnings.push(`Split percentages sum to ${totalPercentage}% - remainder will be uncategorized`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that split transactions balance correctly
 */
export function validateSplitTransactions(
  splits: SplitTransaction[],
  expectedTotal: number
): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const actualTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  const tolerance = 0.01;

  if (Math.abs(actualTotal - expectedTotal) > tolerance) {
    errors.push(
      `Split amounts ($${actualTotal.toFixed(2)}) don't match original ($${expectedTotal.toFixed(2)})`
    );
  }

  // Check for duplicate categories
  const categories = splits.map(s => s.category);
  const uniqueCategories = new Set(categories);
  if (uniqueCategories.size < categories.length) {
    warnings.push('Multiple splits use the same category - consider consolidating');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// IIF Validators
// ============================================

export interface IIFValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    transactionCount: number;
    splitCount: number;
    totalDebit: number;
    totalCredit: number;
  };
}

/**
 * Validate IIF content structure and balance
 */
export function validateIIF(content: string): IIFValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    transactionCount: 0,
    splitCount: 0,
    totalDebit: 0,
    totalCredit: 0,
  };

  const lines = content.split(/\r?\n/);

  // Check for required headers
  const hasHeader = lines.some(l => l.startsWith('!TRNS'));
  if (!hasHeader) {
    errors.push('Missing !TRNS header');
  }

  let inTransaction = false;
  let currentTrnsAmount = 0;
  let currentSplitsTotal = 0;
  let currentTrnsId = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('!')) continue;

    const parts = line.split('\t');
    const type = parts[0];

    if (type === 'TRNS') {
      if (inTransaction) {
        errors.push(`Line ${i + 1}: TRNS without ENDTRNS for previous transaction`);
      }
      inTransaction = true;
      stats.transactionCount++;
      currentTrnsId = parts[1] || '';
      currentTrnsAmount = parseFloat(parts[6] || '0') || 0;
      currentSplitsTotal = 0;

      if (currentTrnsAmount >= 0) {
        stats.totalCredit += currentTrnsAmount;
      } else {
        stats.totalDebit += Math.abs(currentTrnsAmount);
      }
    } else if (type === 'SPL') {
      if (!inTransaction) {
        errors.push(`Line ${i + 1}: SPL without TRNS`);
      }
      stats.splitCount++;
      const splAmount = parseFloat(parts[6] || '0') || 0;
      currentSplitsTotal += splAmount;
    } else if (type === 'ENDTRNS') {
      if (!inTransaction) {
        errors.push(`Line ${i + 1}: ENDTRNS without TRNS`);
      }

      // Validate that splits balance with TRNS
      const tolerance = 0.01;
      if (Math.abs(currentTrnsAmount + currentSplitsTotal) > tolerance) {
        errors.push(
          `Transaction ${currentTrnsId}: TRNS (${currentTrnsAmount.toFixed(2)}) + SPL (${currentSplitsTotal.toFixed(2)}) should equal 0`
        );
      }

      inTransaction = false;
    } else if (type === 'ACCNT') {
      // Account definition - valid
    } else if (type !== '') {
      warnings.push(`Line ${i + 1}: Unknown row type "${type}"`);
    }
  }

  if (inTransaction) {
    errors.push('File ends without ENDTRNS for last transaction');
  }

  if (stats.transactionCount === 0) {
    warnings.push('No transactions found in IIF file');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}
