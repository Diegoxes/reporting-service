FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY src ./src
RUN npm install
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/dist ./dist
EXPOSE 8082
CMD ["node", "dist/index.js"]
