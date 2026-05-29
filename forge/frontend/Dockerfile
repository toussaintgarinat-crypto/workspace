FROM node:20-alpine AS build
# Build context = workspace root — needed for shared-ui (file:../../shared-ui)
WORKDIR /workspace
COPY shared-ui ./shared-ui
WORKDIR /workspace/forge/frontend
COPY forge/frontend/package.json forge/frontend/package-lock.json* ./
RUN npm install
COPY forge/frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /workspace/forge/frontend/dist /usr/share/nginx/html
COPY forge/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
