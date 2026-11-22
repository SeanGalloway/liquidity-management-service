FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM build AS app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]

FROM deps AS worker
COPY worker ./worker
COPY tsconfig.json ./
CMD ["pnpm", "worker"]
