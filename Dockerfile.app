FROM node:22-alpine AS build
WORKDIR /build
COPY package.json ./
COPY app ./app
COPY brand.css theme.js ./
COPY assets ./assets
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs
FROM node:22-alpine
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY scripts/serve.mjs ./scripts/serve.mjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","scripts/serve.mjs"]
