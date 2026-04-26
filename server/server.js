const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- DATABASE ---------------- */

const db = new sqlite3.Database(path.join(__dirname, "database.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      email TEXT UNIQUE,
      password TEXT,
      background TEXT DEFAULT 'background-1.jpg'
    )
  `);

  db.run(`
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
  `);
});

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

/* ---------------- RATE LIMIT LOGIN ---------------- */

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

  if (loginAttempts[ip].count > 10) {
    return false;
  }

  return true;
}

/* ---------------- ROUTES ---------------- */

/* REGISTER */
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
      return res.json({
        success: false,
        message: "Password troppo corta"
      });
    }

    db.get("SELECT id FROM users WHERE email = ?", [email], async (err, existingUser) => {
      if (existingUser) {
        return res.json({
          success: false,
          message: "Email già registrata"
        });
      }

      const hash = await bcrypt.hash(password, 10);

      db.run(
        "INSERT INTO users (nome, email, password) VALUES (?, ?, ?)",
        [nome, email, hash],
        function (err) {
          if (err) {
            return res.status(500).json({ success: false });
          }

          res.json({ success: true });
        }
      );
    });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* LOGIN */
app.post("/login", (req, res) => {
  const ip = req.ip;

  if (!checkLoginAttempts(ip)) {
    return res.json({
      success: false,
      message: "Troppi tentativi. Riprova tra 1 minuto."
    });
  }

  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
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
});

/* SESSION */
app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  db.get(
    "SELECT id, nome, email, background FROM users WHERE id = ?",
    [req.session.user.id],
    (err, user) => {
      if (!user) return res.json({ authenticated: false });

      res.json({
        authenticated: true,
        user
      });
    }
  );
});

/* LOGOUT */
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- TASKS ---------------- */

/* LISTA TASK */
app.get("/tasks", requireAuth, (req, res) => {
  db.all(
    "SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC",
    [req.session.user.id],
    (err, rows) => {
      if (err) {
        console.error("❌ GET TASKS:", err);
        return res.status(500).json({
          success: false,
          message: "Errore server"
        });
      }

      res.json(rows);
    }
  );
});

/* CREA TASK */
app.post("/tasks", requireAuth, (req, res) => {
  const { titolo, descrizione, orario, colore, tipo } = req.body;

  console.log("📥 NUOVA TASK:", req.body);

  if (!titolo || titolo.trim().length < 2) {
    return res.json({
      success: false,
      message: "Titolo non valido"
    });
  }

  db.run(
    `INSERT INTO tasks (user_id, titolo, descrizione, orario, colore, tipo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      req.session.user.id,
      titolo.trim(),
      descrizione || "",
      orario || "",
      colore || "#6ee7ff",
      tipo || "permanente"
    ],
    function (err) {
      if (err) {
        console.error("❌ ERRORE SQL:", err);
        return res.status(500).json({
          success: false,
          message: "Errore database"
        });
      }

      res.json({
        success: true,
        id: this.lastID
      });
    }
  );
});

/* MODIFICA TASK */
app.put("/tasks/:id", requireAuth, (req, res) => {
  const { titolo, descrizione, orario, colore, tipo, completato } = req.body;
  const id = req.params.id;

  if (titolo !== undefined) {
    db.run(
      `UPDATE tasks SET titolo=?, descrizione=?, orario=?, colore=?, tipo=? 
       WHERE id=? AND user_id=?`,
      [
        titolo,
        descrizione || "",
        orario || "",
        colore || "#6ee7ff",
        tipo || "permanente",
        id,
        req.session.user.id
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ success: false });
        }
        res.json({ success: true });
      }
    );
  } else {
    db.run(
      `UPDATE tasks SET completato=? WHERE id=? AND user_id=?`,
      [completato ? 1 : 0, id, req.session.user.id],
      function (err) {
        if (err) {
          return res.status(500).json({ success: false });
        }
        res.json({ success: true });
      }
    );
  }
});

/* ELIMINA TASK */
app.delete("/tasks/:id", requireAuth, (req, res) => {
  db.run(
    "DELETE FROM tasks WHERE id=? AND user_id=?",
    [req.params.id, req.session.user.id],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false });
      }
      res.json({ success: true });
    }
  );
});
/* SALVA SFONDO */
app.put("/preferences/background", requireAuth, (req, res) => {
  const { background } = req.body;

  console.log("🎨 SALVATAGGIO SFONDO:", background);

  if (!background) {
    return res.json({
      success: false,
      message: "Sfondo mancante"
    });
  }

  db.run(
    "UPDATE users SET background = ? WHERE id = ?",
    [background, req.session.user.id],
    function (err) {
      if (err) {
        console.error("❌ ERRORE DB SFONDO:", err);
        return res.status(500).json({
          success: false,
          message: "Errore database"
        });
      }

      if (this.changes === 0) {
        return res.json({
          success: false,
          message: "Utente non trovato"
        });
      }

      res.json({
        success: true,
        background
      });
    }
  );
});


/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
});