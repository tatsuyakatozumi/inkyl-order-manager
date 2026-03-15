FROM node:20-slim

# Playwright用の依存パッケージ + 日本語フォント
RUN apt-get update && apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Playwrightブラウザインストール
RUN npx playwright install chromium

# ソースコピー
COPY . .

# ビルド時にNEXT_PUBLIC_変数を注入（Railwayが自動でARGに渡す）
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# ビルド
RUN npm run build

# ランタイム設定
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
