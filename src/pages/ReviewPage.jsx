import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { clearDraft, createRequestId, readDraft, saveDraft, submitMenfess } from "../services/index.js";

export default function ReviewPage() {
  const navigate = useNavigate();
  const [draft] = useState(() => readDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!draft) return <Page title="Periksa Pesan" description="Belum ada draf untuk diperiksa."><Link className={`${styles.button} ${styles.secondary}`} to="/write">Tulis pesan</Link></Page>;
  const send = async () => {
    setBusy(true); setError("");
    const payload = { ...draft, request_id: draft.request_id || createRequestId() };
    saveDraft(payload);
    try { const result = await submitMenfess(payload); clearDraft(); navigate("/status", { state: { submitted: result } }); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return <Page title="Periksa Pesan" description="Pastikan isi pesan benar. Tidak ada moderator yang menyetujui pesan secara manual.">
    <article className={styles.preview}><strong>{draft.category}</strong>{draft.recipient && <p>Untuk: {draft.recipient}</p>}<p className={styles.message}>{draft.content}</p></article>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => navigate("/write")}>Ubah pesan</button><button className={styles.button} disabled={busy} onClick={send}>{busy ? "Mengirim..." : "Kirim menfess"}</button></div>
    <p className={styles.muted}>Jika koneksi timeout, ulangi dengan request yang sama. Jangan membuat draf baru.</p>
  </Page>;
}
