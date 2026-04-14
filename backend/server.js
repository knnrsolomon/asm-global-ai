import expressPkg from "express";
const express = expressPkg.default || expressPkg;
import corsPkg from "cors";
const cors = corsPkg.default || corsPkg;
import dotenv from "dotenv";
import cookieParserPkg from "cookie-parser";
const cookieParser = cookieParserPkg.default || cookieParserPkg;
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

// static
app.use(express.static(path.join(__dirname, "../frontend/hub")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/hub/index.html"));
});
// db
let db;
(async () => {
  db = await initDB();
  console.log("DB ready");
})();

// ================= AUTH =================

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

// ================= SIGNUP =================

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

// ================= LOGIN =================

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

// ================= LOGOUT =================

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

// ================= ME =================

app.get("/me", auth, async (req, res) => {
  if (!req.userId) return res.json({ loggedIn: false });

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
  if (!req.userId) return res.json({ error: "Not logged in" });

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
  if (!req.userId) return res.json({ error: "Not logged in" });

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

// ================= AI =================



function getPrompt(mode) {

  if (mode === "spiritlynk") {
    return `
You are SpiritLynk AI — a spiritual guide.

Speak with clarity, calmness, and depth.
Help the user grow spiritually step by step.
Ask reflective questions.
Guide, don’t rush.
`;
  }

  if (mode === "rgi") {
    return `
You are RisingGem Instructor AI.

You teach like a world-class teacher.

Rules:
- Break topics into steps
- Ask questions to confirm understanding
- Build knowledge progressively
- Use simple explanations first, then deepen

Never dump information — teach interactively.
`;
  }

  if (mode === "finance") {
    return `
You are Finance Intelligence AI.

Help the user:
- Understand money clearly
- Build income
- Manage finances wisely

Be practical and actionable.
`;
  }

  return `
You are ASM Core AI.

Be helpful, clear, and intelligent.
`;
}

app.post("/chat", auth, async (req, res) => {
  const { message, mode } = req.body;

// 🎯 TEACHING ENGINE HOOK
if (mode === "rgi") {
  const steps = buildTeachingSteps(message);
  return res.json({ type: "teaching", steps });
}

  try {
    // ✅ CREATE CLIENT HERE (RUNTIME SAFE)
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

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

  } catch (err) {
    console.error("AI ERROR:", err);
    res.json({ error: "AI error" });
  }
});

function buildTeachingSteps(question) {
  return [
    { type: "intro", text: "Alright! Let’s learn together like a real classroom! 👋" },

    { type: "step", title: "Step 1: Write the numbers", content: "24\n+18\n____" },

    { type: "step", title: "Step 2: Add the ones", content: "4 + 8 = 12\n👉 Write 2, carry 1" },

    { type: "step", title: "Step 3: Add the tens", content: "2 + 1 + 1 = 4" },

    { type: "result", text: "Final Answer: 42 ✅" }
  ];
}

// ================= START =================

app.listen(3000, () => console.log("SERVER RUNNING"));
// AUTO DEPLOY TEST
