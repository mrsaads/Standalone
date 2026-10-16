FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    UPWORK_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium \
    UPWORK_BROWSER_SESSION_DIR=/var/data/upwork-session \
    UPWORK_BROWSER_HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb x11-utils x11vnc novnc websockify ca-certificates fonts-liberation util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# Optional corporate CA for local builds; absent on Render. It is never copied into the image.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY scripts/upwork-browser ./scripts/upwork-browser
# Persistent disk is mounted here by Render; use only this service for this disk/session.
RUN mkdir -p /var/data/upwork-session && chmod 700 /var/data/upwork-session \
    && chmod +x scripts/upwork-browser/render-entrypoint.sh
EXPOSE 3100
CMD ["bash", "scripts/upwork-browser/render-entrypoint.sh"]
