let editingTaskId = null;
let currentUser = null;
let tasksCache = [];
let selectedBackground = "background-1.jpg";

const AUTH_BACKGROUNDS = [
  "background-1.jpg",
  "background-2.jpg",
  "background-3.jpg",
  "background-4.jpg",
  "background-5.jpg"
];

document.addEventListener("DOMContentLoaded", () => {
  if (isAuthPage()) initAuthPage();
  if (isAppPage()) initAppPage();
});

function isAuthPage() {
  return !!(
    document.getElementById("loginForm") &&
    document.getElementById("registerForm")
  );
}

function isAppPage() {
  return !!(
    document.getElementById("taskList") &&
    document.getElementById("saveTaskBtn")
  );
}

/* ---------------- AUTH PAGE ---------------- */

function initAuthPage() {
  applyRandomAuthBackground();
  initAuthTabs();
  initAuthForms();
  initPasswordToggles();
  checkSessionAndRedirect();
}

function applyRandomAuthBackground() {
  const bg = document.getElementById("authPageBg");
  if (!bg) return;

  const randomFile =
    AUTH_BACKGROUNDS[Math.floor(Math.random() * AUTH_BACKGROUNDS.length)];

  bg.style.backgroundImage = `url("images/${randomFile}")`;
}

function initAuthTabs() {
  const showLoginBtn = document.getElementById("showLoginBtn");
  const showRegisterBtn = document.getElementById("showRegisterBtn");

  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => switchAuthTab("login"));
  }

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", () => switchAuthTab("register"));
  }
}

function initAuthForms() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginForm) {
    loginForm.addEventListener("submit", loginUser);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", registerUser);
  }
}

function switchAuthTab(tab) {
  const loginSection = document.getElementById("loginSection");
  const registerSection = document.getElementById("registerSection");
  const showLoginBtn = document.getElementById("showLoginBtn");
  const showRegisterBtn = document.getElementById("showRegisterBtn");

  clearMessage("loginMessage");
  clearMessage("registerMessage");

  if (tab === "login") {
    if (loginSection) {
      loginSection.classList.remove("hidden");
      loginSection.classList.add("active");
    }

    if (registerSection) {
      registerSection.classList.add("hidden");
      registerSection.classList.remove("active");
    }

    if (showLoginBtn) showLoginBtn.classList.add("active");
    if (showRegisterBtn) showRegisterBtn.classList.remove("active");
  } else {
    if (registerSection) {
      registerSection.classList.remove("hidden");
      registerSection.classList.add("active");
    }

    if (loginSection) {
      loginSection.classList.add("hidden");
      loginSection.classList.remove("active");
    }

    if (showRegisterBtn) showRegisterBtn.classList.add("active");
    if (showLoginBtn) showLoginBtn.classList.remove("active");
  }
}

async function checkSessionAndRedirect() {
  try {
    const session = await getCurrentUser();
    if (session?.authenticated) {
      window.location.href = "app.html";
    }
  } catch (error) {
    console.error("Errore controllo sessione:", error);
  }
}

async function loginUser(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail")?.value.trim().toLowerCase() || "";
  const password = document.getElementById("loginPassword")?.value || "";

  clearMessage("loginMessage");

  if (!validateEmail(email)) {
    showMessage("loginMessage", "Inserisci un'email valida.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("loginMessage", "La password deve avere almeno 6 caratteri.", "error");
    return;
  }

  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    const text = await response.text();
console.log("RISPOSTA LOGIN:", text);

let data;
try {
  data = JSON.parse(text);
} catch {
  throw new Error("Risposta non JSON");
}

    if (!response.ok || !data.success) {
      showMessage("loginMessage", data.message || "Email o password non corretti.", "error");
      return;
    }

    showMessage("loginMessage", "Accesso effettuato. Reindirizzamento...", "success");

    setTimeout(() => {
      window.location.href = "app.html";
    }, 700);
  } catch (error) {
    showMessage("loginMessage", "Errore di connessione al server.", "error");
  }
}

