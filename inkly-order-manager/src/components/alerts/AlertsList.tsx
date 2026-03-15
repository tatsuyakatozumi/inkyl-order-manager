'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { StockAlertWithItem, AlertType } from '@/types/database';

interface AlertsListProps {
  alerts: StockAlertWithItem[];
}

const ALERT_TYPE_CONFIG: Record<
  AlertType,
  { label: string; className: string }
> = {
  low_stock: {
    label: '残少',
    className: 'bg-yellow-100 text-yellow-800',
  },
  out_of_stock: {
    label: '切れ',
    className: 'bg-red-100 text-red-800',
  },
  ordered: {
    label: '発注済',
    className: 'bg-green-100 text-green-800',
  },
};

const PAGE_SIZE = 50;

export function AlertsList({ alerts }: AlertsListProps) {
  const [filterType, setFilterType] = useState<AlertType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filterType === 'all') return alerts;
    return alerts.filter((a) => a.alert_type === filterType);
  }, [alerts, filterType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(type: AlertType | 'all') {
    setFilterType(type);
    setPage(1);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function truncate(text: string, max: number) {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  }

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">絞り込み:</span>
        {(
          [
            { key: 'all', label: 'すべて' },
            { key: 'low_stock', label: '残少' },
            { key: 'out_of_stock', label: '切れ' },
            { key: 'ordered', label: '発注済' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filterType === key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} 件
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                報告日時
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                種別
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                品目名
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">
                数量
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                元メッセージ
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                Slackユーザー
              </th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  該当する報告がありません
                </td>
              </tr>
            )}
            {paginated.map((alert) => {
              const config = ALERT_TYPE_CONFIG[alert.alert_type];
              const itemName =
                alert.item?.name ?? alert.parsed_item_name ?? '-';
              const isExpanded = expandedId === alert.id;

              return (
                <tr
                  key={alert.id}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {formatDate(alert.reported_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
                    >
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {itemName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {alert.parsed_quantity != null ? alert.parsed_quantity : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>
                      {isExpanded
                        ? alert.raw_message
                        : truncate(alert.raw_message, 40)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {alert.slack_user_id ?? '-'}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => toggleExpand(alert.id)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      aria-label={isExpanded ? '折りたたむ' : '展開する'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
