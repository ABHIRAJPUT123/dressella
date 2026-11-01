import axios from "axios";

export const BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001").replace(/\/$/, "");
export const api = axios.create({ baseURL: `${BASE}/api`, withCredentials: true, timeout: 20000 });

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config || {};
    const url = cfg.url || "";
    if (error.response?.status === 401 && !cfg._retry && !url.includes("/auth/")) {
      cfg._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh").finally(() => (refreshing = null));
        await refreshing;
        return api(cfg);
      } catch (_) {
        /* fall through */
      }
    }
    return Promise.reject(error);
  }
);

export const img = (path) => (!path ? undefined : path.startsWith("http") ? path : `${BASE}/api/media/${path}`);
export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export function errMsg(e, fallback = "Something went wrong. Please try again.") {
  if (!e?.response) return e?.code === "ECONNABORTED" ? "The request timed out. Please try again." : "We can't reach DRESSELLA right now. Please check your connection.";
  const d = e.response.data?.detail;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x?.msg || "").replace(/^Value error, /, "")).filter(Boolean).join(" ");
  if (d.message) return d.message;
  return fallback;
}

export const PHONE_RE = /^(?:\+91[-\s]?|0)?[6-9]\d{9}$/;
export const PIN_RE = /^[1-9]\d{5}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
