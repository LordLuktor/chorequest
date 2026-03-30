# Build stage — Expo web export
FROM node:22-alpine AS builder
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npx expo export --platform web

# Production stage
FROM nginx:alpine
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY landing/ /usr/share/nginx/landing
COPY downloads/ /usr/share/nginx/downloads
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
