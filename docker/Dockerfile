# Reproducible local deployment skeleton; source-runtime API/worker are not a production release.
FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 SCARF_ANALYTICS=false
COPY . .
# Skip arbitrary dependency lifecycle scripts; only the reviewed esbuild binary installer is needed.
RUN npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund \
    && npm ci --ignore-scripts --no-audit --no-fund \
    && node node_modules/esbuild/install.js
ARG SERVICE=web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN case "$SERVICE" in web|api|worker) npm run build -w "@cuevo/$SERVICE" ;; *) exit 2 ;; esac \
    && if [ "$SERVICE" = web ]; then \
         cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static; \
         if [ -d apps/web/public ]; then cp -r apps/web/public apps/web/.next/standalone/apps/web/public; fi; \
       fi

FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ARG SERVICE=web
ENV SERVICE=$SERVICE
CMD ["sh", "-c", "case \"$SERVICE\" in web) exec node apps/web/.next/standalone/apps/web/server.js ;; api) exec node --import tsx apps/api/src/main.ts ;; worker) exec node --import tsx apps/worker/src/main.ts ;; *) exit 2 ;; esac"]
