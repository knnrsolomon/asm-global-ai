FROM node:20

WORKDIR /app

# copy entire project cleanly
COPY . .

# go into backend
WORKDIR /app/backend

# install dependencies
RUN npm install

EXPOSE 3000

CMD ["node", "server.js"]
