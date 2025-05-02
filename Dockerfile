FROM node:20.18.0-bullseye AS base
WORKDIR /usr/src/app
# COPY package.json yarn.lock ./
COPY package.json package-lock.json* ./


# Alias de desarrollo que extiende de base
FROM base AS development
RUN npm install
RUN npm install -g @nestjs/cli
COPY . .
EXPOSE 3000

# Alias de construcción que extiende de base
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run start:dev

# Alias de producción que usa una imagen más ligera
# FROM node:20.18.0-bullseye-slim AS production
# WORKDIR /usr/src/app
# COPY --from=builder /usr/src/app/dist ./dist
# COPY --from=builder /usr/src/app/package.json ./
# COPY --from=builder /usr/src/app/yarn.lock ./
# COPY --from=builder /usr/src/app/.env ./.env

# RUN chown -R node:node . && \
#     chmod -R 755 . && 

# RUN yarn install --production --frozen-lockfile
# ENV NODE_ENV=production
# EXPOSE 3000
# CMD ["node", "dist/main"]