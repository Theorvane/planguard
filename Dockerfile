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
RUN npm run build \
  && find apps packages -type d -path '*/dist/test' -prune -exec rm -rf {} + \
  && find . -name '*.tsbuildinfo' -delete \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Keep npm workspace links resolvable, but ship only package manifests, compiled JS, and production deps.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=build /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=build /app/packages/terraform-parser/package.json ./packages/terraform-parser/package.json
COPY --from=build /app/packages/terraform-parser/dist ./packages/terraform-parser/dist
COPY --from=build /app/packages/policy-engine/package.json ./packages/policy-engine/package.json
COPY --from=build /app/packages/policy-engine/dist ./packages/policy-engine/dist
COPY --from=build /app/packages/risk-engine/package.json ./packages/risk-engine/package.json
COPY --from=build /app/packages/risk-engine/dist ./packages/risk-engine/dist
COPY --from=build /app/packages/github-client/package.json ./packages/github-client/package.json
COPY --from=build /app/packages/github-client/dist ./packages/github-client/dist

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
