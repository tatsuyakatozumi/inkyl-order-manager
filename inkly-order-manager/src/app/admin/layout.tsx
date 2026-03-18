'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  History,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  TrendingUp,
  X,
} from 'lucide-react';

const menuItems = [
  { icon: ClipboardList, label: 'Monthly Orders', href: '/admin/orders' },
  { icon: ShoppingCart, label: 'Adhoc Orders', href: '/admin/orders/adhoc' },
  { icon: History, label: 'Order History', href: '/admin/orders/history' },
  { icon: Package, label: 'Items', href: '/admin/items' },
  { icon: BarChart3, label: 'Inventory', href: '/admin/inventory' },
  { icon: Building2, label: 'Suppliers', href: '/admin/suppliers' },
  { icon: AlertTriangle, label: 'Alerts', href: '/admin/alerts' },
  { icon: TrendingUp, label: 'Analytics', href: '/admin/analytics' },
  { icon: Settings, label: 'Settings', href: '/admin/settings' },
];

type SideNavProps = {
  pathname: string;
  onNavigate?: () => void;
};

function SideNav({ pathname, onNavigate }: SideNavProps) {
  const isActive = (href: string) => {
    if (href === '/admin/orders') return pathname === '/admin/orders';
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
      <div className="flex flex-col gap-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto pt-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </nav>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-300 text-gray-700"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold text-gray-900">Order Manager</h1>
        <div className="min-h-[44px] min-w-[44px]" />
      </header>

      <div className="flex min-h-[calc(100vh-57px)] md:min-h-screen">
        <aside className="hidden w-[240px] shrink-0 flex-col bg-gray-900 pt-4 md:flex">
          <div className="px-6 pb-4">
            <h1 className="text-xl font-bold text-white">Order Manager</h1>
          </div>
          <SideNav pathname={pathname} />
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
            />
            <aside className="relative z-10 flex h-full w-[280px] flex-col bg-gray-900 pt-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between px-6">
                <h1 className="text-lg font-bold text-white">Order Manager</h1>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-700 text-gray-200"
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SideNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="w-full flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
