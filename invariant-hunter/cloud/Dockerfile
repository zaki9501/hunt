# Cloud Worker Dockerfile
FROM node:20-alpine

# Install Docker CLI for DinD
RUN apk add --no-cache docker-cli git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY dist/ ./dist/

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Run worker
CMD ["node", "dist/index.js"]
