# Amicora web (Next.js 14, standalone output)
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_API_BASE is intentionally NOT set: the client defaults to the
# same origin under /api at runtime (see src/lib/api.ts), so the image works
# on a bare IP or a domain without a rebuild. Override at build time only if
# the API lives on a different host.
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone server + static assets.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
