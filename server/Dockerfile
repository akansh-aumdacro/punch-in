FROM node:20-alpine

WORKDIR /app

# Install deps first so the layer caches across code changes.
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# uploads/ is mounted as a volume in docker-compose so logos/photos persist
# across container rebuilds.
RUN mkdir -p uploads

EXPOSE 5000
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
