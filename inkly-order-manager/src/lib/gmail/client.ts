import { google } from 'googleapis';

// Flag Tattoo (Shopify) の認証コードメール送信元
const SHOPIFY_SENDER = 't.shopifyemail.com';

interface GmailClientOptions {
  refreshToken: string;
}

/**
 * Fetch the latest Shopify verification code from Gmail.
 *
 * Actual email format (Flag Tattoo Supply):
 *   From: FLAG Tattoo Supply <store+94042194216@t.shopifyemail.com>
 *   Subject: 225102はあなたのコードです
 *   Body: 認証コード：2 2 5 1 0 2
 *
 * Polls Gmail API up to `maxWaitMs` with `intervalMs` spacing,
 * only looking at emails received after `afterTimestamp`.
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
  // Search by sender domain and subject pattern
  const query = `from:${SHOPIFY_SENDER} subject:はあなたのコードです after:${afterEpoch}`;

  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      console.log('[Gmail] Polling for verification code email...');
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
 * Extract a 6-digit verification code from a Shopify email.
 *
 * Extraction priority:
 *   1. Subject line: "225102はあなたのコードです" → 225102
 *   2. Body: spaced digits "2 2 5 1 0 2" → 225102
 *   3. Snippet fallback
 */
function extractCodeFromMessage(message: any): string | null {
  // 1. Subject line — most reliable (e.g. "225102はあなたのコードです")
  const headers = message.payload?.headers ?? [];
  const subjectHeader = headers.find(
    (h: any) => h.name.toLowerCase() === 'subject',
  );
  if (subjectHeader?.value) {
    const subjectMatch = subjectHeader.value.match(/^(\d{6})/);
    if (subjectMatch) {
      return subjectMatch[1];
    }
  }

  // 2. Body — code appears with spaces: "2 2 5 1 0 2"
  const parts = message.payload?.parts ?? [message.payload];
  for (const part of parts) {
    if (!part?.body?.data) continue;

    const body = Buffer.from(part.body.data, 'base64url').toString('utf-8');

    // Spaced 6-digit code: "2 2 5 1 0 2"
    const spacedMatch = body.match(/(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/);
    if (spacedMatch) {
      return spacedMatch.slice(1, 7).join('');
    }

    // Contiguous 6-digit code (fallback)
    const solidMatch = body.match(/\b(\d{6})\b/);
    if (solidMatch) {
      return solidMatch[1];
    }
  }

  // 3. Snippet fallback
  if (message.snippet) {
    const match = message.snippet.match(/(\d{6})/);
    if (match) {
      return match[1];
    }
  }

  return null;
}
