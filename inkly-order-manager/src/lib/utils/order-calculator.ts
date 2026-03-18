export interface OrderCalculationInput {
  expectedVisitors: number;
  consumptionPerVisit: number | null;
  isVisitorLinked: boolean;
  fixedMonthlyConsumption: number | null;
  orderUnitQuantity: number;
  inventoryQuantity: number | null;
  adjustment: number;
}

export interface OrderCalculationResult {
  requiredQuantity6w: number;
  requiredQuantity4w: number;
  orderQuantity: number;
  finalQuantity: number;
}

export function calculateOrderQuantity(input: OrderCalculationInput): OrderCalculationResult {
  // 1. Monthly consumption
  let monthlyConsumption: number;
  if (input.isVisitorLinked && input.consumptionPerVisit !== null) {
    monthlyConsumption = input.consumptionPerVisit * input.expectedVisitors;
  } else if (!input.isVisitorLinked && input.fixedMonthlyConsumption !== null) {
    monthlyConsumption = input.fixedMonthlyConsumption;
  } else {
    return { requiredQuantity6w: 0, requiredQuantity4w: 0, orderQuantity: 0, finalQuantity: 0 };
  }

  // 2. Convert to order units
  const unitQty = input.orderUnitQuantity > 0 ? input.orderUnitQuantity : 1;
  const required6w = Math.ceil((monthlyConsumption * 1.5) / unitQty);
  const required4w = Math.ceil(monthlyConsumption / unitQty);

  // 3. Calculate order quantity
  let orderQuantity: number;
  if (input.inventoryQuantity !== null) {
    // First order with inventory data: 6 weeks - current inventory
    orderQuantity = Math.max(required6w - input.inventoryQuantity, 0);
  } else {
    // Subsequent orders: 4 weeks
    orderQuantity = required4w;
  }

  // 4. Apply adjustment
  const finalQuantity = Math.max(orderQuantity - input.adjustment, 0);

  return { requiredQuantity6w: required6w, requiredQuantity4w: required4w, orderQuantity, finalQuantity };
}
