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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.all("PRAGMA table_info(users)", [], (err, columns) => {
    if (err) {
      console.error("Errore lettura schema users:", err);
      return;
    }

    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes("nome")) {
      db.run("ALTER TABLE users ADD COLUMN nome TEXT", (err) => {
        if (err) console.error("Errore aggiunta colonna nome:", err);
        else console.log("✅ Colonna nome aggiunta");
      });
    }

    if (!columnNames.includes("background")) {
      db.run(
        "ALTER TABLE users ADD COLUMN background TEXT DEFAULT 'background-1.jpg'",
        (err) => {
          if (err) console.error("Errore aggiunta colonna background:", err);
          else console.log("✅ Colonna background aggiunta");
        }
      );
    }
  });

  db.get(
    "SELECT * FROM users WHERE email = ?",
    ["fracrafter2008@gmail.com"],
    async (err, row) => {
      if (err) {
        console.error("Errore controllo utente default:", err);
        return;
      }

      if (!row) {
        const hash = await bcrypt.hash("CiccioSilvia2008", 10);
        db.run(
          "INSERT INTO users (nome, email, password, background) VALUES (?, ?, ?, ?)",
          ["Fra", "fracrafter2008@gmail.com", hash, "background-1.jpg"],
          (err) => {
            if (err) console.error("Errore creazione utente default:", err);
            else console.log("✅ Utente creato");
          }
        );
      }
    }
  );
});

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());

