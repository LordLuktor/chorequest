# Build stage — Expo web export
FROM node:22-alpine AS builder
WORKDIR /app
# .npmrc carries legacy-peer-deps=true, required for npm ci to resolve the
# react-native-android-widget peer set on canary Expo. Must be copied BEFORE
# npm ci or the install fails with ERESOLVE.
COPY app/package*.json app/.npmrc ./
RUN npm ci
COPY app/ ./
RUN npx expo export --platform web

# Production stage
FROM nginx:alpine
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY landing/ /usr/share/nginx/landing
RUN chmod 755 /usr/share/nginx/landing && chmod 644 /usr/share/nginx/landing/*
COPY downloads/ /usr/share/nginx/downloads
RUN chmod 755 /usr/share/nginx/downloads && chmod 644 /usr/share/nginx/downloads/*
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
