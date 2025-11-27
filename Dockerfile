# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=build /app/package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/build ./build
COPY --from=build /app/src ./src

RUN npm install -g mcp-remote@latest --ignore-scripts

CMD ["node", "./build/index.js"]

