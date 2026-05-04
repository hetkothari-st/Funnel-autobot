# Stage 1: Build main app + generate fresh contracts
FROM node:20-alpine AS build-main
RUN apk add --no-cache python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN python3 scripts/parse_contracts.py
RUN npm run build

# Stage 2: Build autobot app
FROM node:20-alpine AS build-autobot
WORKDIR /app
COPY megatrader_autobot/package.json megatrader_autobot/package-lock.json ./
RUN npm ci
COPY megatrader_autobot/ .
# Overwrite with fresh contracts generated in Stage 1
COPY --from=build-main /app/megatrader_autobot/src/contracts_nsefo.json ./src/contracts_nsefo.json
RUN npx vite build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ server/
COPY --from=build-main /app/dist ./dist
COPY --from=build-autobot /app/dist ./dist-autobot
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
