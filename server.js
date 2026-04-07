import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { initDB } from "./db.js";
import path from "path";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const __dirname = new URL('.', import.meta.url).pathname;

// static
app.use(express.static(path.join(__dirname, "hub")));

// db
let db;
(async () => {
  db = await initDB();
  console.log("DB ready");
})();

// auth middleware
function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.json({ loggedIn: false });

  try {
    const decoded = jwt.verify(token, "secret");
    req.userId = decoded.id;
    next();
  } catch {
    return res.json({ loggedIn: false });
  }
}

// signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  try {
    await db.run(
      "INSERT INTO users (id,email,password) VALUES (?,?,?)",
      [id, email, hash]
    );
    res.json({ success: true });
  } catch {
    res.json({ error: "User exists" });
  }
});

// login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await db.get("SELECT * FROM users WHERE email=?", [email]);
  if (!user) return res.json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ error: "Wrong password" });

  const token = jwt.sign({ id: user.id }, "secret");

  res.cookie("token", token, {
  httpOnly: true,
  sameSite: "lax",
  secure: false,   // 🔥 VERY IMPORTANT (no https)
  path: "/"
});

  res.json({ success: true });
});

// logout
app.post("/logout", (req, res) => {
  res.cookie("token", "", {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  expires: new Date(0),
  path: "/"
});
  res.json({ success: true });
});

// me
app.get("/me", auth, (req, res) => {
  if (req.userId) return res.json({ loggedIn: true });
  res.json({ loggedIn: false });
});
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getPrompt(mode) {
  if (mode === "spiritlynk") return "You are SpiritLynk AI. Guide spiritually.";
  if (mode === "rgi") return "You are RisingGem AI. Teach clearly.";
  if (mode === "finance") return "You are Finance AI. Help with money.";
  return "You are ASM Core AI.";
}

app.post("/chat", auth, async (req, res) => {
  const { message, mode } = req.body;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: getPrompt(mode) },
      { role: "user", content: message }
    ]
  });

  res.json({
    reply: response.choices[0].message.content
  });
});
app.listen(3000, () => console.log("SERVER RUNNING"));
