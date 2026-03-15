export interface ParsedStockAlert {
  itemName: string;
  alertType: "low_stock" | "out_of_stock" | "ordered";
  quantity: number | null;
  confidence: number;
}

export async function parseStockMessage(
  message: string,
  itemNames: string[]
): Promise<ParsedStockAlert> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const prompt =
    `You are parsing a stock alert message from a Slack channel. ` +
    `Match the item mentioned in the message to one of the known item names, ` +
    `and classify the alert type.\n\n` +
    `Known item names:\n${itemNames.map((n) => `- ${n}`).join("\n")}\n\n` +
    `Message: "${message}"\n\n` +
    `Respond with JSON only, no other text. Use this exact format:\n` +
    `{"itemName": "<matched item name>", "alertType": "<low_stock|out_of_stock|ordered>", "quantity": <number or null>, "confidence": <0.0 to 1.0>}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  const content = data.content?.[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from Anthropic API");
  }

  const parsed: ParsedStockAlert = JSON.parse(content.text);

  if (
    !parsed.itemName ||
    !["low_stock", "out_of_stock", "ordered"].includes(parsed.alertType) ||
    typeof parsed.confidence !== "number"
  ) {
    throw new Error("Invalid parsed stock alert structure");
  }

  return parsed;
}
