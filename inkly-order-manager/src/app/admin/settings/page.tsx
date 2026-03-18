'use client';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900 md:text-2xl">Settings</h1>

      <div className="max-w-lg rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Auto-order</h2>
        <p className="text-sm text-gray-600">
          Auto-order adds items to the supplier&apos;s cart automatically.
          Checkout (purchase confirmation) must be done manually via the cart URL provided after cart addition.
        </p>
        <div className="mt-4">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            Cart addition only (no auto-checkout)
          </span>
        </div>
      </div>
    </div>
  );
}
