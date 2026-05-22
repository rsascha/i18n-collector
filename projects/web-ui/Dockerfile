# syntax=docker/dockerfile:1.7
#
# Build-Context: das Repo-Root (wegen pnpm-lock.yaml + pnpm-workspace.yaml).
# Aufruf: docker build -f projects/web-ui/Dockerfile -t web-ui:dev .

ARG NODE_VERSION=20-alpine

# ---------- Stage 1: deps ----------
# Cached den pnpm-Store anhand von Lockfile + workspace.yaml. Schlägt nur an,
# wenn sich Dependencies tatsächlich ändern.
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY projects/web-ui/package.json projects/web-ui/package.json

RUN pnpm fetch
RUN pnpm install --filter web-ui --frozen-lockfile --prefer-offline

# ---------- Stage 2: builder ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/projects/web-ui/node_modules ./projects/web-ui/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY projects/web-ui/ projects/web-ui/

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web-ui exec next build

# ---------- Stage 3: runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

# `output: standalone` legt einen self-contained Node-Server unter
# .next/standalone ab, der die public/ und .next/static separat braucht.
COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui/.next/static       ./projects/web-ui/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/projects/web-ui/public             ./projects/web-ui/public

USER nextjs
EXPOSE 3000

CMD ["node", "projects/web-ui/server.js"]
