# Build Stage
FROM node:22-alpine AS builder

RUN npm install -g npm@latest

WORKDIR .

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:22-alpine

RUN npm install -g npm@latest

WORKDIR .

COPY --from=builder /node_modules ./node_modules
COPY --from=builder /package*.json ./
COPY --from=builder /dist ./dist
COPY --from=builder /prisma ./prisma
COPY --from=builder /prisma.config.ts ./prisma.config.ts
COPY --from=builder /swagger.yaml ./swagger.yaml

EXPOSE 3000

CMD [ "npm", "run", "start" ]
