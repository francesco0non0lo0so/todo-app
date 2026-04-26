require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

/* ---------------- ENV CHECK ---------------- */

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("❌ Mancano SUPABASE_URL o SUPABASE_KEY");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error("❌ Manca SESSION_SECRET");
  process.exit(1);
}

/* ---------------- SUPABASE ---------------- */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY // 🔥 QUI DEVE ESSERCI SERVICE_ROLE
);

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // 🔥 FIX
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
      return res.json({ success: false, message: "Minimo 8 caratteri." });
    }

    // 🔥 CONTROLLO UTENTE
    const { data: existing, error } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("REGISTER CHECK ERROR:", error);
      return res.json({ success: false, message: "Errore server." });
    }

    if (existing) {
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
      return res.json({ success: false, message: "Registrazione fallita." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("REGISTER CRASH:", err);
    res.json({ success: false, message: "Errore server." });
  }
});

/* ---------------- LOGIN ---------------- */

app.post("/login", async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const password = req.body.password || "";

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) {
      return res.json({ success: false, message: "Credenziali errate." });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.json({ success: false, message: "Credenziali errate." });
    }

    req.session.user = {
      id: user.id,
      email: user.email
    };

    res.json({ success: true });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.json({ success: false });
  }
});

/* ---------------- SESSION ---------------- */

app.get("/me", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ authenticated: false });
    }

    const { data: user } = await supabase
      .from("users")
      .select("id,name,email,background")
      .eq("id", req.session.user.id)
      .maybeSingle();

    if (!user) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        nome: user.name,
        email: user.email,
        background: user.background
      }
    });
  } catch {
    res.json({ authenticated: false });
  }
});

/* ---------------- LOGOUT ---------------- */

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- TASKS ---------------- */

app.get("/tasks", async (req, res) => {
  if (!req.session.user) return res.status(401).json([]);

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", req.session.user.id)
    .order("created_at", { ascending: false });

  res.json(data || []);
});

app.post("/tasks", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { titolo } = req.body;

  if (!titolo || titolo.trim().length < 2) {
    return res.json({ success: false, message: "Titolo non valido." });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert([
      {
        user_id: req.session.user.id,
        titolo: titolo.trim()
      }
    ])
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.json({ success: false });
  }

  res.json({ success: true, id: data.id });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 Server attivo su " + PORT);
});