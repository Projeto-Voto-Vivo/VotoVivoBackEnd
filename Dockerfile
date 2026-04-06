# Build Stage
FROM node:22-alpine AS builder

WORKDIR .

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:22-alpine

WORKDIR .

COPY --from=builder /node_modules ./node_modules
COPY --from=builder /package*.json ./
COPY --from=builder /dist ./dist
COPY --from=builder /prisma ./prisma
COPY --from=builder /swagger.yaml ./swagger.yaml

EXPOSE 3000

CMD [ "npm", "run", "start" ]
