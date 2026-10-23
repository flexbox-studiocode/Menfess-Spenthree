import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { getVoterId } from "../lib/voterId.js";
import { setMessageLike } from "../services/index.js";
export default function LikeButton({ item, onChange }) {
 const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const last=useRef(null);
 const liked=Boolean(item.liked_by_me), count=Number(item.like_count||0);
 async function toggle(){if(busy)return;const next=!liked;last.current={liked,count};onChange({...item,liked_by_me:next,like_count:Math.max(0,count+(next?1:-1))});setBusy(true);setError("");try{const r=await setMessageLike(item.public_id,getVoterId(),next);onChange({...item,...r.data});}catch{onChange({...item,liked_by_me:liked,like_count:count});setError("Like gagal disimpan. Coba lagi.");}finally{setBusy(false)}}
 return <span><button type="button" disabled={busy} aria-pressed={liked} aria-label={liked?`Batalkan like, ${count} like`:`Beri like, ${count} like`} onClick={toggle} style={{display:"inline-flex",alignItems:"center",gap:6,color:liked?"#e98b9a":"var(--muted)",background:"none",border:0,cursor:busy?"wait":"pointer"}}><Heart size={18} fill={liked?"currentColor":"none"}/><span>{count}</span></button>{error&&<small role="alert">{error}</small>}</span>;
}
