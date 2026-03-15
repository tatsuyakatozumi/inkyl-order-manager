'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { Supplier } from '@/types/database';
import { updateSupplier, getSupplierCredentials } from '@/app/admin/suppliers/actions';
import { useRouter } from 'next/navigation';

interface SupplierEditModalProps {
  supplier: Supplier;
  onClose: () => void;
}

export function SupplierEditModal({ supplier, onClose }: SupplierEditModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(supplier.name);
  const [orderCycle, setOrderCycle] = useState<'monthly' | 'irregular'>(
    supplier.order_cycle
  );
  const [autoOrderSupported, setAutoOrderSupported] = useState(
    supplier.auto_order_supported
  );
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasExistingCredentials, setHasExistingCredentials] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [leadTimeDays, setLeadTimeDays] = useState(
    supplier.lead_time_days?.toString() ?? ''
  );
  const [notes, setNotes] = useState(supplier.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  // Load existing credentials on mount
  useEffect(() => {
    if (!supplier.credentials_encrypted) {
      setCredentialsLoaded(true);
      return;
    }
    setHasExistingCredentials(true);
    (async () => {
      const result = await getSupplierCredentials(supplier.id);
      if (result.success && result.data) {
        setLoginId(result.data.username);
        setPassword(result.data.password);
      }
      setCredentialsLoaded(true);
    })();
  }, [supplier.id, supplier.credentials_encrypted]);

  const handleSave = () => {
    setError(null);

    startTransition(async () => {
      const data: Record<string, unknown> = {
        name,
        order_cycle: orderCycle,
        auto_order_supported: autoOrderSupported,
        lead_time_days: leadTimeDays ? Number(leadTimeDays) : null,
        notes: notes || null,
      };

      if (loginId || password) {
        data.credentials = JSON.stringify({ username: loginId, password });
      }

      const result = await updateSupplier(supplier.id, data);

      if (!result.success) {
        setError(result.error ?? '更新に失敗しました');
        return;
      }

      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="h-full w-full overflow-y-auto bg-white shadow-xl md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            サプライヤー編集
          </h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              サプライヤー名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Order Cycle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              発注サイクル
            </label>
            <select
              value={orderCycle}
              onChange={(e) =>
                setOrderCycle(e.target.value as 'monthly' | 'irregular')
              }
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="monthly">月次</option>
              <option value="irregular">不定期</option>
            </select>
          </div>

          {/* Auto Order Supported */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">
              自動発注対応
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={autoOrderSupported}
              onClick={() => setAutoOrderSupported(!autoOrderSupported)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                autoOrderSupported ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  autoOrderSupported ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Login ID */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ログインID
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder={credentialsLoaded ? '' : '読み込み中...'}
              disabled={!credentialsLoaded}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
            {hasExistingCredentials && credentialsLoaded && !loginId && (
              <p className="mt-1 text-xs text-gray-400">設定済み。変更する場合は再入力してください</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={credentialsLoaded ? '' : '読み込み中...'}
                disabled={!credentialsLoaded}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 min-h-[36px] min-w-[36px] -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {hasExistingCredentials && credentialsLoaded && !password && (
              <p className="mt-1 text-xs text-gray-400">設定済み。変更する場合は再入力してください</p>
            )}
          </div>

          {/* Lead Time Days */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              リードタイム（日）
            </label>
            <input
              type="number"
              min={0}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              備考
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            disabled={isPending}
            className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
