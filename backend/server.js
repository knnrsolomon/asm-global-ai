import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { initDB } from "./db.js";
import path from "path";

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ================= PATH =================
const __dirname = new URL('.', import.meta.url).pathname;

// ================= STATIC =================
app.use(express.static(path.join(__dirname, "hub")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "hub/index.html"));
});

// ================= OPENAI =================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================= DB =================
let db;
(async () => {
  db = await initDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      userId TEXT,
      mode TEXT,
      message TEXT,
      role TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("✅ DB ready");
})();

// ================= MODE DETECTION =================
function detectMode(req) {
  const host = req.hostname;

  if (host.includes("spiritlynk")) return "spiritlynk";
  if (host.includes("rgi")) return "rgi";
  if (host.includes("finai")) return "finance";

  return req.body?.mode || "asm";
}

// ================= PROMPTS =================
function getSystemPrompt(mode) {
  const prompts = {
    spiritlynk: "You are SpiritLynk AI. Guide users in spiritual growth, purpose, and destiny.",
    rgi: "You are RisingGem AI. Teach clearly and mentor users deeply.",
    finance: "You are Finance AI. Help users with money, budgeting, and insights.",
    asm: "You are ASM Core AI. Help with life and general intelligence."
  };

  return prompts[mode] || prompts.asm;
}

// ================= AUTH =================
function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ================= AUTH =================
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ error: "Missing email or password" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();

    await db.run(
      "INSERT INTO users (id,email,password) VALUES (?,?,?)",
      [id, email, hash]
    );

    res.json({ success: true });
  } catch {
    res.json({ error: "User already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await db.get("SELECT * FROM users WHERE email=?", [email]);

  if (!user) return res.json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.json({ error: "Wrong password" });

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  res.json({ success: true });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(0),
    path: "/"
  });

  res.json({ success: true });
});

app.get("/me", (req, res) => {
  const token = req.cookies.token;

  if (!token) return res.json({ loggedIn: false });

  try {
    jwt.verify(token, process.env.JWT_SECRET || "secret");
    res.json({ loggedIn: true });
  } catch {
    res.json({ loggedIn: false });
  }
});

// ================= CHAT =================
app.post("/chat", auth, async (req, res) => {
  try {
    const { message } = req.body;
    const mode = detectMode(req);
    const userId = req.userId;

    let history = [];
    try {
      history = await db.all(
        "SELECT role, message FROM chats WHERE userId=? AND mode=? ORDER BY createdAt ASC LIMIT 10",
        [userId, mode]
      );
    } catch (e) {
      console.log("⚠️ History error:", e.message);
    }

    const messages = [
      { role: "system", content: getSystemPrompt(mode) },
      ...history.map(h => ({
        role: h.role,
        content: h.message
      })),
      { role: "user", content: message }
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages
    });

    const reply = response?.choices?.[0]?.message?.content;

    if (!reply) {
      console.log("❌ No reply:", response);
      return res.json({ error: "No AI response" });
    }

    await db.run(
      "INSERT INTO chats (id,userId,mode,message,role) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), userId, mode, message, "user"]
    );

    await db.run(
      "INSERT INTO chats (id,userId,mode,message,role) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), userId, mode, reply, "assistant"]
    );

    res.json({ reply });

  } catch (err) {
    console.log("❌ CHAT ERROR:", err.message);
    res.json({ error: err.message });
  }
});

// ================= START =================
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 CLEAN CORE STABLE");
});
