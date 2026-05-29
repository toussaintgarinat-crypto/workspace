FROM node:20-alpine AS builder
# Build context = workspace root — needed for shared-ui (file:../../shared-ui)
WORKDIR /workspace
COPY shared-ui ./shared-ui
WORKDIR /workspace/assistant/frontend
COPY assistant/frontend/package.json ./
RUN npm install
COPY assistant/frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=builder /workspace/assistant/frontend/dist /usr/share/nginx/html
COPY assistant/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null 2>&1 || exit 1
