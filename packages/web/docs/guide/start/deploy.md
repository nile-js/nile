# Deployment

Nile runs anywhere Bun or Node.js can run. It is designed for stateful backends, long-running servers with high availability, rather than serverless environments.

## Runtime Requirements

| Runtime | Version | Notes |
|---------|---------|-------|
| Bun | 1.0+ | Recommended for best performance |
| Node.js | 18+ | Full support |

Nile is not optimized for serverless functions. Each request handler maintains internal state through the action pipeline, hooks, and context. Cold starts would reset this state. Deploy Nile as a persistent server, not as ephemeral functions.

## Database Support

Nile uses Drizzle ORM, which supports any database Drizzle supports. This includes PostgreSQL, MySQL, SQLite, Cloudflare D1, and more. The default template uses PGLite for simplicity, but you can switch to any supported database by updating your Drizzle configuration.

## Deployment Options

### Docker (Recommended for Production)

The fastest way to deploy Nile with a production database is using Docker.

#### With PostgreSQL

Create a `docker-compose.yml` for a production-ready setup with PostgreSQL:

```yaml
version: "3.8"

services:
  nile:
    build: .
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=nile
      - DB_USER=postgres
      - DB_PASSWORD=postgres
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nile
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

Build and run:

```bash
docker-compose up -d
```

#### With PGLite (Simplified)

For simpler setups or development, use PGLite (embedded PostgreSQL):

```yaml
version: "3.8"

services:
  nile:
    build: .
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

This requires no external database. PGLite stores data in a Docker volume.

### Bare Metal / VPS

Deploy directly on a server with Bun or Node.js installed:

```bash
# Install dependencies
bun install --production

# Run the server
bun run src/index.ts
```

Or build and run with Node.js:

```bash
# Build the TypeScript
bun build src/index.ts --outdir ./dist --target node

# Run with Node.js
node dist/index.js
```

### Container Platforms

Nile works on any container platform:

- **Railway** — `railway up` with a Dockerfile
- **Render** — Deploy from GitHub with a Dockerfile
- **Fly.io** — `fly launch` with a Dockerfile
- **AWS EC2** — Run a Docker container on an EC2 instance
- **GCP Cloud Run** — Deploy the container to Cloud Run
- **Kubernetes** — Deploy the Docker image with kubectl

All platforms work the same way: build a Docker image and run it.

## Docker Setup

### Dockerfile

A production-ready Dockerfile for Nile:

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lockb ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build TypeScript (optional, for better startup time)
RUN bun build src/index.ts --outdir ./dist --target node

# Expose the port
EXPOSE 8000

# Start the server
CMD ["bun", "run", "src/index.ts"]
```

### .dockerignore

Exclude unnecessary files from the build:

```
node_modules/
.git/
dist/
.env
*.log
.DS_Store
```

### Build and Run

```bash
# Build the image
docker build -t nile-app .

# Run the container
docker run -p 8000:8000 nile-app
```

### Multi-Stage Build (Smaller Image)

For a smaller production image:

```dockerfile
# Build stage
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --outdir ./dist --target node

# Runtime stage
FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/dist ./dist
EXPOSE 8000
CMD ["node", "dist/index.js"]
```

## Environment Variables

Nile reads configuration from environment variables. Common ones:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | Server port | `8000` |
| `BASE_URL` | API base URL | `/api` |
| `JWT_SECRET` | Secret for JWT signing | *required in production* |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |

Refer to the [Server Configuration](/guide/internals/server) for the full list.

## Health Checks

Nile exposes a `/status` endpoint when enabled:

```typescript
const server = await createNileServer({
  rest: {
    enableStatus: true,
  },
});
```

Configure your orchestrator to use this for health checks:

```yaml
# docker-compose healthcheck
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/api/status"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Scaling

Nile is designed for vertical scaling on a single instance. For horizontal scaling:

- Use a separate PostgreSQL database (not PGLite)
- Session storage must be external (Redis, database)
- Use a load balancer in front of multiple instances

PGLite does not support horizontal scaling because it is embedded. For production with multiple instances, use PostgreSQL as the database.

## What's Not Supported

- **Serverless** — Lambda, Vercel Functions, Cloudflare Workers
- **Serverless databases** — DynamoDB, Firestore (use PostgreSQL)
- **Horizontal scaling with PGLite** — Use PostgreSQL instead