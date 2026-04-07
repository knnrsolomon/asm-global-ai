FROM node:20

WORKDIR /app

# copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# copy everything
COPY backend ./backend
COPY frontend ./frontend

# move into backend runtime
WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "server.js"]
