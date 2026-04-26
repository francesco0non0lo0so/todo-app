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
          name: nome,
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

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("🚀 SERVER AVVIATO SU PORTA", PORT);
});