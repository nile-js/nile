FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lockb ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Expose the port (default for Nile)
EXPOSE 8000

# Start the server
CMD ["bun", "run", "src/index.ts"]