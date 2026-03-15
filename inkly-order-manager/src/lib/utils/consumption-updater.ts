export async function updateConsumptionRates(
  supabase: any
): Promise<{ updated: string[]; alerted: string[] }> {
  const updated: string[] = [];
  const alerted: string[] = [];

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sinceDate = sixMonthsAgo.toISOString().split("T")[0];

  // Query order history grouped by item for the last 6 months
  const { data: orderData, error: orderError } = await supabase
    .from("ord_order_history")
    .select("item_id, quantity, order_date")
    .gte("order_date", sinceDate);

  if (orderError) {
    throw new Error(`Failed to fetch order history: ${orderError.message}`);
  }

  // Query visitor stats for the same period
  const { data: visitorData, error: visitorError } = await supabase
    .from("ord_visitor_stats")
    .select("date, visitor_count")
    .gte("date", sinceDate);

  if (visitorError) {
    throw new Error(`Failed to fetch visitor stats: ${visitorError.message}`);
  }

  // Calculate total visitors over the period
  const totalVisitors = (visitorData as Array<{ date: string; visitor_count: number }>).reduce(
    (sum: number, row: { visitor_count: number }) => sum + row.visitor_count,
    0
  );

  if (totalVisitors === 0) {
    return { updated, alerted };
  }

  // Aggregate total quantity consumed per item
  const quantityByItem = new Map<string, number>();
  for (const row of orderData as Array<{ item_id: string; quantity: number; order_date: string }>) {
    const current = quantityByItem.get(row.item_id) || 0;
    quantityByItem.set(row.item_id, current + row.quantity);
  }

  // Fetch current items to compare rates
  const itemIds = Array.from(quantityByItem.keys());
  if (itemIds.length === 0) {
    return { updated, alerted };
  }

  const { data: items, error: itemsError } = await supabase
    .from("ord_items")
    .select("id, name, consumption_per_visit")
    .in("id", itemIds);

  if (itemsError) {
    throw new Error(`Failed to fetch items: ${itemsError.message}`);
  }

  for (const item of items as Array<{ id: string; name: string; consumption_per_visit: number | null }>) {
    const totalQuantity = quantityByItem.get(item.id);
    if (!totalQuantity) continue;

    const newRate = totalQuantity / totalVisitors;
    const previousRate = item.consumption_per_visit;

    // Update the consumption rate
    const { error: updateError } = await supabase
      .from("ord_items")
      .update({ consumption_per_visit: newRate })
      .eq("id", item.id);

    if (updateError) {
      alerted.push(`${item.name}: failed to update - ${updateError.message}`);
      continue;
    }

    updated.push(item.name);

    // Alert if rate changed significantly (more than 30% change)
    if (previousRate !== null && previousRate > 0) {
      const changeRatio = Math.abs(newRate - previousRate) / previousRate;
      if (changeRatio > 0.3) {
        const direction = newRate > previousRate ? "increased" : "decreased";
        const pct = Math.round(changeRatio * 100);
        alerted.push(
          `${item.name}: consumption rate ${direction} by ${pct}% (${previousRate.toFixed(4)} -> ${newRate.toFixed(4)})`
        );
      }
    }
  }

  return { updated, alerted };
}
