# Production Dockerfile for Render / Container deployment
# Uses official Node.js runtime and installs Playwright with all Linux dependencies
FROM node:20-bookworm

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Install Chromium and all Linux OS shared libraries (libgbm, libasound, etc.)
RUN npx playwright install --with-deps chromium

# Copy application code
COPY . .

# Production environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV HEADLESS=true

EXPOSE 5000

# Start the Express backend server
CMD ["node", "backend/server.js"]