async function registerUser(event) {
  event.preventDefault();

  const nome = document.getElementById("registerName")?.value.trim() || "";
  const email = document.getElementById("registerEmail")?.value.trim().toLowerCase() || "";
  const password = document.getElementById("registerPassword")?.value || "";
  const confirmPassword = document.getElementById("registerConfirmPassword")?.value || "";

  clearMessage("registerMessage");

  if (nome.length < 2) {
    showMessage("registerMessage", "Inserisci un nome valido.", "error");
    return;
  }

  if (!validateEmail(email)) {
    showMessage("registerMessage", "Inserisci un'email valida.", "error");
    return;
  }

  if (password.length < 8) {
    showMessage("registerMessage", "La password deve avere almeno 8 caratteri.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("registerMessage", "Le password non coincidono.", "error");
    return;
  }

  try {
    const response = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ nome, email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage("registerMessage", data.message || "Registrazione non riuscita.", "error");
      return;
    }

    showMessage("registerMessage", "Account creato con successo. Ora puoi accedere.", "success");

    const registerForm = document.getElementById("registerForm");
    if (registerForm) registerForm.reset();

    setTimeout(() => {
      switchAuthTab("login");
      const loginEmail = document.getElementById("loginEmail");
      if (loginEmail) loginEmail.value = email;
    }, 900);
  } catch (error) {
    showMessage("registerMessage", "Errore di connessione al server.", "error");
  }
}

/* ---------------- APP PAGE ---------------- */

async function initAppPage() {
  function bindAppEvents() {
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const taskSortSelect = document.getElementById("taskSortSelect");

  const profileMenuBtn = document.getElementById("profileMenuBtn");
  const showTasksPanelBtn = document.getElementById("showTasksPanelBtn");
  const showProfilePanelBtn = document.getElementById("showProfilePanelBtn");
  const showBackgroundPanelBtn = document.getElementById("showBackgroundPanelBtn");

  const navTasksBtn = document.getElementById("navTasksBtn");
  const navProfileBtn = document.getElementById("navProfileBtn");
  const navBackgroundBtn = document.getElementById("navBackgroundBtn");

  const saveProfileBtn = document.getElementById("saveProfileBtn");

  // 🔥 NUOVO BOTTONE DELETE
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");

  if (saveTaskBtn) saveTaskBtn.addEventListener("click", handleSaveTask);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", resetTaskForm);
  if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);
  if (taskSortSelect) taskSortSelect.addEventListener("change", renderSortedTasks);

  if (saveProfileBtn) saveProfileBtn.addEventListener("click", saveProfileSettings);

  // 🔥 CLICK DELETE ACCOUNT
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", deleteAccount);
  }

  if (profileMenuBtn) {
    profileMenuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleProfileDropdown();
    });
  }

  if (showTasksPanelBtn) {
    showTasksPanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("tasks");
    });
  }

  if (showProfilePanelBtn) {
    showProfilePanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("profile");
    });
  }

  if (showBackgroundPanelBtn) {
    showBackgroundPanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("background");
    });
  }

  if (navTasksBtn) navTasksBtn.addEventListener("click", () => switchAppPanel("tasks"));
  if (navProfileBtn) navProfileBtn.addEventListener("click", () => switchAppPanel("profile"));
  if (navBackgroundBtn) navBackgroundBtn.addEventListener("click", () => switchAppPanel("background"));

  bindBackgroundOptions();
  document.addEventListener("click", handleGlobalClick);
}
  initPasswordToggles();

  const session = await getCurrentUser();

  if (!session?.authenticated) {
    window.location.href = "index.html";
    return;
  }

  currentUser = session.user || null;

  applyCurrentUserToUI();
  preloadProfileData();
  applyCurrentBackground();
  await loadTasks();
}

