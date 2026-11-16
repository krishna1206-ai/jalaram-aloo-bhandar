// User login, backed by the API. The token and a small user summary are kept in localStorage
// so the navbar can show the account right after a page refresh.
import { api, userSession } from "./api.js";

export function getUser() {
  return userSession.get()?.user ?? null;
}

export function isLoggedIn() {
  return Boolean(userSession.get()?.token);
}

export async function login(identifier, password) {
  const { token, user } = await api("/auth/login", { method: "POST", body: { identifier, password }, as: "none" });
  userSession.set({ token, user });
  return user;
}

export function saveSession(token, user) {
  userSession.set({ token, user });
}

// Keep the cached summary (name, balance) in step with the latest /api/me answer
export function updateUser(changes) {
  const s = userSession.get();
  if (s) userSession.set({ ...s, user: { ...s.user, ...changes } });
}

export function logout() {
  userSession.clear();
}

export function initialsOf(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
