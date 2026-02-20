FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ .
RUN npm run build 2>/dev/null || true

# Dashboard
COPY dashboard/ /dashboard

EXPOSE 3000

CMD ["npm", "start"]
