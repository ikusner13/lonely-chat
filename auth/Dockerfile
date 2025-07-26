# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install curl for healthcheck (lighter than wget)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# install dependencies into temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY package.json .
COPY tsconfig.json .
COPY auth/ auth/
COPY src/services/token-store.service.ts src/services/
COPY src/services/token.service.ts src/services/
COPY src/utils/logger.ts src/utils/

# set production environment
ENV NODE_ENV=production
ENV TOKEN_DB_PATH=/data/tokens.db

# run the app as root to avoid permission issues with mounted volumes
# USER bun
EXPOSE 8080/tcp
ENTRYPOINT [ "bun", "run", "auth/index.prod.tsx" ]