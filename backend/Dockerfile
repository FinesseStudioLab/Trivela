# Backend Dockerfile
# Build and run the Node.js Express API in a small, production-ready image

FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies (production only)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy source and non-code assets
COPY backend/ ./

# Optional step if your code pipeline has a build step
# RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "src/server.js"]

