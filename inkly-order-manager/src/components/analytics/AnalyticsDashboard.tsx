'use client';

import { DollarSign, Package, TrendingUp, Users } from 'lucide-react';

interface AnalyticsDashboardProps {
  totalItems: number;
  monthlySupplierCount: number;
  expectedVisitors: number | null;
  lastMonthTotal: number;
  visitorStats: { year_month: string; actual_visitors: number }[];
  supplierOrderSummary: { name: string; total: number }[];
  topItems: { name: string; totalQty: number }[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('ja-JP').format(n);
}

export function AnalyticsDashboard({
  totalItems,
  monthlySupplierCount,
  expectedVisitors,
  lastMonthTotal,
  visitorStats,
  supplierOrderSummary,
  topItems,
}: AnalyticsDashboardProps) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Package className="h-6 w-6 text-blue-600" />}
          label="Active Items"
          value={formatNumber(totalItems)}
          bgColor="bg-blue-50"
        />
        <SummaryCard
          icon={<TrendingUp className="h-6 w-6 text-green-600" />}
          label="Monthly Suppliers"
          value={formatNumber(monthlySupplierCount)}
          bgColor="bg-green-50"
        />
        <SummaryCard
          icon={<Users className="h-6 w-6 text-sky-600" />}
          label="Current Expected Visitors"
          value={expectedVisitors !== null ? formatNumber(expectedVisitors) : 'N/A'}
          bgColor="bg-sky-50"
        />
        <SummaryCard
          icon={<DollarSign className="h-6 w-6 text-orange-600" />}
          label="Last Month Spend"
          value={formatCurrency(lastMonthTotal)}
          bgColor="bg-orange-50"
        />
      </div>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 md:px-6 md:py-4">
          <h2 className="text-base font-semibold text-gray-800 md:text-lg">Visitor Trend</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 md:px-6">Month</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700 md:px-6">Visitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visitorStats.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-gray-500">No data</td>
                </tr>
              ) : (
                visitorStats.map((row) => (
                  <tr key={row.year_month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 md:px-6">{row.year_month}</td>
                    <td className="px-4 py-3 text-right text-gray-800 md:px-6">{formatNumber(row.actual_visitors)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 md:px-6 md:py-4">
          <h2 className="text-base font-semibold text-gray-800 md:text-lg">Supplier Spend (3 months)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 md:px-6">Supplier</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700 md:px-6">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {supplierOrderSummary.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-gray-500">No data</td>
                </tr>
              ) : (
                supplierOrderSummary.map((row) => (
                  <tr key={row.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 md:px-6">{row.name}</td>
                    <td className="px-4 py-3 text-right text-gray-800 md:px-6">{formatCurrency(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 md:px-6 md:py-4">
          <h2 className="text-base font-semibold text-gray-800 md:text-lg">Top Items by Quantity (3 months)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 md:px-6">Rank</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 md:px-6">Item</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700 md:px-6">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">No data</td>
                </tr>
              ) : (
                topItems.map((row, index) => (
                  <tr key={row.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 md:px-6">{index + 1}</td>
                    <td className="px-4 py-3 text-gray-800 md:px-6">{row.name}</td>
                    <td className="px-4 py-3 text-right text-gray-800 md:px-6">{formatNumber(row.totalQty)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${bgColor}`}>{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900 md:text-2xl">{value}</p>
        </div>
      </div>
    </div>
  );
}
