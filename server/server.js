require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

/* ---------------- DEBUG ENV ---------------- */

console.log("=== ENV DEBUG ===");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY START:", process.env.SUPABASE_KEY?.slice(0, 20));
console.log("SUPABASE_KEY LENGTH:", process.env.SUPABASE_KEY?.length);
console.log("SESSION_SECRET:", !!process.env.SESSION_SECRET);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("=================");

/* ---------------- CHECK ENV ---------------- */

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("❌ ENV MANCANTI");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET MANCANTE");
  process.exit(1);
}

/* ---------------- SUPABASE ---------------- */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    db: {
      schema: "public"
    }
  }
);

/* ---------------- TEST CONNESSIONE ---------------- */

(async () => {
  console.log("=== TEST SUPABASE ===");

  const { data, error } = await supabase.from("users").select("id").limit(1);

  if (error) {
    console.error("❌ SUPABASE ERROR:", JSON.stringify(error, null, 2));
  } else {
    console.log("✅ SUPABASE OK");
  }

  console.log("======================");
})();

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "../public")));

/* ---------------- REGISTER ---------------- */

app.post("/register", async (req, res) => {
  console.log("=== REGISTER START ===");

  try {
    let { nome, email, password } = req.body;

    console.log("INPUT:", { nome, email, password });

    nome = (nome || "").trim();
    email = (email || "").toLowerCase().trim();
    password = password || "";

    console.log("SANITIZED:", { nome, email, password });

    // 🔥 TEST SELECT
    console.log("TEST SELECT...");

    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    console.log("SELECT RESULT:", existing);
    console.log("SELECT ERROR:", checkError);

    if (checkError) {
      console.error("❌ CHECK ERROR:", JSON.stringify(checkError, null, 2));
      return res.json({ success: false, message: "Errore controllo." });
    }

    if (existing && existing.length > 0) {
      console.log("EMAIL GIÀ ESISTENTE");
      return res.json({ success: false, message: "Email già registrata." });
    }

    console.log("HASH PASSWORD...");
    const hash = await bcrypt.hash(password, 10);

    console.log("TEST INSERT...");

    const { data: insertData, error: insertError } = await supabase
      .from("users")
      .insert([
        {
          nome: nome,
          email,
          password: hash,
          background: "background-1.jpg"
        }
      ])
      .select();

    console.log("INSERT DATA:", insertData);
    console.log("INSERT ERROR:", insertError);

    if (insertError) {
      console.error("❌ INSERT ERROR:", JSON.stringify(insertError, null, 2));
      return res.json({ success: false, message: "Errore insert." });
    }

    console.log("✅ REGISTER OK");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ CRASH:", err);
    res.json({ success: false, message: "Errore server." });
  }

  console.log("=== REGISTER END ===");
});
/* ---------------- LOGIN ---------------- */

app.post("/login", async (req, res) => {
  try {
    console.log("=== LOGIN START ===");

    const email = (req.body.email || "").toLowerCase().trim();
    const password = req.body.password || "";

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    console.log("USER:", user);
    console.log("ERROR:", error);

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

    console.log("✅ LOGIN OK");

    return res.json({ success: true });

  } catch (err) {
    console.error("🔥 LOGIN CRASH:", err);
    return res.json({ success: false, message: "Errore server." });
  }
});

/* ---------------- SESSION CHECK ---------------- */

app.get("/me", async (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, nome, email, background")
    .eq("id", req.session.user.id)
    .maybeSingle();

  if (error || !user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      background: user.background
    }
  });
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
    .select()
    .single();

  if (error) {
    console.error("TASK INSERT ERROR:", error);
    return res.json({ success: false, message: "Errore creazione task." });
  }

  res.json({ success: true, id: data.id });
});

app.put("/tasks/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  const { id } = req.params;

  const { error } = await supabase
    .from("tasks")
    .update(req.body)
    .eq("id", id)
    .eq("user_id", req.session.user.id);

  if (error) {
    console.error("TASK UPDATE ERROR:", error);
    return res.json({ success: false });
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
    return res.json({ success: false });
  }

  res.json({ success: true });
});

/* ---------------- BACKGROUND ---------------- */

app.put("/preferences/background", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false });
  }

  const { background } = req.body;

  const { error } = await supabase
    .from("users")
    .update({ background }) // 👉 salva anche "random"
    .eq("id", req.session.user.id);

  if (error) {
    console.error("BACKGROUND ERROR:", error);
    return res.json({ success: false });
  }

  res.json({ success: true });
});
/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 SERVER AVVIATO SU PORTA", PORT);
});