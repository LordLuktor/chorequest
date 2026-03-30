FROM node:20-alpine
WORKDIR /app

# Install dependencies (tsx needed at runtime for TS execution)
COPY api/package*.json ./
RUN npm ci --omit=dev && npm install tsx

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy source
COPY api/ ./

# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD curl -sf http://localhost:4000/api/health || exit 1

CMD ["npx", "tsx", "src/index.ts"]
