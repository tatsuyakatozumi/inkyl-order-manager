'use client';

import { useCallback, useEffect, useState } from 'react';

export default function SettingsPage() {
  const [autoOrderEnabled, setAutoOrderEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings?key=auto_order_enabled')
      .then((res) => res.json())
      .then((data) => setAutoOrderEnabled(data.value === true))
      .catch(() => setAutoOrderEnabled(true));
  }, []);

  const handleToggle = useCallback(async () => {
    const newValue = !autoOrderEnabled;
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'auto_order_enabled', value: newValue }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setAutoOrderEnabled(newValue);
    } catch {
      alert('Failed to save setting.');
    } finally {
      setSaving(false);
    }
  }, [autoOrderEnabled]);

  if (autoOrderEnabled === null) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-gray-900 md:text-2xl">Settings</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900 md:text-2xl">Settings</h1>

      <div className="max-w-lg rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Auto-order (Checkout)</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Enable automatic checkout
            </p>
            <p className="mt-1 text-xs text-gray-500">
              When OFF, &quot;Confirm order&quot; buttons are disabled across all pages.
              Cart addition still works.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoOrderEnabled}
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
              autoOrderEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                autoOrderEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-4">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              autoOrderEnabled
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {autoOrderEnabled ? 'Checkout: ON' : 'Checkout: OFF'}
          </span>
        </div>
      </div>
    </div>
  );
}
