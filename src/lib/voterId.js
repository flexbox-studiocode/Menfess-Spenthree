const KEY = "menfess:voter-id:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function getVoterId() {
  try {
    const existing = localStorage.getItem(KEY);
    if (UUID.test(existing || "")) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function isValidVoterId(value) { return UUID.test(value || ""); }
export { KEY as VOTER_ID_KEY };
