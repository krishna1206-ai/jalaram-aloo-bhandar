// Tiny client for the backend API in /server.
// In development Vite proxies /api to http://localhost:5000 (see vite.config.js).
// In production set VITE_API_URL to the API's address, e.g. https://jalaram-api.onrender.com
import potatoImg from "./assets/images/potatoes.jpg";
import onionImg from "./assets/images/onions.jpg";
import garlicImg from "./assets/images/garlic.jpg";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "") + "/api";

const USER_KEY = "jab-session";
const ADMIN_KEY = "jab-admin-token";

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

/* ---------- Stored sessions ---------- */

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}
function write(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the session lasts for this page only */
  }
}

let memoryUser = read(localStorage, USER_KEY);
let memoryAdmin = read(sessionStorage, ADMIN_KEY);

export const userSession = {
  get: () => memoryUser,
  set(session) {
    memoryUser = session;
    write(localStorage, USER_KEY, session);
  },
  clear() {
    memoryUser = null;
    write(localStorage, USER_KEY, null);
  },
};

export const adminSession = {
  get: () => memoryAdmin,
  set(token) {
    memoryAdmin = token;
    write(sessionStorage, ADMIN_KEY, token);
  },
  clear() {
    memoryAdmin = null;
    write(sessionStorage, ADMIN_KEY, null);
  },
};

/* ---------- Requests ---------- */

// as: "user" (default) | "admin" | "none"
async function send(path, { method = "GET", body, form, as = "user" } = {}) {
  const headers = {};
  const token = as === "admin" ? adminSession.get() : as === "user" ? userSession.get()?.token : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection and try again.", 0);
  }

  if (res.status === 401 && token) {
    if (as === "admin") adminSession.clear();
    else userSession.clear();
  }
  return res;
}

export async function api(path, options) {
  const res = await send(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.fields);
  return data;
}

// For files (KYC documents in the admin panel)
export async function apiBlob(path, options) {
  const res = await send(path, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status);
  }
  return res.blob();
}

/* ---------- Product pictures (kept in the frontend) ---------- */

export const PRODUCT_IMAGES = { potato: potatoImg, onion: onionImg, garlic: garlicImg };
