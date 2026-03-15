# Inkly Order Manager

タトゥースタジオ向け統合発注管理システム。Next.js + Supabase + Playwright。

## セットアップ

```bash
cp .env.example .env.local
# .env.local に値を設定
npm install
npm run dev
```

## デプロイ

### 通常（自動デプロイ）
`main` ブランチへの `git push` で Railway が自動ビルド・デプロイします。

### 障害時（手動デプロイ）
自動デプロイが壊れている場合のみ:
```bash
railway up
```

### 環境変数
Railway Variables で管理。コードにハードコードしない。
- `NEXT_PUBLIC_SUPABASE_URL` — ビルド時注入（Docker ARG）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — ビルド時注入（Docker ARG）
- `SUPABASE_SERVICE_ROLE_KEY` — ランタイム注入
- `ENCRYPTION_KEY` — ランタイム注入
- `PORT` — 3000