app.use(
  session({
    secret: "super-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- HELPERS ---------------- */

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

/* ---------------- ROUTES ---------------- */

/* REGISTER */
app.post("/register", async (req, res) => {
  try {
    const { nome, email, password } = req.body;

    if (!nome || nome.trim().length < 2) {
      return res.json({ success: false, message: "Nome non valido" });
    }

    if (!validateEmail(email || "")) {
      return res.json({ success: false, message: "Email non valida" });
    }

    if (!password || password.length < 8) {
      return res.json({
        success: false,
        message: "La password deve avere almeno 8 caratteri"
      });
    }

    const emailPulita = email.trim().toLowerCase();

    db.get(
      "SELECT id FROM users WHERE email = ?",
      [emailPulita],
      async (err, existingUser) => {
        if (err) {
          console.error("Errore controllo utente esistente:", err);
          return res.status(500).json({
            success: false,
            message: "Errore server"
          });
        }

        if (existingUser) {
          return res.json({
            success: false,
            message: "Email già registrata"
          });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
          "INSERT INTO users (nome, email, password, background) VALUES (?, ?, ?, ?)",
          [nome.trim(), emailPulita, hashedPassword, "background-1.jpg"],
          function (err) {
            if (err) {
              console.error("Errore registrazione:", err);
              return res.status(500).json({
                success: false,
                message: "Registrazione non riuscita"
              });
            }

            res.json({
              success: true,
              userId: this.lastID
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Errore /register:", error);
    res.status(500).json({
      success: false,
      message: "Errore server"
    });
  }
});

/* LOGIN */
app.post("/login", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error("Errore login:", err);
      return res.status(500).json({
        success: false,
        message: "Errore server"
      });
    }

    if (!user) {
      return res.json({ success: false, message: "Utente non trovato" });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.json({ success: false, message: "Password errata" });
    }

    req.session.user = {
      id: user.id,
      email: user.email
    };

    res.json({ success: true });
  });
});

/* SESSIONE */
app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  db.get(
    "SELECT id, nome, email, background FROM users WHERE id = ?",
    [req.session.user.id],
    (err, user) => {
      if (err || !user) {
        console.error("Errore /me:", err);
        return res.json({ authenticated: false });
      }

      res.json({
        authenticated: true,
        user
      });
    }
  );
});

/* PROFILO */
app.put("/profile", requireAuth, async (req, res) => {
  try {
    const nome = (req.body.nome || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const currentPassword = req.body.currentPassword || "";
    const newPassword = req.body.newPassword || "";

    if (!nome || nome.length < 2) {
      return res.json({ success: false, message: "Nome non valido" });
    }

    if (!validateEmail(email)) {
      return res.json({ success: false, message: "Email non valida" });
    }

    db.get(
      "SELECT * FROM users WHERE id = ?",
      [req.session.user.id],
      async (err, user) => {
        if (err || !user) {
          console.error("Errore lettura utente profilo:", err);
          return res.status(500).json({
            success: false,
            message: "Errore server"
          });
        }

        db.get(
          "SELECT id FROM users WHERE email = ? AND id != ?",
          [email, req.session.user.id],
          async (err, existingUser) => {
            if (err) {
              console.error("Errore controllo email profilo:", err);
              return res.status(500).json({
                success: false,
                message: "Errore server"
              });
            }

            if (existingUser) {
              return res.json({
                success: false,
                message: "Questa email è già in uso"
              });
            }

            if (newPassword) {
              const ok = await bcrypt.compare(currentPassword, user.password);

              if (!ok) {
                return res.json({
                  success: false,
                  message: "Password attuale errata"
                });
              }

              const hashedNewPassword = await bcrypt.hash(newPassword, 10);

              db.run(
                "UPDATE users SET nome = ?, email = ?, password = ? WHERE id = ?",
                [nome, email, hashedNewPassword, req.session.user.id],
                function (err) {
                  if (err) {
                    console.error("Errore update profilo con password:", err);
                    return res.status(500).json({
                      success: false,
                      message: "Errore salvataggio profilo"
                    });
                  }

                  req.session.user.email = email;

                  res.json({
                    success: true,
                    user: {
                      id: req.session.user.id,
                      nome,
                      email,
                      background: user.background
                    }
                  });
                }
              );
            } else {
              db.run(
                "UPDATE users SET nome = ?, email = ? WHERE id = ?",
                [nome, email, req.session.user.id],
                function (err) {
                  if (err) {
                    console.error("Errore update profilo:", err);
                    return res.status(500).json({
                      success: false,
                      message: "Errore salvataggio profilo"
                    });
                  }

                  req.session.user.email = email;

                  res.json({
                    success: true,
                    user: {
                      id: req.session.user.id,
                      nome,
                      email,
                      background: user.background
                    }
                  });
                }
              );
            }
          }
        );
      }
    );
  } catch (error) {
    console.error("Errore /profile:", error);
    res.status(500).json({
      success: false,
      message: "Errore server"
    });
  }
});

/* SALVA SFONDO */
app.put("/preferences/background", requireAuth, (req, res) => {
  const { background } = req.body;

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
        console.error("❌ Errore salvataggio sfondo:", err);
        return res.status(500).json({
          success: false,
          message: "Errore DB"
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

/* TASKS - LISTA */
app.get("/tasks", requireAuth, (req, res) => {
  db.all(
    "SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC",
    [req.session.user.id],
    (err, rows) => {
      if (err) {
        console.error("Errore GET /tasks:", err);
        return res.status(500).json({
          success: false,
          message: "Errore server"
        });
      }

      res.json(rows);
    }
  );
});

/* TASKS - CREA */
app.post("/tasks", requireAuth, (req, res) => {
  const { titolo, descrizione, orario, colore, tipo } = req.body;

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
        console.error("Errore POST /tasks:", err);
        return res.status(500).json({
          success: false,
          message: "Errore server"
        });
      }

      res.json({
        success: true,
        id: this.lastID
      });
    }
  );
});

/* TASKS - MODIFICA */
app.put("/tasks/:id", requireAuth, (req, res) => {
  const taskId = req.params.id;
  const { titolo, descrizione, orario, colore, tipo, completato } = req.body;

  if (titolo !== undefined) {
    db.run(
      `UPDATE tasks
       SET titolo = ?, descrizione = ?, orario = ?, colore = ?, tipo = ?
       WHERE id = ? AND user_id = ?`,
      [
        titolo,
        descrizione || "",
        orario || "",
        colore || "#6ee7ff",
        tipo || "permanente",
        taskId,
        req.session.user.id
      ],
      function (err) {
        if (err) {
          console.error("Errore PUT /tasks/:id:", err);
          return res.status(500).json({
            success: false,
            message: "Errore server"
          });
        }

        res.json({ success: true });
      }
    );
  } else {
    db.run(
      `UPDATE tasks
       SET completato = ?
       WHERE id = ? AND user_id = ?`,
      [completato ? 1 : 0, taskId, req.session.user.id],
      function (err) {
        if (err) {
          console.error("Errore update completato:", err);
          return res.status(500).json({
            success: false,
            message: "Errore server"
          });
        }

        res.json({ success: true });
      }
    );
  }
});

/* TASKS - ELIMINA */
app.delete("/tasks/:id", requireAuth, (req, res) => {
  db.run(
    "DELETE FROM tasks WHERE id = ? AND user_id = ?",
    [req.params.id, req.session.user.id],
    function (err) {
      if (err) {
        console.error("Errore DELETE /tasks/:id:", err);
        return res.status(500).json({
          success: false,
          message: "Errore server"
        });
      }

      res.json({ success: true });
    }
  );
});

/* LOGOUT */
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 SERVER ATTIVO → http://localhost:${PORT}`);
});