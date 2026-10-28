// Simple demo login, saved in the browser so it survives a page refresh
const KEY = "jab-user";

const DEMO_USER = {
  name: "Test User",
  email: "test@gmail.com",
  clientId: "JAB10234",
  balance: 25000,
};

export function getUser() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function login(email, password) {
  if (email.trim().toLowerCase() === DEMO_USER.email && password === "123456") {
    try {
      localStorage.setItem(KEY, JSON.stringify(DEMO_USER));
    } catch {
      /* storage blocked: login still works for this visit */
    }
    return true;
  }
  return false;
}

export function logout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function initialsOf(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}