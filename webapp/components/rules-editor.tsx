'use client';

import React, { useState, useEffect } from 'react';
import {
  loadRules,
  saveRules,
  deleteRule,
  generateRuleId,
  type CustomRule,
  type RuleCondition,
  type RuleAction,
  type SplitAllocation,
  type RuleMatchType,
  type RuleActionType,
} from '@/lib/custom-rules';
import { validateCustomRule, type RuleValidationResult } from '@/lib/validators';

interface RulesEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onRulesChange?: () => void;
}

const MATCH_TYPES: { value: RuleMatchType; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'regex', label: 'Regex' },
];

const ACTION_TYPES: { value: RuleActionType; label: string }[] = [
  { value: 'categorize', label: 'Set Category' },
  { value: 'rename', label: 'Rename Transaction' },
  { value: 'split', label: 'Split Transaction' },
];

const CATEGORIES = [
  'Groceries', 'Restaurants and Dining', 'Entertainment', 'Gas', 'Travel',
  'Utilities', 'Cable', 'Phone', 'Insurance', 'Healthcare',
  'Subscriptions and Renewals', 'Services and Supplies', 'Software & Services',
  'General Merchandise', 'Clothing', 'Personal Care', 'Home Improvement',
  'Loans', 'Transfers', 'ATM', 'Fees', 'Salary', 'Other Income', 'Interest',
  'Refund', 'Uncategorized',
];

function EmptyCondition(): RuleCondition {
  return {
    field: 'description',
    matchType: 'contains',
    value: '',
  };
}

function EmptySplit(): SplitAllocation {
  return {
    category: 'Uncategorized',
    percentage: 50,
  };
}

function EmptyRule(): Partial<CustomRule> {
  return {
    name: '',
    enabled: true,
    priority: 50,
    conditions: [EmptyCondition()],
    conditionLogic: 'AND',
    action: {
      type: 'categorize',
      category: 'Uncategorized',
    },
  };
}

