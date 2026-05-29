FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --include-workspace-root --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY frontend/ ./frontend/

ARG NEXT_PUBLIC_API_URL
ARG AUTH_URL
ARG AUTH_SECRET
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV AUTH_URL=$AUTH_URL
ENV AUTH_SECRET=$AUTH_SECRET

RUN npm install --include=dev typescript @types/node @types/react @types/react-dom
WORKDIR /app/frontend
RUN npx next build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextuser && \
    mkdir -p .next && \
    chown nextuser:nodejs .next

COPY --from=builder /app/frontend/.next ./.next
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/package.json ./package.json
COPY --from=builder /app/frontend/next.config.js ./next.config.js

USER nextuser
EXPOSE 3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
CMD ["node_modules/.bin/next", "start"]
