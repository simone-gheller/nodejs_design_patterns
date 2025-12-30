FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY *.js ./
COPY db/ ./db/

# Expose port range for API servers
EXPOSE 8000-9000

# Default command (can be overridden in docker-compose)
CMD ["node", "api_server.js", "A-D.db"]
