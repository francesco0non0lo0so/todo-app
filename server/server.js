require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- DATABASE ---------------- */

const db = new Database(path.join(__dirname, "database.db"));

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    email TEXT UNIQUE,
    password TEXT,
    background TEXT DEFAULT 'background-1.jpg'
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titolo TEXT NOT NULL,
    descrizione TEXT,
    orario TEXT,
    colore TEXT DEFAULT '#6ee7ff',
    tipo TEXT DEFAULT 'permanente',
    completato INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- HELPERS ---------------- */

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitize(str) {
  return String(str).replace(/[<>]/g, "");
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Non loggato"
    });
  }
  next();
}

/* ---------------- RATE LIMIT ---------------- */

const loginAttempts = {};

function checkLoginAttempts(ip) {
  const now = Date.now();

  if (!loginAttempts[ip]) {
    loginAttempts[ip] = { count: 0, last: now };
  }

  if (now - loginAttempts[ip].last > 60000) {
    loginAttempts[ip] = { count: 0, last: now };
  }

  loginAttempts[ip].count++;

  return loginAttempts[ip].count <= 10;
}

/* ---------------- AUTH ---------------- */

app.post("/register", async (req, res) => {
  try {
    let { nome, email, password } = req.body;

    nome = sanitize(nome);
    email = sanitize(email).toLowerCase();

    if (!nome || nome.length < 2) {
      return res.json({ success: false, message: "Nome non valido" });
    }

    if (!validateEmail(email)) {
      return res.json({ success: false, message: "Email non valida" });
    }

    if (!password || password.length < 8) {
      return res.json({ success: false, message: "Password troppo corta" });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);

    if (existingUser) {
      return res.json({
        success: false,
        message: "Email già registrata"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO users (nome, email, password) VALUES (?, ?, ?)"
    ).run(nome, email, hash);

    res.json({ success: true });

  } catch {
    res.status(500).json({ success: false });
  }
});

app.post("/login", async (req, res) => {
  const ip = req.ip;

  if (!checkLoginAttempts(ip)) {
    return res.json({
      success: false,
      message: "Troppi tentativi. Riprova tra 1 minuto."
    });
  }

  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email);

  if (!user) {
    return res.json({ success: false, message: "Credenziali errate" });
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    return res.json({ success: false, message: "Credenziali errate" });
  }

  req.session.user = {
    id: user.id,
    email: user.email
  };

  res.json({ success: true });
});

app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  const user = db
    .prepare("SELECT id, nome, email, background FROM users WHERE id = ?")
    .get(req.session.user.id);

  if (!user) return res.json({ authenticated: false });

  res.json({
    authenticated: true,
    user
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- TASKS ---------------- */

app.get("/tasks", requireAuth, (req, res) => {
  try {
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC")
      .all(req.session.user.id);

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/tasks", requireAuth, (req, res) => {
  const { titolo, descrizione, orario, colore, tipo } = req.body;

  if (!titolo || titolo.trim().length < 2) {
    return res.json({ success: false });
  }

  const result = db.prepare(`
    INSERT INTO tasks (user_id, titolo, descrizione, orario, colore, tipo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.session.user.id,
    titolo.trim(),
    descrizione || "",
    orario || "",
    colore || "#6ee7ff",
    tipo || "permanente"
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

app.put("/tasks/:id", requireAuth, (req, res) => {
  const { titolo, descrizione, orario, colore, tipo, completato } = req.body;
  const id = req.params.id;

  if (titolo !== undefined) {
    db.prepare(`
      UPDATE tasks SET titolo=?, descrizione=?, orario=?, colore=?, tipo=?
      WHERE id=? AND user_id=?
    `).run(
      titolo,
      descrizione || "",
      orario || "",
      colore || "#6ee7ff",
      tipo || "permanente",
      id,
      req.session.user.id
    );
  } else {
    db.prepare(`
      UPDATE tasks SET completato=?
      WHERE id=? AND user_id=?
    `).run(completato ? 1 : 0, id, req.session.user.id);
  }

  res.json({ success: true });
});

app.delete("/tasks/:id", requireAuth, (req, res) => {
  db.prepare(
    "DELETE FROM tasks WHERE id=? AND user_id=?"
  ).run(req.params.id, req.session.user.id);

  res.json({ success: true });
});

app.put("/preferences/background", requireAuth, (req, res) => {
  const { background } = req.body;

  if (!background) {
    return res.json({ success: false });
  }

  const result = db.prepare(
    "UPDATE users SET background=? WHERE id=?"
  ).run(background, req.session.user.id);

  if (result.changes === 0) {
    return res.json({ success: false });
  }

  res.json({ success: true });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 Server online sulla porta ${PORT}`);
});