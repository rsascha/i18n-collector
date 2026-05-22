# syntax=docker/dockerfile:1.7
#
# Build-Context: das Repo-Root (wegen pnpm-lock.yaml + pnpm-workspace.yaml).
# Aufruf: docker build -f projects/web-ui-i18n/Dockerfile -t web-ui-i18n:dev .

ARG NODE_VERSION=20-alpine

# ---------- Stage 1: deps ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY projects/web-ui-i18n/package.json projects/web-ui-i18n/package.json

RUN pnpm fetch
RUN pnpm install --filter web-ui-i18n --frozen-lockfile --prefer-offline

# ---------- Stage 2: builder ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/projects/web-ui-i18n/node_modules ./projects/web-ui-i18n/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY projects/web-ui-i18n/ projects/web-ui-i18n/

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web-ui-i18n exec next build

# ---------- Stage 3: runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui-i18n/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui-i18n/.next/static       ./projects/web-ui-i18n/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui-i18n/public             ./projects/web-ui-i18n/public

USER nextjs
EXPOSE 3001

CMD ["node", "projects/web-ui-i18n/server.js"]
