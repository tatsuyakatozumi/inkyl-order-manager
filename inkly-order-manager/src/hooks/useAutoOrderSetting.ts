'use client';

import { useEffect, useState } from 'react';

export function useAutoOrderSetting() {
  const [autoOrderEnabled, setAutoOrderEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/settings?key=auto_order_enabled')
      .then((res) => res.json())
      .then((data) => setAutoOrderEnabled(data.value === true))
      .catch(() => setAutoOrderEnabled(true));
  }, []);

  return { autoOrderEnabled };
}
