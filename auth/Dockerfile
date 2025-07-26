# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

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
COPY src/env.ts src/

# Create directory for database with proper permissions
RUN mkdir -p /data && chown bun:bun /data

# set production environment
ENV NODE_ENV=production
ENV TOKEN_DB_PATH=/data/tokens.db

# Set volume for persistent data
VOLUME ["/data"]

# run the app
USER bun
EXPOSE 8080/tcp
ENTRYPOINT [ "bun", "run", "auth/index.prod.tsx" ]