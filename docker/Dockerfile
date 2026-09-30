FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build
FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ARG SERVICE=web
ENV SERVICE=$SERVICE
CMD ["sh", "-c", "if [ \"$SERVICE\" = web ]; then npm run start -w @cuevo/web; elif [ \"$SERVICE\" = api ]; then node --import tsx apps/api/src/main.ts; else node --import tsx apps/worker/src/main.ts; fi"]
