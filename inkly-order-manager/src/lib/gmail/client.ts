import { google } from 'googleapis';

const SHOPIFY_SENDER = 'no-reply@accounts.shopify.com';

interface GmailClientOptions {
  refreshToken: string;
}

/**
 * Fetch the latest Shopify verification code from Gmail.
 *
 * Searches for emails from Shopify's no-reply address received after
 * `afterTimestamp`, polls up to `maxWaitMs` with `intervalMs` spacing.
 */
export async function fetchShopifyVerificationCode(
  options: GmailClientOptions,
  afterTimestamp: Date,
  maxWaitMs = 90_000,
  intervalMs = 5_000,
): Promise<string | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[Gmail] GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET not set');
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: options.refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const afterEpoch = Math.floor(afterTimestamp.getTime() / 1000);
  const query = `from:${SHOPIFY_SENDER} after:${afterEpoch}`;

  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 3,
      });

      const messages = listRes.data.messages;
      if (messages && messages.length > 0) {
        // Get the most recent message
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: messages[0].id!,
          format: 'full',
        });

        const code = extractCodeFromMessage(msgRes.data);
        if (code) {
          console.log('[Gmail] Verification code found');
          return code;
        }
      }
    } catch (err) {
      console.warn('[Gmail] Error fetching messages:', err);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.warn('[Gmail] Timed out waiting for verification code');
  return null;
}

/**
 * Extract a numeric verification code from a Gmail message.
 * Shopify sends codes as 6-digit numbers in the email body.
 */
function extractCodeFromMessage(message: any): string | null {
  const parts = message.payload?.parts ?? [message.payload];

  for (const part of parts) {
    if (!part?.body?.data) continue;

    const body = Buffer.from(part.body.data, 'base64url').toString('utf-8');

    // Look for a standalone 6-digit code
    const match = body.match(/\b(\d{6})\b/);
    if (match) {
      return match[1];
    }
  }

  // Also check the snippet (plain text summary)
  if (message.snippet) {
    const match = message.snippet.match(/\b(\d{6})\b/);
    if (match) {
      return match[1];
    }
  }

  return null;
}
