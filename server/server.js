require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("❌ Mancano SUPABASE_URL o SUPABASE_KEY nelle variabili ambiente.");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error("❌ Manca SESSION_SECRET nelle variabili ambiente.");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- AUTH ---------------- */

app.post("/register", async (req, res) => {
  try {
    let { nome, email, password } = req.body;

    nome = (nome || "").trim();
    email = (email || "").toLowerCase().trim();
    password = password || "";

    if (nome.length < 2) {
      return res.json({ success: false, message: "Nome troppo corto." });
    }

    if (!email) {
      return res.json({ success: false, message: "Email obbligatoria." });
    }

    if (password.length < 8) {
      return res.json({ success: false, message: "La password deve avere almeno 8 caratteri." });
    }

    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    if (checkError) {
  console.error("REGISTER CHECK ERROR FULL:", JSON.stringify(checkError, null, 2));
  return res.json({
    success: false,
    message: "Errore controllo utente."
  });
}

    if (existing && existing.length > 0) {
      return res.json({ success: false, message: "Email già registrata." });
    }

    const hash = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase
      .from("users")
      .insert([
        {
          name: nome,
          email,
          password: hash,
          background: "background-1.jpg"
        }
      ]);

    if (insertError) {
      console.error("REGISTER INSERT ERROR:", insertError);
      return res.json({ success: false, message: "Registrazione non riuscita." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("REGISTER CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const password = req.body.password || "";

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email);

    if (error || !data || data.length === 0) {
      return res.json({ success: false, message: "Credenziali errate." });
    }

    const user = data[0];
    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.json({ success: false, message: "Credenziali errate." });
    }

    req.session.user = {
      id: user.id,
      email: user.email
    };

    return res.json({ success: true });
  } catch (err) {
    console.error("LOGIN CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.get("/me", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ authenticated: false });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,background")
      .eq("id", req.session.user.id);

    if (error || !data || data.length === 0) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: {
        id: data[0].id,
        nome: data[0].name,
        email: data[0].email,
        background: data[0].background
      }
    });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.json({ authenticated: false });
  }
});

app.put("/profile", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Non autenticato." });
    }

    let { nome, email, currentPassword, newPassword } = req.body;

    nome = (nome || "").trim();
    email = (email || "").toLowerCase().trim();
    currentPassword = currentPassword || "";
    newPassword = newPassword || "";

    if (nome.length < 2) {
      return res.json({ success: false, message: "Nome non valido." });
    }

    if (!email) {
      return res.json({ success: false, message: "Email non valida." });
    }

    const { data: users, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.session.user.id);

    if (userError || !users || users.length === 0) {
      return res.json({ success: false, message: "Utente non trovato." });
    }

    const user = users[0];

    const { data: emailUsers, error: emailCheckError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    if (emailCheckError) {
      console.error("PROFILE EMAIL CHECK ERROR:", emailCheckError);
      return res.json({ success: false, message: "Errore controllo email." });
    }

    const emailUsedByAnotherUser =
      emailUsers &&
      emailUsers.some((u) => String(u.id) !== String(user.id));

    if (emailUsedByAnotherUser) {
      return res.json({ success: false, message: "Questa email è già in uso." });
    }

    const updatePayload = {
      name: nome,
      email
    };

    if (newPassword) {
      if (newPassword.length < 8) {
        return res.json({ success: false, message: "La nuova password deve avere almeno 8 caratteri." });
      }

      const passwordOk = await bcrypt.compare(currentPassword, user.password);

      if (!passwordOk) {
        return res.json({ success: false, message: "Password attuale errata." });
      }

      updatePayload.password = await bcrypt.hash(newPassword, 10);
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", req.session.user.id);

    if (updateError) {
      console.error("PROFILE UPDATE ERROR:", updateError);
      return res.json({ success: false, message: "Aggiornamento profilo non riuscito." });
    }

    req.session.user.email = email;

    return res.json({
      success: true,
      user: {
        id: user.id,
        nome,
        email,
        background: user.background
      }
    });
  } catch (err) {
    console.error("PROFILE CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- TASKS ---------------- */

app.get("/tasks", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json([]);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", req.session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("TASK LOAD ERROR:", error);
      return res.json([]);
    }

    return res.json(data || []);
  } catch (err) {
    console.error("TASK LOAD CRASH:", err);
    return res.json([]);
  }
});

app.post("/tasks", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ success: false });

    const { titolo, descrizione, orario, colore, tipo } = req.body;

    if (!titolo || titolo.trim().length < 2) {
      return res.json({ success: false, message: "Titolo non valido." });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          user_id: req.session.user.id,
          titolo: titolo.trim(),
          descrizione: descrizione || "",
          orario: orario || "",
          colore: colore || "#6ee7ff",
          tipo: tipo || "permanente"
        }
      ])
      .select();

    if (error) {
      console.error("TASK INSERT ERROR:", error);
      return res.json({ success: false, message: "Creazione task non riuscita." });
    }

    return res.json({
      success: true,
      id: data[0].id
    });
  } catch (err) {
    console.error("TASK INSERT CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.put("/tasks/:id", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ success: false });

    const { id } = req.params;
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "titolo")) {
      updates.titolo = req.body.titolo;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "descrizione")) {
      updates.descrizione = req.body.descrizione;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "orario")) {
      updates.orario = req.body.orario;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "colore")) {
      updates.colore = req.body.colore;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "tipo")) {
      updates.tipo = req.body.tipo;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "completato")) {
      updates.completato = !!req.body.completato;
    }

    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .eq("user_id", req.session.user.id);

    if (error) {
      console.error("TASK UPDATE ERROR:", error);
      return res.json({ success: false, message: "Aggiornamento task non riuscito." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("TASK UPDATE CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.delete("/tasks/:id", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ success: false });

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.session.user.id);

    if (error) {
      console.error("TASK DELETE ERROR:", error);
      return res.json({ success: false, message: "Eliminazione non riuscita." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("TASK DELETE CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

app.put("/preferences/background", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ success: false });

    const { background } = req.body;

    const allowed = [
      "random",
      "background-1.jpg",
      "background-2.jpg",
      "background-3.jpg",
      "background-4.jpg",
      "background-5.jpg"
    ];

    if (!allowed.includes(background)) {
      return res.json({ success: false, message: "Sfondo non valido." });
    }

    const { error } = await supabase
      .from("users")
      .update({ background })
      .eq("id", req.session.user.id);

    if (error) {
      console.error("BACKGROUND ERROR:", error);
      return res.json({ success: false, message: "Errore salvataggio sfondo." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("BACKGROUND CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

/* ---------------- HTML ROUTES ---------------- */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/app.html"));
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 Server online sulla porta " + PORT);
});