function bindAppEvents() {
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const taskSortSelect = document.getElementById("taskSortSelect");

  const profileMenuBtn = document.getElementById("profileMenuBtn");
  const showTasksPanelBtn = document.getElementById("showTasksPanelBtn");
  const showProfilePanelBtn = document.getElementById("showProfilePanelBtn");
  const showBackgroundPanelBtn = document.getElementById("showBackgroundPanelBtn");

  const navTasksBtn = document.getElementById("navTasksBtn");
  const navProfileBtn = document.getElementById("navProfileBtn");
  const navBackgroundBtn = document.getElementById("navBackgroundBtn");

  const saveProfileBtn = document.getElementById("saveProfileBtn");

  if (saveTaskBtn) saveTaskBtn.addEventListener("click", handleSaveTask);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", resetTaskForm);
  if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);
  if (taskSortSelect) taskSortSelect.addEventListener("change", renderSortedTasks);

  if (profileMenuBtn) {
    profileMenuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleProfileDropdown();
    });
  }

  if (showTasksPanelBtn) {
    showTasksPanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("tasks");
    });
  }

  if (showProfilePanelBtn) {
    showProfilePanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("profile");
    });
  }

  if (showBackgroundPanelBtn) {
    showBackgroundPanelBtn.addEventListener("click", () => {
      closeProfileDropdown();
      switchAppPanel("background");
    });
  }

  if (navTasksBtn) navTasksBtn.addEventListener("click", () => switchAppPanel("tasks"));
  if (navProfileBtn) navProfileBtn.addEventListener("click", () => switchAppPanel("profile"));
  if (navBackgroundBtn) navBackgroundBtn.addEventListener("click", () => switchAppPanel("background"));

  if (saveProfileBtn) saveProfileBtn.addEventListener("click", saveProfileSettings);

  bindBackgroundOptions();
  document.addEventListener("click", handleGlobalClick);
}

function handleGlobalClick(event) {
  const dropdown = document.getElementById("profileDropdown");
  const profileBtn = document.getElementById("profileMenuBtn");

  if (
    dropdown &&
    !dropdown.classList.contains("hidden") &&
    profileBtn &&
    !profileBtn.contains(event.target) &&
    !dropdown.contains(event.target)
  ) {
    closeProfileDropdown();
  }
}

function switchAppPanel(panelName) {
  const panels = {
    tasks: document.getElementById("tasksPanel"),
    profile: document.getElementById("profilePanel"),
    background: document.getElementById("backgroundPanel")
  };

  const buttons = {
    tasks: [
      document.getElementById("navTasksBtn"),
      document.getElementById("showTasksPanelBtn")
    ],
    profile: [
      document.getElementById("navProfileBtn"),
      document.getElementById("showProfilePanelBtn")
    ],
    background: [
      document.getElementById("navBackgroundBtn"),
      document.getElementById("showBackgroundPanelBtn")
    ]
  };

  Object.entries(panels).forEach(([key, panel]) => {
    if (!panel) return;
    const active = key === panelName;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
  });

  Object.entries(buttons).forEach(([key, group]) => {
    const active = key === panelName;
    group.forEach((btn) => {
      if (btn) btn.classList.toggle("active", active);
    });
  });

  if (panelName === "profile") {
    preloadProfileData();
  }

  if (panelName === "background") {
    markSelectedBackground(selectedBackground);
  }
}

async function getCurrentUser() {
  try {
    const response = await fetch("/me", {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      return { authenticated: false };
    }

    return await response.json();
  } catch (error) {
    return { authenticated: false };
  }
}

async function logoutUser() {
  try {
    await fetch("/logout", {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Errore logout:", error);
  }

  window.location.href = "index.html";
}

/* ---------------- PASSWORD TOGGLES ---------------- */

function initPasswordToggles() {
  const toggleButtons = document.querySelectorAll(".password-toggle");

  toggleButtons.forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;

      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";

      button.setAttribute("data-visible", willShow ? "true" : "false");
      button.setAttribute("aria-label", willShow ? "Nascondi password" : "Mostra password");
      button.setAttribute("title", willShow ? "Nascondi password" : "Mostra password");
    });
  });
}

/* ---------------- USER / PROFILE ---------------- */

function applyCurrentUserToUI() {
  if (!currentUser) return;

  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");
  const profileAvatar = document.getElementById("profileAvatar");

  const nome = currentUser.nome || "Utente";
  const email = currentUser.email || "";
  const initial = nome.trim().charAt(0).toUpperCase() || "U";

  if (userName) userName.textContent = nome;
  if (userEmail) userEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = initial;
}

