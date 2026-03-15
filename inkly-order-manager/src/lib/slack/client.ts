const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

function getToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN environment variable is not set");
  }
  return token;
}

function getOrdersChannel(): string {
  const channel = process.env.SLACK_CHANNEL_ORDERS;
  if (!channel) {
    throw new Error("SLACK_CHANNEL_ORDERS environment variable is not set");
  }
  return channel;
}

export async function sendMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const token = getToken();

  const body: Record<string, string> = { channel, text };
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const response = await fetch(SLACK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

export async function sendMonthlyOrderSummary(
  yearMonth: string,
  ordersBySupplier: Record<
    string,
    Array<{ name: string; quantity: number; amount: number }>
  >
): Promise<void> {
  const channel = getOrdersChannel();

  const supplierEntries = Object.entries(ordersBySupplier);
  let totalItems = 0;
  let grandTotal = 0;

  const supplierBlocks = supplierEntries
    .map(([supplier, items]) => {
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      totalItems += itemCount;
      grandTotal += subtotal;

      const itemLines = items
        .map(
          (item) =>
            `  - ${item.name}: x${item.quantity} - $${item.amount.toFixed(2)}`
        )
        .join("\n");

      return `*${supplier}*\n${itemLines}\n  _Subtotal: $${subtotal.toFixed(2)}_`;
    })
    .join("\n\n");

  const text =
    `:clipboard: *Monthly Order Summary - ${yearMonth}*\n\n` +
    `${supplierBlocks}\n\n` +
    `---\n` +
    `*Grand Total:* ${totalItems} items, *$${grandTotal.toFixed(2)}*`;

  await sendMessage(channel, text);
}

export async function sendAutoOrderResult(
  supplierName: string,
  itemCount: number,
  totalAmount: number,
  success: boolean
): Promise<void> {
  const channel = getOrdersChannel();

  const statusEmoji = success ? ":white_check_mark:" : ":x:";
  const statusText = success ? "completed successfully" : "failed";

  const text =
    `${statusEmoji} *Auto-Order ${statusText}*\n` +
    `*Supplier:* ${supplierName}\n` +
    `*Items:* ${itemCount}\n` +
    `*Total:* $${totalAmount.toFixed(2)}`;

  await sendMessage(channel, text);
}

export async function sendStockAlertConfirmation(
  channel: string,
  threadTs: string,
  itemName: string,
  alertType: string,
  quantity: number | null
): Promise<void> {
  const alertLabel = alertType.replace(/_/g, " ");
  const quantityText =
    quantity !== null ? ` (qty: ${quantity})` : "";

  const text =
    `:memo: Stock alert recorded for *${itemName}*\n` +
    `Type: _${alertLabel}_${quantityText}`;

  await sendMessage(channel, text, threadTs);
}

export async function sendUIChangeAlert(
  supplierName: string
): Promise<void> {
  const channel = getOrdersChannel();

  const text =
    `:warning: *UI Change Detected*\n` +
    `The site structure for *${supplierName}* appears to have changed.\n` +
    `Automated ordering may not work correctly until the scraper is updated.`;

  await sendMessage(channel, text);
}
