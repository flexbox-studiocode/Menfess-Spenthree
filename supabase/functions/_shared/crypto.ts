export const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export const bytes = (value: string) => new TextEncoder().encode(value);

export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes(value))));
}

export async function encrypt(secret: string, plaintext: string, aad: string) {
  const keyMaterial = await crypto.subtle.digest("SHA-256", bytes(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: bytes(aad) }, key, bytes(plaintext)));
  const out = new Uint8Array(nonce.length + ciphertext.length); out.set(nonce); out.set(ciphertext, nonce.length);
  return out;
}
export async function decrypt(secret: string, data: Uint8Array, aad: string) {
  const keyMaterial = await crypto.subtle.digest("SHA-256", bytes(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12), additionalData: bytes(aad) }, key, data.slice(12)));
}
