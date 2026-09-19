FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    YEEN_SHARED_ROOT=/opt/yeen/shared \
    YEEN_ADDONS_ROOT=/opt/yeen/shared/addons \
    YEEN_DEPLOYMENT_MODE=docker \
    YEEN_SUPERVISED_RESTART=true

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl ffmpeg gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY apps/server/dist ./apps/server/dist
COPY apps/web/dist ./apps/web/dist
COPY deployment/docker/entrypoint.sh ./deployment/docker/entrypoint.sh
RUN chmod 0755 deployment/docker/entrypoint.sh

EXPOSE 4000
VOLUME ["/opt/yeen/shared"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/app/deployment/docker/entrypoint.sh"]
CMD ["node", "apps/server/dist/main.js"]
