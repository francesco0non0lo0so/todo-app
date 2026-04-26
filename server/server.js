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
    secret: process.env.SESSION_SECRET || "secret",
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
  try {
    let { name, email, password } = req.body;

    email = (email || "").toLowerCase().trim();

    if (!name || name.length < 2) return res.json({ success: false });
    if (!email) return res.json({ success: false });
    if (!password || password.length < 8) return res.json({ success: false });

    // 🔥 FIX: niente .single()
    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email);

    if (checkError) {
      console.error("REGISTER CHECK ERROR:", checkError);
      return res.json({ success: false });
    }

    if (existing && existing.length > 0) {
      return res.json({ success: false });
    }

    const hash = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase.from("users").insert([
      {
        name,
        email,
        password: hash
      }
    ]);

    if (insertError) {
      console.error("REGISTER INSERT ERROR:", insertError);
      return res.json({ success: false });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("REGISTER CRASH:", err);
    res.json({ success: false });
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

    console.log("LOGIN EMAIL:", email);
    console.log("DB RESULT:", data);
    console.log("DB ERROR:", error);

    if (error || !data || data.length === 0) {
      return res.json({ success: false, message: "Credenziali errate" });
    }

    const user = data[0];

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.json({ success: false, message: "Credenziali errate" });
    }

    req.session.user = {
      id: user.id,
      email: user.email
    };

    res.json({ success: true });

  } catch (err) {
    console.error("LOGIN CRASH:", err);
    res.json({ success: false, message: "Errore server" });
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

    res.json({
      authenticated: true,
      user: data[0]
    });

  } catch (err) {
    res.json({ authenticated: false });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ---------------- TASKS ---------------- */

app.get("/tasks", async (req, res) => {
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

  res.json(data || []);
});

app.post("/tasks", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { titolo, descrizione, orario, colore, tipo } = req.body;

  const { data, error } = await supabase
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
    .select();

  if (error) {
    console.error("TASK INSERT ERROR:", error);
    return res.json({ success: false });
  }

  res.json({
    success: true,
    id: data[0].id
  });
});

app.put("/tasks/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { id } = req.params;
  const { titolo, descrizione, orario, colore, tipo, completato } = req.body;

  const { error } = await supabase
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

  if (error) {
    console.error("TASK UPDATE ERROR:", error);
  }

  res.json({ success: true });
});

app.delete("/tasks/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.session.user.id);

  if (error) {
    console.error("TASK DELETE ERROR:", error);
  }

  res.json({ success: true });
});

app.put("/preferences/background", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { background } = req.body;

  if (!background) return res.json({ success: false });

  const { error } = await supabase
    .from("users")
    .update({ background })
    .eq("id", req.session.user.id);

  if (error) {
    console.error("BACKGROUND ERROR:", error);
    return res.json({ success: false });
  }

  res.json({ success: true });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 Server online sulla porta " + PORT);
});