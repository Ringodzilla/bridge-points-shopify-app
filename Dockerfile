FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
ENV DIRECT_URL=postgresql://postgres:postgres@localhost:5432/postgres

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build:prod && npm prune --omit=dev && npm cache clean --force

CMD ["npm", "run", "docker-start"]
