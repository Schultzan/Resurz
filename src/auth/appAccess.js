/** Enkel klientlucka (inget verkligt serverskydd). */
export const APP_ACCESS_CODE = "Apelsin1";

const SESSION_KEY = "resurz-session-unlock";

export function readSessionUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSessionUnlocked() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSessionUnlock() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
