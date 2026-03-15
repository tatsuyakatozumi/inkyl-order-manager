'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  History,
  Package,
  BarChart3,
  Building2,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
} from 'lucide-react';

const menuItems = [
  { icon: ClipboardList, label: '月次発注', href: '/admin/orders' },
  { icon: ShoppingCart, label: '臨時発注', href: '/admin/orders/adhoc' },
  { icon: History, label: '発注履歴', href: '/admin/orders/history' },
  { icon: Package, label: '品目マスター', href: '/admin/items' },
  { icon: BarChart3, label: '棚卸し', href: '/admin/inventory' },
  { icon: Building2, label: 'サプライヤー', href: '/admin/suppliers' },
  { icon: AlertTriangle, label: '在庫報告', href: '/admin/alerts' },
  { icon: TrendingUp, label: '分析', href: '/admin/analytics' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin/orders') {
      return pathname === '/admin/orders';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-[240px] shrink-0 bg-gray-900 text-gray-300">
        <div className="px-6 py-6">
          <h1 className="text-xl font-bold text-white">発注管理</h1>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-800 text-white'
                    : 'hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50 min-h-screen p-8">{children}</main>
    </div>
  );
}
