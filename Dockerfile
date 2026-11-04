# One image: the Hono API plus the static preview it serves at /.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# The preview imports ../src/lang and reads ../design at build time.
FROM deps AS preview-build
COPY preview/package.json preview/package-lock.json preview/
RUN npm --prefix preview ci
COPY tsconfig.json ./
COPY src/ src/
COPY design/ design/
COPY preview/ preview/
RUN npm --prefix preview run build

FROM deps AS server-build
COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# The image has no Claude Code CLI: deployments always run on the API.
ENV NODE_ENV=production PORT=8080 GENERATION_MODE=api DATA_SOURCE=mixed
COPY --from=server-build /app/package.json ./
COPY --from=server-build /app/node_modules/ node_modules/
COPY --from=server-build /app/dist/ dist/
COPY --from=preview-build /app/preview/out/ preview/out/
COPY catalog/ catalog/
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
