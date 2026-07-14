FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/vscode-extension/package.json packages/vscode-extension/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json prisma.config.ts ./
COPY prisma prisma
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm db:generate && pnpm --filter @kodpauza/shared build && pnpm --filter @kodpauza/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/prisma prisma
COPY --from=build /app/prisma.config.ts prisma.config.ts
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/data apps/api/data
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist

USER node

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
