# Multi-Stage Build for Next.js 15 Standalone Application
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
# --legacy-peer-deps: next@15.0.0's declared peer range predates react@19
# stable, which this project already runs on (see package.json) -- the
# lockfile itself resolves fine, `npm ci` just refuses without this flag,
# same as the local dev install already needed.
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so the
# API origin has to be supplied here as a build argument. Setting it only at
# container runtime has no effect on an already-built bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Same story -- the dashboard hands off to the separate page-composition app
# (D:\newspaper_generater) by URL, inlined at build time same as above.
ARG NEXT_PUBLIC_GENERATOR_URL=http://localhost:3000
ENV NEXT_PUBLIC_GENERATOR_URL=$NEXT_PUBLIC_GENERATOR_URL

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