function preloadProfileData() {
  if (!currentUser) return;

  const nome = currentUser.nome || "";
  const email = currentUser.email || "";

  const profileNameInput = document.getElementById("profileNameInput");
  const profileEmailInput = document.getElementById("profileEmailInput");

  if (profileNameInput) profileNameInput.value = nome;
  if (profileEmailInput) profileEmailInput.value = email;

  selectedBackground = currentUser.background || "background-1.jpg";
  markSelectedBackground(selectedBackground);
}

async function saveProfileSettings() {
  const nome = document.getElementById("profileNameInput")?.value.trim() || "";
  const email = document.getElementById("profileEmailInput")?.value.trim().toLowerCase() || "";
  const currentPassword = document.getElementById("currentPasswordInput")?.value || "";
  const newPassword = document.getElementById("newPasswordInput")?.value || "";
  const confirmNewPassword = document.getElementById("confirmNewPasswordInput")?.value || "";

  clearMessage("profileMessage");

  if (nome.length < 2) {
    showMessage("profileMessage", "Inserisci un nome valido.", "error");
    return;
  }

  if (!validateEmail(email)) {
    showMessage("profileMessage", "Inserisci un'email valida.", "error");
    return;
  }

  if ((newPassword || confirmNewPassword) && !currentPassword) {
    showMessage("profileMessage", "Inserisci la password attuale per cambiarla.", "error");
    return;
  }

  if (newPassword && newPassword.length < 8) {
    showMessage("profileMessage", "La nuova password deve avere almeno 8 caratteri.", "error");
    return;
  }

  if (newPassword !== confirmNewPassword) {
    showMessage("profileMessage", "Le nuove password non coincidono.", "error");
    return;
  }

  try {
    const response = await fetch("/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        nome,
        email,
        currentPassword,
        newPassword
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage("profileMessage", data.message || "Salvataggio profilo non riuscito.", "error");
      return;
    }

    currentUser = {
      ...currentUser,
      ...(data.user || {}),
      nome,
      email
    };

    applyCurrentUserToUI();
    showMessage("profileMessage", "Profilo aggiornato con successo.", "success");

    const currentPasswordInput = document.getElementById("currentPasswordInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");

    if (currentPasswordInput) currentPasswordInput.value = "";
    if (newPasswordInput) newPasswordInput.value = "";
    if (confirmNewPasswordInput) confirmNewPasswordInput.value = "";
  } catch (error) {
    showMessage("profileMessage", "Errore durante il salvataggio del profilo.", "error");
  }
}

/* ---------------- BACKGROUNDS ---------------- */

function bindBackgroundOptions() {
  const options = document.querySelectorAll(".background-option");

  options.forEach((option) => {
    option.addEventListener("click", async () => {
      selectedBackground = option.dataset.bg || "background-1.jpg";

      markSelectedBackground(selectedBackground);

      if (selectedBackground === "random") {
        applyRandomBackground();
      } else {
        previewBackground(selectedBackground);
      }

      await saveBackgroundPreference();
    });
  });
}

function applyRandomBackground() {
  const randomFile =
    AUTH_BACKGROUNDS[Math.floor(Math.random() * AUTH_BACKGROUNDS.length)];

  previewBackground(randomFile);
}

function previewBackground(bgFile) {
  const pageBg = document.getElementById("pageBg");
  if (!pageBg) return;

  if (bgFile === "random") {
    applyRandomBackground();
    return;
  }

  pageBg.style.backgroundImage = `url("images/${bgFile}")`;
}

function applyCurrentBackground() {
  const bg = currentUser?.background || "background-1.jpg";
  selectedBackground = bg;

  if (bg === "random") {
    applyRandomBackground();
  } else {
    previewBackground(bg);
  }

  markSelectedBackground(bg);
}

async function saveBackgroundPreference() {
  clearMessage("backgroundMessage");

  try {
    const response = await fetch("/preferences/background", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ background: selectedBackground })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage("backgroundMessage", data.message || "Errore salvataggio.", "error");
      return;
    }

    currentUser = {
      ...currentUser,
      background: selectedBackground
    };

    showMessage("backgroundMessage", "Salvato automaticamente ✔", "success");
  } catch (error) {
    showMessage("backgroundMessage", "Errore server.", "error");
  }
}

/* ---------------- TASKS ---------------- */

