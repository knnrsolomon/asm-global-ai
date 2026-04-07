import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { initDB } from "./db.js";
import path from "path";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const __dirname = new URL('.', import.meta.url).pathname;

// ================= STATIC =================
app.use(express.static(path.join(__dirname, "../frontend/hub")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/hub/index.html"));
});

// ================= DB =================
let db;
(async () => {
  db = await initDB();
  console.log("DB ready");
})();

// ================= OPENAI =================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ================= AUTH =================
function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const decoded = jwt.verify(token, "secret");
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= AUTH ROUTES =================

// SIGNUP
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

// LOGIN
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
    secure: false,
    path: "/"
  });

  res.json({ success: true });
});

// LOGOUT
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

// ME
app.get("/me", auth, async (req, res) => {
  const user = await db.get(
    "SELECT email FROM users WHERE id=?",
    [req.userId]
  );

  res.json({
    loggedIn: true,
    email: user.email
  });
});

// ================= PROFILE =================

// GET PROFILE
app.get("/profile", auth, async (req, res) => {
  const user = await db.get("SELECT email FROM users WHERE id=?", [req.userId]);

  const profile = await db.get(
    "SELECT * FROM profiles WHERE email=?",
    [user.email]
  );

  res.json({
    email: user.email,
    name: profile?.name || ""
  });
});

// UPDATE PROFILE
app.post("/profile/update", auth, async (req, res) => {
  const { name } = req.body;

  const user = await db.get("SELECT email FROM users WHERE id=?", [req.userId]);

  await db.run(
    `
    INSERT INTO profiles (email, name)
    VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name
    `,
    [user.email, name]
  );

  res.json({ success: true });
});

// ================= AI CHAT =================

function getPrompt(mode) {
  if (mode === "spiritlynk") return "You are SpiritLynk AI. Guide spiritually.";
  if (mode === "rgi") return "You are RisingGem AI. Teach clearly.";
  if (mode === "finance") return "You are Finance AI. Help with money.";
  return "You are ASM Core AI.";
}

app.post("/chat", auth, async (req, res) => {
  try {
    const { message, mode } = req.body;

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: getPrompt(mode) },
        { role: "user", content: message || " " }
      ]
    });

    res.json({
      reply: response.choices[0].message.content
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);
    res.status(500).json({ error: "Chat failed" });
  }
});

// ================= IMAGE GENERATION =================
// 🚀 PUBLIC (no auth — avoids cross-domain issues)
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    const image = result.data[0];

    // HANDLE BOTH TYPES
    if (image.url) {
      return res.json({ imageUrl: image.url });
    }

    if (image.b64_json) {
      return res.json({
        imageUrl: `data:image/png;base64,${image.b64_json}`
      });
    }

    return res.json({ error: "No image returned" });

  } catch (error) {
    console.error("IMAGE ERROR:", error);
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ================= VOICE (TEXT → SPEECH) =================
app.post("/api/voice", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const audio = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy", // can change later per mode
      input: text
    });

    const buffer = Buffer.from(await audio.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);

  } catch (err) {
    console.error("VOICE ERROR:", err);
    res.status(500).json({ error: "Voice generation failed" });
  }
});
// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ================= START =================
app.listen(3000, () => console.log("SERVER RUNNING"));
