const KEY = "anora_recent_v1";

const allowed = () => !!window.__anoraConsent?.personalization;

export function pushRecent(id) {
  if (!allowed()) return;
  const cur = getRecent().filter((x) => x !== id);
  localStorage.setItem(KEY, JSON.stringify([id, ...cur].slice(0, 12)));
}

export function getRecent() {
  if (!allowed()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}
