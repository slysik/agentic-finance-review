/**
 * Custom Rules Engine
 *
 * Allows users to define custom patterns for:
 * - Renaming transactions
 * - Auto-categorizing based on patterns
 * - Splitting transactions across multiple accounts/categories
 * - Amount-based matching
 *
 * Inspired by the GRC CSV/QBO to IIF Converter pattern editor
 */

import { Transaction } from './csv-processor';

export type RuleMatchType = 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'exact';
export type RuleActionType = 'categorize' | 'rename' | 'split';

export interface RuleCondition {
  field: 'description' | 'amount' | 'category';
  matchType: RuleMatchType;
  value: string;
  // For amount matching
  minAmount?: number;
  maxAmount?: number;
}

export interface SplitAllocation {
  category: string;
  percentage?: number;  // Use percentage OR fixedAmount
  fixedAmount?: number;
  memo?: string;
}

export interface RuleAction {
  type: RuleActionType;
  // For categorize
  category?: string;
  // For rename
  newName?: string;
  // For split
  splits?: SplitAllocation[];
}

export interface CustomRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;  // Lower = higher priority
  conditions: RuleCondition[];
  conditionLogic: 'AND' | 'OR';
  action: RuleAction;
  createdAt: string;
  updatedAt: string;
}

export interface SplitTransaction extends Transaction {
  isSplit: boolean;
  splitParentId?: string;
  splitIndex?: number;
  originalAmount?: number;
  splitMemo?: string;
}

// Storage key for localStorage
const RULES_STORAGE_KEY = 'financeRules';

/**
 * Generate unique ID for rules
 */
export function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load custom rules from localStorage
 */
export function loadRules(): CustomRule[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(RULES_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored) as CustomRule[];
  } catch {
    console.error('Failed to parse stored rules');
    return [];
  }
}

/**
 * Save custom rules to localStorage
 */
