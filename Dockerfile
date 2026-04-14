# Stage 1: Build main app
FROM node:20-alpine AS build-main
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Build autobot app
FROM node:20-alpine AS build-autobot
WORKDIR /app
COPY megatrader_autobot/package.json megatrader_autobot/package-lock.json* ./
RUN npm install
COPY megatrader_autobot/ .
RUN npx vite build --base=/autobot/

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app

# Copy server + production deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server/ server/

# Copy built assets
COPY --from=build-main /app/dist ./dist
COPY --from=build-autobot /app/dist ./dist-autobot

EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
