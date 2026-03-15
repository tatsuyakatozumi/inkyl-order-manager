FROM node:20-slim

# Install libraries needed by Playwright/Chromium.
RUN apt-get update && apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  libxfixes3 libxext6 libx11-6 libx11-xcb1 libxcb1 libxcursor1 \
  libxi6 libxtst6 libglib2.0-0 libdbus-1-3 \
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

# Public env vars for Next.js (safe to embed — these are public anon keys).
ENV NEXT_PUBLIC_SUPABASE_URL=https://khpdyxacmpuaqvohpzdp.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGR5eGFjbXB1YXF2b2hwemRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTI0OTksImV4cCI6MjA4OTA2ODQ5OX0.n5W-8yI1nwTxDqB-zCMpar8uNGm9YtZv8gcBbuCuCGI

# Build app.
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
