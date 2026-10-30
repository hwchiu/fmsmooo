FROM node:22.21.1-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN mkdir design && npm run build
FROM node:22.21.1-bookworm-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY package.json ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
