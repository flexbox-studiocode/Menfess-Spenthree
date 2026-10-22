// Public keys are identifiers, not authorization boundaries. Backend RLS remains required.
export function isPublicSupabaseKey(key) {
  if (typeof key !== "string" || !key || key !== key.trim()) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    return false;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")),
    );
    return claims.role === "anon";
  } catch {
    return false;
  }
}

export function readSupabaseConfig(env = import.meta.env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const legacy = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || (!publishable && !legacy)) {
    throw new Error(
      "Konfigurasi Supabase publik belum lengkap. Periksa .env.example.",
    );
  }
  if (publishable && legacy && publishable !== legacy) {
    throw new Error("Gunakan satu kunci Supabase publik saja.");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL Supabase tidak valid.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "URL Supabase harus HTTPS atau HTTP localhost tanpa kredensial.",
    );
  }
  const key = publishable || legacy;
  if (!isPublicSupabaseKey(key)) {
    throw new Error(
      "Hanya publishable key atau legacy anon key yang boleh digunakan di frontend.",
    );
  }
  return { url, key };
}

