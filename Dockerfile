# Usando a versão slim (Debian) evita problemas de compilação de binários do Prisma
FROM node:22-slim AS builder

RUN npm install -g npm@latest

# Define a pasta /app como ambiente de trabalho (isolar da raiz do sistema)
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:22-slim

RUN npm install -g npm@latest

WORKDIR /app

# Os caminhos do --from=builder agora devem apontar para /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/swagger.yaml ./swagger.yaml

EXPOSE 3000

CMD [ "npm", "run", "start" ]
