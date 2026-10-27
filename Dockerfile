# BrandMint AI: web app + worker + Remotion reel renderer in one image.
FROM node:22-bookworm-slim

# Chrome Headless Shell (Remotion) runtime libraries + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 \
      libcups2 libdrm2 libxshmfence1 fonts-noto-core fonts-noto-color-emoji tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# reel renderer
COPY video/package.json video/package-lock.json ./video/
RUN cd video && npm ci --no-audit --no-fund
COPY video ./video
RUN cd video && npx remotion browser ensure

# web app (scripts skipped: native modules ship prebuilt binaries)
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --ignore-scripts --no-audit --no-fund
COPY web ./web
RUN cd web && npx next build

COPY docker/entrypoint.sh /usr/local/bin/brandmint
RUN chmod +x /usr/local/bin/brandmint

ENV NODE_ENV=production \
    DATABASE_URL=file:/data/brandmint.db \
    STORAGE_DIR=/data/storage \
    VIDEO_DIR=/app/video
WORKDIR /app/web
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["tini", "--", "brandmint"]
CMD ["web"]
