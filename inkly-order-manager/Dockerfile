FROM node:20-slim

# Install libraries needed by Playwright/Chromium.
RUN apt-get update && apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer cache.
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Install Chromium for Playwright.
RUN npx playwright install chromium

# Copy source code.
COPY . .

# Build-time public env vars for Next.js.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Write .env.production so Next.js picks up NEXT_PUBLIC_ vars at build time.
RUN echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" > .env.production && \
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" >> .env.production

# Build app.
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
