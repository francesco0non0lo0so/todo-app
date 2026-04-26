require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

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
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- AUTH ---------------- */

app.post("/register", async (req, res) => {
  let { nome, email, password } = req.body;

  email = (email || "").toLowerCase().trim();

  if (!nome || nome.length < 2) return res.json({ success: false });
  if (!email) return res.json({ success: false });
  if (!password || password.length < 8) return res.json({ success: false });

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) {
    return res.json({ success: false });
  }

  const hash = await bcrypt.hash(password, 10);

  await supabase.from("users").insert([
    {
      nome,
      email,
      password: hash
    }
  ]);

  res.json({ success: true });
});

app.post("/login", async (req, res) => {
  const email = (req.body.email || "").toLowerCase().trim();
  const password = req.body.password || "";

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) {
    console.error("LOGIN ERROR:", error);
    return res.json({ success: false, message: "Credenziali errate" });
  }

  const user = data;

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

app.get("/me", async (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id,nome,email,background")
    .eq("id", req.session.user.id)
    .single();

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
  const { titolo, descrizione, orario, colore, tipo } = req.body;

  const { data } = await supabase
    .from("tasks")
    .insert([
      {
        user_id: req.session.user.id,
        titolo,
        descrizione,
        orario,
        colore,
        tipo
      }
    ])
    .select()
    .single();

  res.json({
    success: true,
    id: data.id
  });
});

app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { titolo, descrizione, orario, colore, tipo, completato } = req.body;

  await supabase
    .from("tasks")
    .update({
      titolo,
      descrizione,
      orario,
      colore,
      tipo,
      completato
    })
    .eq("id", id)
    .eq("user_id", req.session.user.id);

  res.json({ success: true });
});

app.delete("/tasks/:id", async (req, res) => {
  await supabase
    .from("tasks")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.session.user.id);

  res.json({ success: true });
});

app.put("/preferences/background", async (req, res) => {
  const { background } = req.body;

  if (!background) return res.json({ success: false });

  await supabase
    .from("users")
    .update({ background })
    .eq("id", req.session.user.id);

  res.json({ success: true });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 Server online sulla porta " + PORT);
});