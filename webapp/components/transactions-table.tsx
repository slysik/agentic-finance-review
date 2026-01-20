'use client';

import React, { useState, useMemo } from 'react';
import { Transaction } from '@/lib/csv-processor';

interface TransactionsTableProps {
  transactions: Transaction[];
  className?: string;
}

type SortField = 'date' | 'description' | 'category' | 'amount' | 'balance';
type SortDirection = 'asc' | 'desc';

export function TransactionsTable({ transactions, className = '' }: TransactionsTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filter, setFilter] = useState('');

  const filteredAndSorted = useMemo(() => {
    let result = [...transactions];

    // Filter by search term
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(t =>
        t.description.toLowerCase().includes(lowerFilter) ||
        t.category.toLowerCase().includes(lowerFilter)
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'description':
          cmp = a.description.localeCompare(b.description);
          break;
        case 'category':
          cmp = a.category.localeCompare(b.category);
          break;
        case 'amount':
          const aVal = a.type === 'income' ? a.amount : -a.amount;
          const bVal = b.type === 'income' ? b.amount : -b.amount;
          cmp = aVal - bVal;
          break;
        case 'balance':
          cmp = a.balance - b.balance;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, sortField, sortDirection, filter]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField) {
      return <span className="text-gray-300 ml-1">⇅</span>;
    }
    return (
      <span className="text-emerald-500 ml-1">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const formatAmount = (t: Transaction) => {
    const sign = t.type === 'income' ? '+' : '-';
    const colorClass = t.type === 'income' ? 'text-emerald-600' : 'text-red-500';
    return (
      <span className={colorClass}>
        {sign}${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-2xl shadow-md overflow-hidden ${className}`}>
      <div className="p-6 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Transactions
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredAndSorted.length} of {transactions.length})
            </span>
          </h3>
          <input
            type="text"
            placeholder="Search transactions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th
                onClick={() => handleSort('date')}
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              >
                Date <SortIcon field="date" />
              </th>
              <th
                onClick={() => handleSort('description')}
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              >
                Description <SortIcon field="description" />
              </th>
              <th
                onClick={() => handleSort('category')}
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              >
                Category <SortIcon field="category" />
              </th>
              <th
                onClick={() => handleSort('amount')}
                className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              >
                Amount <SortIcon field="amount" />
              </th>
              <th
                onClick={() => handleSort('balance')}
                className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              >
                Balance <SortIcon field="balance" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredAndSorted.slice(0, 100).map((t, idx) => (
              <tr
                key={`${t.date}-${t.description}-${idx}`}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(t.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                  {t.description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {t.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                  {formatAmount(t)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                  ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSorted.length > 100 && (
          <div className="p-4 text-center text-sm text-gray-500 bg-gray-50">
            Showing 100 of {filteredAndSorted.length} transactions
          </div>
        )}

        {filteredAndSorted.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No transactions found matching &quot;{filter}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