export function saveRules(rules: CustomRule[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

/**
 * Add a new rule
 */
export function addRule(rule: Omit<CustomRule, 'id' | 'createdAt' | 'updatedAt'>): CustomRule {
  const rules = loadRules();
  const newRule: CustomRule = {
    ...rule,
    id: generateRuleId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  rules.push(newRule);
  saveRules(rules);
  return newRule;
}

/**
 * Update an existing rule
 */
export function updateRule(id: string, updates: Partial<CustomRule>): CustomRule | null {
  const rules = loadRules();
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) return null;

  rules[index] = {
    ...rules[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveRules(rules);
  return rules[index];
}

/**
 * Delete a rule
 */
export function deleteRule(id: string): boolean {
  const rules = loadRules();
  const filtered = rules.filter(r => r.id !== id);
  if (filtered.length === rules.length) return false;
  saveRules(filtered);
  return true;
}

/**
 * Check if a transaction matches a condition
 */
function matchesCondition(transaction: Transaction, condition: RuleCondition): boolean {
  if (condition.field === 'amount') {
    const amount = transaction.amount;
    if (condition.minAmount !== undefined && amount < condition.minAmount) return false;
    if (condition.maxAmount !== undefined && amount > condition.maxAmount) return false;
    return true;
  }

  const fieldValue = transaction[condition.field]?.toLowerCase() || '';
  const matchValue = condition.value.toLowerCase();

  switch (condition.matchType) {
    case 'contains':
      return fieldValue.includes(matchValue);
    case 'startsWith':
      return fieldValue.startsWith(matchValue);
    case 'endsWith':
      return fieldValue.endsWith(matchValue);
    case 'exact':
      return fieldValue === matchValue;
    case 'regex':
      try {
        return new RegExp(condition.value, 'i').test(fieldValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Check if a transaction matches all/any conditions of a rule
 */
function matchesRule(transaction: Transaction, rule: CustomRule): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;

  if (rule.conditionLogic === 'AND') {
    return rule.conditions.every(c => matchesCondition(transaction, c));
  } else {
    return rule.conditions.some(c => matchesCondition(transaction, c));
  }
}

/**
 * Apply a single rule to a transaction
 * Returns modified transaction(s) - may return multiple for splits
 */
function applyRule(transaction: Transaction, rule: CustomRule): SplitTransaction[] {
  const result: SplitTransaction[] = [];

  switch (rule.action.type) {
    case 'categorize':
      if (rule.action.category) {
        result.push({
          ...transaction,
          category: rule.action.category,
          isSplit: false,
        });
      }
      break;

    case 'rename':
      if (rule.action.newName) {
        result.push({
          ...transaction,
          description: rule.action.newName,
          isSplit: false,
        });
      }
      break;

    case 'split':
      if (rule.action.splits && rule.action.splits.length > 0) {
        const parentId = `split_${Date.now()}`;
        let remainingAmount = transaction.amount;

        rule.action.splits.forEach((split, index) => {
          let splitAmount: number;

          if (split.fixedAmount !== undefined) {
            splitAmount = Math.min(split.fixedAmount, remainingAmount);
          } else if (split.percentage !== undefined) {
            splitAmount = transaction.amount * (split.percentage / 100);
          } else {
            // Last split gets remainder
            splitAmount = remainingAmount;
          }

          remainingAmount -= splitAmount;

          result.push({
            ...transaction,
            amount: Math.round(splitAmount * 100) / 100,
            category: split.category,
            isSplit: true,
            splitParentId: parentId,
            splitIndex: index,
            originalAmount: transaction.amount,
            splitMemo: split.memo || `Split ${index + 1} of ${rule.action.splits!.length}`,
          });
        });

        // If there's remaining amount, add it as uncategorized
        if (remainingAmount > 0.01) {
          result.push({
            ...transaction,
            amount: Math.round(remainingAmount * 100) / 100,
            category: 'Uncategorized',
            isSplit: true,
            splitParentId: parentId,
            splitIndex: rule.action.splits.length,
            originalAmount: transaction.amount,
            splitMemo: 'Remaining amount',
          });
        }
      }
      break;
  }

  // If no action taken, return original
  if (result.length === 0) {
    result.push({ ...transaction, isSplit: false });
  }

  return result;
}

/**
 * Apply all matching rules to a transaction
 * Rules are applied in priority order
 */
export function applyRules(transaction: Transaction): SplitTransaction[] {
  const rules = loadRules()
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  let results: SplitTransaction[] = [{ ...transaction, isSplit: false }];

  for (const rule of rules) {
    const newResults: SplitTransaction[] = [];

    for (const txn of results) {
      if (matchesRule(txn, rule)) {
        newResults.push(...applyRule(txn, rule));
      } else {
        newResults.push(txn);
      }
    }

    results = newResults;
  }

  return results;
}

/**
 * Apply rules to all transactions
 */
export function applyRulesToAll(transactions: Transaction[]): SplitTransaction[] {
  const results: SplitTransaction[] = [];

  for (const txn of transactions) {
    results.push(...applyRules(txn));
  }

  return results;
}

/**
 * Create a simple categorization rule
 */
export function createCategorizationRule(
  name: string,
  pattern: string,
  category: string,
  matchType: RuleMatchType = 'contains'
): Omit<CustomRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name,
    enabled: true,
    priority: 50,
    conditions: [
      {
        field: 'description',
        matchType,
        value: pattern,
      },
    ],
    conditionLogic: 'AND',
    action: {
      type: 'categorize',
      category,
    },
  };
}

/**
 * Create a split rule
 */
export function createSplitRule(
  name: string,
  pattern: string,
  splits: SplitAllocation[],
  matchType: RuleMatchType = 'contains'
): Omit<CustomRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name,
    enabled: true,
    priority: 10, // Splits should run before categorization
    conditions: [
      {
        field: 'description',
        matchType,
        value: pattern,
      },
    ],
    conditionLogic: 'AND',
    action: {
      type: 'split',
      splits,
    },
  };
}

/**
 * Export rules for backup
 */
export function exportRules(): string {
  const rules = loadRules();
  return JSON.stringify(rules, null, 2);
}

/**
 * Import rules from backup
 */
export function importRules(json: string, merge: boolean = true): number {
  try {
    const imported = JSON.parse(json) as CustomRule[];
    if (!Array.isArray(imported)) throw new Error('Invalid format');

    if (merge) {
      const existing = loadRules();
      const existingIds = new Set(existing.map(r => r.id));
      const newRules = imported.filter(r => !existingIds.has(r.id));
      saveRules([...existing, ...newRules]);
      return newRules.length;
    } else {
      saveRules(imported);
      return imported.length;
    }
  } catch (e) {
    console.error('Failed to import rules:', e);
    return 0;
  }
}
