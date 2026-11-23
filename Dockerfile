FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
RUN pnpm exec esbuild worker/index.ts --bundle --platform=node --format=esm --outfile=dist/worker.mjs

FROM deps AS migrate
COPY db ./db
CMD ["pnpm", "db:migrate"]

FROM node:22-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /repo/.next/standalone ./
COPY --from=build --chown=node:node /repo/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-slim AS worker
WORKDIR /worker
COPY --from=build /repo/dist/worker.mjs ./
USER node
CMD ["node", "worker.mjs"]
