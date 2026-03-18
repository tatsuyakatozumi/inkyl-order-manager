#!/usr/bin/env node

/**
 * Gmail API Refresh Token 取得スクリプト
 *
 * 使い方:
 *   1. Google Cloud Console で OAuth2 クライアント ID を作成
 *      - アプリの種類: デスクトップアプリ
 *      - Gmail API を有効化
 *   2. .env に GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET を設定
 *   3. node scripts/get-gmail-token.mjs を実行
 *   4. ブラウザで表示される URL にアクセスして認証
 *   5. 表示される refresh_token を管理画面の「Gmail Refresh Token」に設定
 */

import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/gmail.readonly'],
});

console.log('\n=== Gmail API Refresh Token 取得 ===\n');
console.log('以下の URL をブラウザで開いて認証してください:\n');
console.log(authUrl);
console.log('\n認証後、自動的にトークンが表示されます...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('No code provided');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>認証成功!</h1>
          <p>このページを閉じてターミナルを確認してください。</p>
        </body>
      </html>
    `);

    console.log('\n=== 認証成功 ===\n');
    console.log('Refresh Token:');
    console.log(tokens.refresh_token);
    console.log('\nこのトークンを管理画面のサプライヤー設定「Gmail Refresh Token」欄に貼り付けてください。\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed');
    console.error('Token exchange error:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log(`コールバックサーバー起動: http://localhost:${REDIRECT_PORT}`);
});