async function loadTasks() {
  try {
    const response = await fetch("/tasks", {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "index.html";
        return;
      }

      showMessage("taskMessage", "Impossibile caricare le task.", "error");
      return;
    }

    const tasks = await response.json();
    tasksCache = Array.isArray(tasks) ? tasks : [];
    renderSortedTasks();
  } catch (error) {
    showMessage("taskMessage", "Errore durante il caricamento delle task.", "error");
  }
}

function renderSortedTasks() {
  const sortType = document.getElementById("taskSortSelect")?.value || "default";
  const tasks = [...tasksCache];

  if (sortType === "time") {
    tasks.sort((a, b) => (a.orario || "99:99").localeCompare(b.orario || "99:99"));
  } else if (sortType === "title") {
    tasks.sort((a, b) => (a.titolo || "").localeCompare(b.titolo || ""));
  } else if (sortType === "created") {
    tasks.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  renderTasks(tasks);
}

async function handleSaveTask() {
  const titolo = document.getElementById("taskTitle")?.value.trim() || "";
  const descrizione = document.getElementById("taskDescription")?.value.trim() || "";
  const orario = document.getElementById("taskTime")?.value || "";
  const colore = document.getElementById("taskColor")?.value || "#6ee7ff";
  const tipo = document.getElementById("taskType")?.value || "permanente";

  clearMessage("taskMessage");

  if (titolo.length < 2) {
    showMessage("taskMessage", "Il titolo deve avere almeno 2 caratteri.", "error");
    return;
  }

  const payload = { titolo, descrizione, orario, colore, tipo };

  try {
    if (editingTaskId) {
      const response = await fetch(`/tasks/${editingTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage("taskMessage", data.message || "Modifica non riuscita.", "error");
        return;
      }

      showMessage("taskMessage", "Task aggiornata con successo.", "success");
    } else {
      const response = await fetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage("taskMessage", data.message || "Creazione task non riuscita.", "error");
        return;
      }

      showMessage("taskMessage", "Task aggiunta con successo.", "success");
    }

    resetTaskForm();
    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", "Errore durante il salvataggio della task.", "error");
  }
}

async function deleteTask(id) {
  const conferma = confirm("Vuoi davvero eliminare questa task?");
  if (!conferma) return;

  try {
    const response = await fetch(`/tasks/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage("taskMessage", data.message || "Eliminazione non riuscita.", "error");
      return;
    }

    showMessage("taskMessage", "Task eliminata.", "success");

    if (editingTaskId === id) {
      resetTaskForm();
    }

    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", "Errore durante l'eliminazione.", "error");
  }
}

async function toggleTaskComplete(id, completato) {
  try {
    const response = await fetch(`/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ completato })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage("taskMessage", data.message || "Aggiornamento stato non riuscito.", "error");
      return;
    }

    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", "Errore durante l'aggiornamento dello stato.", "error");
  }
}

function renderTasks(tasks) {
  const taskList = document.getElementById("taskList");
  const emptyState = document.getElementById("emptyState");

  if (!taskList) return;

  taskList.innerHTML = "";

  if (!tasks.length) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  tasks.forEach((task) => {
    taskList.appendChild(renderTaskItem(task));
  });
}

function renderTaskItem(task) {
  const li = document.createElement("li");
  li.className = "task-item";

  if (task.completato) {
    li.classList.add("completed");
  }

  li.style.setProperty("--task-accent", task.colore || "#6ee7ff");

  const top = document.createElement("div");
  top.className = "task-top";

  const left = document.createElement("div");
  left.className = "task-left";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked = Boolean(task.completato);
  checkbox.addEventListener("change", () => {
    toggleTaskComplete(task.id, checkbox.checked);
  });

  const content = document.createElement("div");
  content.className = "task-content";

  const titleRow = document.createElement("div");
  titleRow.className = "task-title-row";

  const colorDot = document.createElement("span");
  colorDot.className = "task-color-dot";

  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.titolo || "Task senza titolo";

  titleRow.appendChild(colorDot);
  titleRow.appendChild(title);

  const description = document.createElement("p");
  description.className = "task-description";
  description.textContent = task.descrizione || "Nessuna descrizione";

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const timeBadge = document.createElement("span");
  timeBadge.className = "task-badge";
  timeBadge.textContent = task.orario ? `⏰ ${task.orario}` : "⏰ Nessun orario";

  const typeBadge = document.createElement("span");
  typeBadge.className = "task-badge";
  typeBadge.textContent = task.tipo === "giornaliero" ? "🔁 Giornaliero" : "📌 Permanente";

  meta.appendChild(timeBadge);
  meta.appendChild(typeBadge);

  content.appendChild(titleRow);
  content.appendChild(description);
  content.appendChild(meta);

  left.appendChild(checkbox);
  left.appendChild(content);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "mini-btn";
  editBtn.type = "button";
  editBtn.textContent = "Modifica";
  editBtn.addEventListener("click", () => fillFormForEdit(task));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "mini-btn danger";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Elimina";
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  top.appendChild(left);
  top.appendChild(actions);
  li.appendChild(top);

  return li;
}

function fillFormForEdit(task) {
  editingTaskId = task.id;

  const taskTitle = document.getElementById("taskTitle");
  const taskDescription = document.getElementById("taskDescription");
  const taskTime = document.getElementById("taskTime");
  const taskColor = document.getElementById("taskColor");
  const taskType = document.getElementById("taskType");
  const formTitle = document.getElementById("formTitle");
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  if (taskTitle) taskTitle.value = task.titolo || "";
  if (taskDescription) taskDescription.value = task.descrizione || "";
  if (taskTime) taskTime.value = task.orario || "";
  if (taskColor) taskColor.value = task.colore || "#6ee7ff";
  if (taskType) taskType.value = task.tipo || "permanente";

  if (formTitle) formTitle.textContent = "Modifica task";
  if (saveTaskBtn) saveTaskBtn.textContent = "Salva modifiche";
  if (cancelEditBtn) cancelEditBtn.classList.remove("hidden");

  switchAppPanel("tasks");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function resetTaskForm() {
  editingTaskId = null;

  const taskTitle = document.getElementById("taskTitle");
  const taskDescription = document.getElementById("taskDescription");
  const taskTime = document.getElementById("taskTime");
  const taskColor = document.getElementById("taskColor");
  const taskType = document.getElementById("taskType");
  const formTitle = document.getElementById("formTitle");
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  if (taskTitle) taskTitle.value = "";
  if (taskDescription) taskDescription.value = "";
  if (taskTime) taskTime.value = "";
  if (taskColor) taskColor.value = "#6ee7ff";
  if (taskType) taskType.value = "permanente";

  if (formTitle) formTitle.textContent = "Nuova task";
  if (saveTaskBtn) saveTaskBtn.textContent = "Aggiungi task";
  if (cancelEditBtn) cancelEditBtn.classList.add("hidden");

  clearMessage("taskMessage");
}

/* ---------------- PROFILE DROPDOWN ---------------- */

function toggleProfileDropdown() {
  const dropdown = document.getElementById("profileDropdown");
  const button = document.getElementById("profileMenuBtn");
  if (!dropdown || !button) return;

  const willOpen = dropdown.classList.contains("hidden");
  dropdown.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeProfileDropdown() {
  const dropdown = document.getElementById("profileDropdown");
  const button = document.getElementById("profileMenuBtn");
  if (!dropdown || !button) return;

  dropdown.classList.add("hidden");
  button.setAttribute("aria-expanded", "false");
}

function markSelectedBackground(bgFile) {
  const options = document.querySelectorAll(".background-option");

  options.forEach((option) => {
    const isActive = option.dataset.bg === bgFile;
    option.classList.toggle("active", isActive);
  });
}

/* ---------------- HELPERS ---------------- */

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(elementId, text, type = "info") {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = text;
  element.className = `form-message ${type}`;
}

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = "";
  element.className = "form-message";
}
async function deleteAccount() {
  const conferma = confirm("Sei sicuro di voler eliminare definitivamente l'account? Questa azione NON si può annullare.");

  if (!conferma) return;

  try {
    const response = await fetch("/delete-account", {
      method: "DELETE",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert("Errore durante l'eliminazione.");
      return;
    }

    alert("Account eliminato.");

    window.location.href = "index.html";

  } catch (error) {
    alert("Errore server.");
  }
}