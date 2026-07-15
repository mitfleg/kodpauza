FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/vscode-extension/package.json packages/vscode-extension/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/vscode-extension packages/vscode-extension
RUN pnpm --filter kodpauza-vscode package:vsix

COPY apps/web apps/web
RUN mkdir -p apps/web/public/downloads \
  && cp packages/vscode-extension/dist/kodpauza.vsix apps/web/public/downloads/kodpauza.vsix \
  && test -s apps/web/public/downloads/kodpauza.vsix

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_CAPTCHA_DEV_TOKEN=kodpauza-local-captcha-pass
ARG NEXT_PUBLIC_LOCAL_DEVELOPMENT=false
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ARG NEXT_PUBLIC_YANDEX_SITE_VERIFICATION
ARG NEXT_PUBLIC_BING_SITE_VERIFICATION
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_CAPTCHA_DEV_TOKEN=$NEXT_PUBLIC_CAPTCHA_DEV_TOKEN
ENV NEXT_PUBLIC_LOCAL_DEVELOPMENT=$NEXT_PUBLIC_LOCAL_DEVELOPMENT
ENV NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=$NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ENV NEXT_PUBLIC_YANDEX_SITE_VERIFICATION=$NEXT_PUBLIC_YANDEX_SITE_VERIFICATION
ENV NEXT_PUBLIC_BING_SITE_VERIFICATION=$NEXT_PUBLIC_BING_SITE_VERIFICATION
RUN pnpm --filter @kodpauza/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
