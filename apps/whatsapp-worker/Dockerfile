FROM node:20-slim

# Chromium + dependencies for whatsapp-web.js (Puppeteer)
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/whatsapp-worker/package.json ./apps/whatsapp-worker/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/whatsapp-worker/ ./apps/whatsapp-worker/

# Generate Prisma client
RUN pnpm --filter=@repo/database exec prisma generate

# Build worker
RUN pnpm --filter=@repo/whatsapp-worker build

EXPOSE 3001

CMD ["pnpm", "--filter=@repo/whatsapp-worker", "start"]
