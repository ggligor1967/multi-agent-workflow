# Multi-Agent AI Workflow - Production Dockerfile
# Multi-stage build for optimized image size

# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the application
# - Vite builds the frontend to dist/public
# - esbuild bundles the server to dist/index.js
RUN pnpm build

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

# Install pnpm for running the app
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
# - dist/index.js: bundled server
# - dist/public: built frontend (served by Express in production)
COPY --from=builder /app/dist ./dist

# Copy Drizzle migrations (needed for db:push if running migrations on startup)
COPY --from=builder /app/drizzle ./drizzle
COPY drizzle.config.ts ./

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the server
CMD ["node", "dist/index.js"]
