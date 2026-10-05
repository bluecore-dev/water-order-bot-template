# Production image: build stage compiles TypeScript, runtime stage carries only what runs.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3020
# Migrations are idempotent; running them on start keeps schema and code in step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
