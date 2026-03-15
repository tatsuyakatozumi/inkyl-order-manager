'use client';

import { TrendingUp, Users, Package, DollarSign } from 'lucide-react';

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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Package className="h-6 w-6 text-blue-600" />}
          label="総品目数"
          value={formatNumber(totalItems)}
          bgColor="bg-blue-50"
        />
        <SummaryCard
          icon={<TrendingUp className="h-6 w-6 text-green-600" />}
          label="月次発注サプライヤー数"
          value={formatNumber(monthlySupplierCount)}
          bgColor="bg-green-50"
        />
        <SummaryCard
          icon={<Users className="h-6 w-6 text-purple-600" />}
          label="今月の予想来客数"
          value={expectedVisitors !== null ? formatNumber(expectedVisitors) : '未登録'}
          bgColor="bg-purple-50"
        />
        <SummaryCard
          icon={<DollarSign className="h-6 w-6 text-orange-600" />}
          label="先月の発注総額"
          value={formatCurrency(lastMonthTotal)}
          bgColor="bg-orange-50"
        />
      </div>

      {/* Visitor Trend */}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-800">来客数推移</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  年月
                </th>
                <th className="px-6 py-3 text-right font-semibold text-gray-700">
                  来客数
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visitorStats.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                visitorStats.map((row) => (
                  <tr key={row.year_month} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-800">{row.year_month}</td>
                    <td className="px-6 py-3 text-right text-gray-800">
                      {formatNumber(row.actual_visitors)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Supplier Order Amounts */}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-800">
            サプライヤー別発注金額（直近3ヶ月）
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  サプライヤー名
                </th>
                <th className="px-6 py-3 text-right font-semibold text-gray-700">
                  発注金額合計
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {supplierOrderSummary.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                supplierOrderSummary.map((row) => (
                  <tr key={row.name} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-800">{row.name}</td>
                    <td className="px-6 py-3 text-right text-gray-800">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Items by Consumption */}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-800">
            消費量上位品目（直近3ヶ月）
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  順位
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  品目名
                </th>
                <th className="px-6 py-3 text-right font-semibold text-gray-700">
                  発注数量合計
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                topItems.map((row, index) => (
                  <tr key={row.name} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-600">{index + 1}</td>
                    <td className="px-6 py-3 text-gray-800">{row.name}</td>
                    <td className="px-6 py-3 text-right text-gray-800">
                      {formatNumber(row.totalQty)}
                    </td>
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
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
