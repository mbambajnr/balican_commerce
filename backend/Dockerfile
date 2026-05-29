FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --include-workspace-root
COPY backend/ ./backend/
WORKDIR /app/backend
RUN npx tsc

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --include-workspace-root --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser && \
    mkdir -p uploads && \
    chown nodeuser:nodejs uploads

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY backend/package*.json ./

USER nodeuser
EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
