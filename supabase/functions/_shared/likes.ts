import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function addLikeSummary(db: SupabaseClient, rows: Array<{ public_id: string }>, voterId: string | null) {
  const result = rows.map((row) => ({ ...row, like_count: 0, liked_by_me: false }));
  if (!rows.length) return result;
  const ids = rows.map((row) => row.public_id);
  const { data: messages, error: messageError } = await db.from("messages").select("id,public_id").in("public_id", ids);
  if (messageError) throw messageError;
  const messageIds = (messages ?? []).map((message) => message.id);
  if (!messageIds.length) return result;
  const { data: likes, error: likeError } = await db.from("message_likes").select("message_id,voter_hash").in("message_id", messageIds);
  if (likeError) throw likeError;
  let voterHash: string | null = null;
  if (voterId && uuid.test(voterId)) {
    const secret = Deno.env.get("LIKE_VOTER_HASH_SECRET");
    if (!secret) throw new Error("Missing LIKE_VOTER_HASH_SECRET");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(voterId));
    voterHash = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const byMessage = new Map<string, { count: number; mine: boolean }>();
  for (const like of likes ?? []) {
    const current = byMessage.get(like.message_id) ?? { count: 0, mine: false };
    current.count += 1;
    current.mine ||= voterHash !== null && like.voter_hash === voterHash;
    byMessage.set(like.message_id, current);
  }
  const publicByMessage = new Map((messages ?? []).map((message) => [message.public_id, message.id]));
  return result.map((row) => {
    const summary = byMessage.get(publicByMessage.get(row.public_id) ?? "");
    return { ...row, like_count: summary?.count ?? 0, liked_by_me: summary?.mine ?? false };
  });
}