export function RulesEditor({ isOpen, onClose, onRulesChange }: RulesEditorProps) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<CustomRule> | null>(null);
  const [validation, setValidation] = useState<RuleValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'edit'>('list');

  useEffect(() => {
    if (isOpen) {
      setRules(loadRules());
    }
  }, [isOpen]);

  const handleSaveRule = () => {
    if (!editingRule) return;

    const result = validateCustomRule(editingRule);
    setValidation(result);

    if (!result.valid) return;

    const now = new Date().toISOString();
    const ruleToSave: CustomRule = {
      id: editingRule.id || generateRuleId(),
      name: editingRule.name || '',
      enabled: editingRule.enabled ?? true,
      priority: editingRule.priority ?? 50,
      conditions: editingRule.conditions || [],
      conditionLogic: editingRule.conditionLogic || 'AND',
      action: editingRule.action as RuleAction,
      createdAt: editingRule.createdAt || now,
      updatedAt: now,
    };

    const existingIndex = rules.findIndex(r => r.id === ruleToSave.id);
    let newRules: CustomRule[];

    if (existingIndex >= 0) {
      newRules = [...rules];
      newRules[existingIndex] = ruleToSave;
    } else {
      newRules = [...rules, ruleToSave];
    }

    setRules(newRules);
    saveRules(newRules);
    setEditingRule(null);
    setValidation(null);
    setActiveTab('list');
    onRulesChange?.();
  };

  const handleDeleteRule = (id: string) => {
    if (confirm('Delete this rule?')) {
      deleteRule(id);
      setRules(loadRules());
      onRulesChange?.();
    }
  };

  const handleToggleEnabled = (id: string) => {
    const newRules = rules.map(r =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    );
    setRules(newRules);
    saveRules(newRules);
    onRulesChange?.();
  };

  const addCondition = () => {
    if (!editingRule) return;
    setEditingRule({
      ...editingRule,
      conditions: [...(editingRule.conditions || []), EmptyCondition()],
    });
  };

  const removeCondition = (index: number) => {
    if (!editingRule?.conditions) return;
    setEditingRule({
      ...editingRule,
      conditions: editingRule.conditions.filter((_, i) => i !== index),
    });
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    if (!editingRule?.conditions) return;
    const newConditions = [...editingRule.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setEditingRule({ ...editingRule, conditions: newConditions });
  };

  const addSplit = () => {
    if (!editingRule?.action?.splits) return;
    setEditingRule({
      ...editingRule,
      action: {
        ...editingRule.action,
        splits: [...editingRule.action.splits, EmptySplit()],
      },
    });
  };

  const removeSplit = (index: number) => {
    if (!editingRule?.action?.splits) return;
    setEditingRule({
      ...editingRule,
      action: {
        ...editingRule.action,
        splits: editingRule.action.splits.filter((_, i) => i !== index),
      },
    });
  };

  const updateSplit = (index: number, updates: Partial<SplitAllocation>) => {
    if (!editingRule?.action?.splits) return;
    const newSplits = [...editingRule.action.splits];
    newSplits[index] = { ...newSplits[index], ...updates };
    setEditingRule({
      ...editingRule,
      action: { ...editingRule.action, splits: newSplits },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Custom Rules Editor
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => { setActiveTab('list'); setEditingRule(null); }}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'list'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Rules ({rules.length})
          </button>
          <button
            onClick={() => { setActiveTab('edit'); if (!editingRule) setEditingRule(EmptyRule()); }}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'edit'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {editingRule?.id ? 'Edit Rule' : 'New Rule'}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {activeTab === 'list' && (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No custom rules yet.</p>
                  <button
                    onClick={() => { setEditingRule(EmptyRule()); setActiveTab('edit'); }}
                    className="mt-4 text-blue-600 hover:underline"
                  >
                    Create your first rule
                  </button>
                </div>
              ) : (
                rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border ${
                      rule.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleEnabled(rule.id)}
                          className={`w-10 h-6 rounded-full transition-colors ${
                            rule.enabled ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              rule.enabled ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <div>
                          <p className={`font-medium ${rule.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                            {rule.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {rule.action.type === 'categorize' && `Set category to "${rule.action.category}"`}
                            {rule.action.type === 'rename' && `Rename to "${rule.action.newName}"`}
                            {rule.action.type === 'split' && `Split into ${rule.action.splits?.length} parts`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingRule(rule); setActiveTab('edit'); }}
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'edit' && editingRule && (
            <div className="space-y-6">
              {/* Validation Errors */}
              {validation && !validation.valid && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="font-medium text-red-800 mb-2">Please fix the following errors:</p>
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rule Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={editingRule.name || ''}
                  onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Costco Split Rule"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority (lower = runs first)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editingRule.priority || 50}
                  onChange={e => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 50 })}
                  className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Conditions
                  </label>
                  <select
                    value={editingRule.conditionLogic || 'AND'}
                    onChange={e => setEditingRule({ ...editingRule, conditionLogic: e.target.value as 'AND' | 'OR' })}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg"
                  >
                    <option value="AND">Match ALL</option>
                    <option value="OR">Match ANY</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {editingRule.conditions?.map((cond, i) => (
                    <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                      <select
                        value={cond.field}
                        onChange={e => updateCondition(i, { field: e.target.value as RuleCondition['field'] })}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="description">Description</option>
                        <option value="category">Category</option>
                        <option value="amount">Amount</option>
                      </select>

                      {cond.field !== 'amount' ? (
                        <>
                          <select
                            value={cond.matchType}
                            onChange={e => updateCondition(i, { matchType: e.target.value as RuleMatchType })}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            {MATCH_TYPES.map(mt => (
                              <option key={mt.value} value={mt.value}>{mt.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={cond.value || ''}
                            onChange={e => updateCondition(i, { value: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="Pattern to match..."
                          />
                        </>
                      ) : (
                        <>
                          <input
                            type="number"
                            value={cond.minAmount ?? ''}
                            onChange={e => updateCondition(i, { minAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="Min $"
                          />
                          <span className="py-2">to</span>
                          <input
                            type="number"
                            value={cond.maxAmount ?? ''}
                            onChange={e => updateCondition(i, { maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="Max $"
                          />
                        </>
                      )}

                      <button
                        onClick={() => removeCondition(i)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        disabled={(editingRule.conditions?.length || 0) <= 1}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addCondition}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  + Add Condition
                </button>
              </div>

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action
                </label>

                <select
                  value={editingRule.action?.type || 'categorize'}
                  onChange={e => {
                    const type = e.target.value as RuleActionType;
                    const newAction: RuleAction = { type };
                    if (type === 'categorize') newAction.category = 'Uncategorized';
                    if (type === 'rename') newAction.newName = '';
                    if (type === 'split') newAction.splits = [EmptySplit(), EmptySplit()];
                    setEditingRule({ ...editingRule, action: newAction });
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg mb-3"
                >
                  {ACTION_TYPES.map(at => (
                    <option key={at.value} value={at.value}>{at.label}</option>
                  ))}
                </select>

                {/* Action-specific fields */}
                {editingRule.action?.type === 'categorize' && (
                  <select
                    value={editingRule.action.category || 'Uncategorized'}
                    onChange={e => setEditingRule({
                      ...editingRule,
                      action: { ...editingRule.action!, category: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}

                {editingRule.action?.type === 'rename' && (
                  <input
                    type="text"
                    value={editingRule.action.newName || ''}
                    onChange={e => setEditingRule({
                      ...editingRule,
                      action: { ...editingRule.action!, newName: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                    placeholder="New transaction name..."
                  />
                )}

                {editingRule.action?.type === 'split' && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      Split this transaction into multiple categories:
                    </p>
                    {editingRule.action.splits?.map((split, i) => (
                      <div key={i} className="flex gap-2 items-center p-3 bg-gray-50 rounded-lg">
                        <select
                          value={split.category}
                          onChange={e => updateSplit(i, { category: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={split.percentage ?? ''}
                          onChange={e => updateSplit(i, {
                            percentage: e.target.value ? parseFloat(e.target.value) : undefined,
                            fixedAmount: undefined,
                          })}
                          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          placeholder="%"
                        />
                        <span className="text-gray-500">%</span>
                        <span className="text-gray-400">or</span>
                        <span className="text-gray-500">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.fixedAmount ?? ''}
                          onChange={e => updateSplit(i, {
                            fixedAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                            percentage: undefined,
                          })}
                          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          placeholder="Fixed"
                        />
                        <button
                          onClick={() => removeSplit(i)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          disabled={(editingRule.action?.splits?.length || 0) <= 2}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addSplit}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      + Add Split
                    </button>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSaveRule}
                  className="flex-1 btn-primary"
                >
                  Save Rule
                </button>
                <button
                  onClick={() => { setEditingRule(null); setActiveTab('list'); setValidation(null); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
