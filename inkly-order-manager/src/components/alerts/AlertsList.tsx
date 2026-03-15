'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

type AlertType = 'low_stock' | 'out_of_stock' | 'ordered';

type AlertRow = {
  id: string;
  alert_type: AlertType;
  raw_message: string;
  parsed_item_name: string | null;
  parsed_quantity: number | null;
  slack_user_id: string | null;
  reported_at: string;
  item: { id: string; name: string } | null;
};

interface AlertsListProps {
  alerts: AlertRow[];
}

const ALERT_TYPE_CONFIG: Record<AlertType, { label: string; className: string }> = {
  low_stock: { label: 'Low', className: 'bg-yellow-100 text-yellow-800' },
  out_of_stock: { label: 'Out', className: 'bg-red-100 text-red-800' },
  ordered: { label: 'Ordered', className: 'bg-green-100 text-green-800' },
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
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {([
          { key: 'all', label: 'All' },
          { key: 'low_stock', label: 'Low' },
          { key: 'out_of_stock', label: 'Out' },
          { key: 'ordered', label: 'Ordered' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            className={`min-h-[44px] rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filterType === key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">{filtered.length} rows</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Reported At</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Message</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Slack User</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No alerts found.
                </td>
              </tr>
            )}
            {paginated.map((alert) => {
              const config = ALERT_TYPE_CONFIG[alert.alert_type];
              const itemName = alert.item?.name ?? alert.parsed_item_name ?? '-';
              const isExpanded = expandedId === alert.id;

              return (
                <tr key={alert.id} className="group transition-colors hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(alert.reported_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{itemName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {alert.parsed_quantity != null ? alert.parsed_quantity : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {isExpanded ? alert.raw_message : truncate(alert.raw_message, 50)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{alert.slack_user_id ?? '-'}</td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => toggleExpand(alert.id)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
