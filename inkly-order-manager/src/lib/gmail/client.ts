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
  // Support both env var formats:
  // 1. GMAIL_CREDENTIALS_JSON + GMAIL_TOKEN_JSON (credentials.json & token.json as JSON strings)
  // 2. GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET (individual env vars)
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let refreshToken = options.refreshToken;

  if (process.env.GMAIL_TOKEN_JSON) {
    try {
      const tokenJson = JSON.parse(process.env.GMAIL_TOKEN_JSON);
      clientId = tokenJson.client_id;
      clientSecret = tokenJson.client_secret;
      if (!refreshToken && tokenJson.refresh_token) {
        refreshToken = tokenJson.refresh_token;
      }
    } catch (e) {
      console.error('[Gmail] Failed to parse GMAIL_TOKEN_JSON:', e);
    }
  }

  if (!clientId && process.env.GMAIL_CREDENTIALS_JSON) {
    try {
      const credJson = JSON.parse(process.env.GMAIL_CREDENTIALS_JSON);
      const installed = credJson.installed ?? credJson.web ?? credJson;
      clientId = installed.client_id;
      clientSecret = installed.client_secret;
    } catch (e) {
      console.error('[Gmail] Failed to parse GMAIL_CREDENTIALS_JSON:', e);
    }
  }

  // Fallback to individual env vars
  clientId = clientId ?? process.env.GMAIL_CLIENT_ID;
  clientSecret = clientSecret ?? process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[Gmail] Gmail API credentials not configured');
    return null;
  }

  if (!refreshToken) {
    console.error('[Gmail] No refresh token available');
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

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
