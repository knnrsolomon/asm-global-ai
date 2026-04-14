FROM node:20

WORKDIR /app

# -----------------------------
# COPY BACKEND
# -----------------------------
COPY backend ./backend

WORKDIR /app/backend

# install dependencies
RUN npm install --omit=dev

# debug backend install
RUN echo "===== BACKEND CHECK ====="
RUN ls -la /app/backend
RUN ls -la /app/backend/node_modules

# -----------------------------
# COPY FRONTEND
# -----------------------------
WORKDIR /app

COPY frontend ./frontend

# 🔥 DEBUG FRONTEND (CRITICAL)
RUN echo "===== FRONTEND CHECK ====="
RUN ls -la /app/frontend/hub

# 🔥 THIS LINE EXPOSES THE BUG
RUN grep -n "addEventListener" /app/frontend/hub/index.html || echo "CLEAN FRONTEND"

# -----------------------------
# RUN APP
# -----------------------------
WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "server.js"]
