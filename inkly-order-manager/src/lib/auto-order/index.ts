import { BaseAutoOrder } from './base';
import { MonotaroAutoOrder } from './monotaro';
import { AmazonAutoOrder } from './amazon';
import { AskulAutoOrder } from './askul';
import { FlagTattooAutoOrder } from './flag-tattoo';

const ORDER_MODULES: Record<string, new () => BaseAutoOrder> = {
  'MonotaRO': MonotaroAutoOrder,
  'Amazon': AmazonAutoOrder,
  'ASKUL': AskulAutoOrder,
  'FLAG Tattoo Supply': FlagTattooAutoOrder,
};

export function getAutoOrderModule(supplierName: string): BaseAutoOrder | null {
  const ModuleClass = ORDER_MODULES[supplierName];
  if (!ModuleClass) return null;
  return new ModuleClass();
}

export function isAutoOrderSupported(supplierName: string): boolean {
  return supplierName in ORDER_MODULES;
}

export type { AutoOrderItem, AutoOrderResult, ExecuteOrderResult } from './base';
