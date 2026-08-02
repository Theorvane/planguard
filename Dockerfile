# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/terraform-parser/package.json packages/terraform-parser/package.json
COPY packages/policy-engine/package.json packages/policy-engine/package.json
COPY packages/risk-engine/package.json packages/risk-engine/package.json
COPY packages/github-client/package.json packages/github-client/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
