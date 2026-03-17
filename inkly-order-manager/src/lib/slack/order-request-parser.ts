export interface ParsedOrderItem {
  itemName: string;
  quantity: number;
  confidence: number;
}

export interface ParsedOrderRequest {
  items: ParsedOrderItem[];
  unmatched: string[];
}

export async function parseOrderRequest(
  message: string,
  itemNames: string[],
): Promise<ParsedOrderRequest> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const prompt =
    `You are parsing an order request message from a Slack channel sent by a field staff member. ` +
    `The message describes items that are running low or need to be ordered. ` +
    `Match each item mentioned to one of the known item names, and estimate quantity.\n\n` +
    `Known item names:\n${itemNames.map((n) => `- ${n}`).join('\n')}\n\n` +
    `Message: "${message}"\n\n` +
    `Rules:\n` +
    `- Match items to known names even if the message uses abbreviations or colloquial terms\n` +
    `- If quantity is not mentioned, default to 1\n` +
    `- If an item cannot be matched to any known item, put it in "unmatched"\n` +
    `- confidence should be 0.0-1.0 indicating how sure the match is\n\n` +
    `Respond with JSON only, no other text. Use this exact format:\n` +
    `{"items": [{"itemName": "<matched item name>", "quantity": <number>, "confidence": <0.0 to 1.0>}], "unmatched": ["<unmatched text>"]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0];
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response format from Anthropic API');
  }

  const parsed: ParsedOrderRequest = JSON.parse(content.text);

  // Filter out low-confidence matches
  const confident = parsed.items.filter((item) => item.confidence >= 0.6);
  const lowConfidence = parsed.items
    .filter((item) => item.confidence < 0.6)
    .map((item) => item.itemName);

  return {
    items: confident,
    unmatched: [...(parsed.unmatched ?? []), ...lowConfidence],
  };
}
