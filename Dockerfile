# ----- Build Stage -----
FROM node:lts-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package and configuration
COPY package.json pnpm-lock.yaml tsconfig.json ./

# Copy source code
COPY src ./src

# Install dependencies and build.
# --ignore-scripts skips dependency build scripts (e.g. esbuild's native binary
# postinstall); the build is pure `tsc` and never invokes them, and pnpm 10
# otherwise fails the install with ERR_PNPM_IGNORED_BUILDS for unapproved scripts.
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm run build

# ----- Production Stage -----
FROM node:lts-alpine
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artifacts
COPY --from=builder /app/build ./build

# Copy package.json and lockfile for production install
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Default to the HTTP transport. The app's default is stdio, which in a
# container has no attached stdin and exits immediately on EOF, causing a
# restart loop. This is a sensible default for a long-running container and is
# still overridable at runtime (e.g. MCP_TRANSPORT=sse or =stdio).
ENV MCP_TRANSPORT=http

# Expose port 3000 (internal container port)
EXPOSE 3000

# Add health check for HTTP mode
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD if [ "$MCP_TRANSPORT" = "http" ] || [ "$MCP_TRANSPORT" = "sse" ]; then \
        wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1; \
      else \
        exit 0; \
      fi

# Default command supports both stdio and HTTP modes
CMD ["node", "build/index.js"]
