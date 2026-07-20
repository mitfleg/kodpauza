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
COPY packages/vscode-extension packages/vscode-extension
RUN pnpm db:generate \
  && pnpm --filter @kodpauza/shared build \
  && pnpm --filter kodpauza-vscode package:vsix \
  && pnpm --filter @kodpauza/api build
RUN pnpm --filter @kodpauza/api deploy --prod /prod/api \
  && cp -R prisma /prod/api/prisma \
  && mkdir -p /prod/api/artifacts \
  && cp packages/vscode-extension/dist/kodpauza.vsix /prod/api/artifacts/kodpauza.vsix \
  && node -p "require('./packages/vscode-extension/package.json').version" \
    > /prod/api/artifacts/kodpauza-version.txt \
  && cd /prod/api \
  && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=build --chown=node:node /prod/api ./

USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
