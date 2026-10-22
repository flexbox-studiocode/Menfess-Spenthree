import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Page from "./Page.jsx";
import { MessageSteps } from "../components/MessageFormParts.jsx";
import styles from "./Secondary.module.css";
import { clearDraft, createRequestId, readDraft, saveDraft, submitMenfess } from "../services/index.js";
import { navigateMessage } from "../lib/messageTransition.js";
const labels = { menfess: "Menfess", aspirasi: "Aspirasi", curhat: "Curhat", apresiasi: "Apresiasi" };
export default function ReviewPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => readDraft());
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateMessage(navigate, "/write");
  };
  if (!draft) return <Page title="Periksa pesan" description="Pastikan isi pesan sudah sesuai sebelum dikirim." backTo="/write" backLabel="Ubah pesan" onBack={edit}><MessageSteps review /><div className={`${styles.card} ${styles.empty}`}><h2>Belum ada draf untuk diperiksa.</h2><p>Tulis pesan terlebih dahulu untuk melihat pratinjau.</p><Link className={styles.button} to="/write" onClick={edit}>Tulis pesan</Link></div></Page>;
  const send = async () => {
    if (sending.current || !draft.rules_accepted) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const payload = saveDraft({ ...draft, request_id: draft.request_id || createRequestId() });
      setDraft(payload);
      const result = await submitMenfess(payload);
      clearDraft(); navigate("/status", { state: { submitted: result } });
    } catch (err) { setError(err.message); sending.current = false; setBusy(false); }
  };
  const acceptRules = event => {
    setDraft(saveDraft({ ...draft, rules_accepted: event.target.checked }));
  };
  return <Page title="Periksa pesan" description="Pastikan isi pesan sudah sesuai sebelum dikirim." backTo="/write" backLabel="Ubah pesan" onBack={edit}>
    <MessageSteps review />
    <article className={`${styles.card} ${styles.preview} motion-message`}><div className={styles.previewTop}><span>Anonim</span><span className={styles.badge}>{labels[draft.category] || draft.category}</span></div><h2 className={styles.recipient}>{draft.recipient ? `Untuk: ${draft.recipient}` : "Untuk warga Spenthree"}</h2><p className={styles.message}>{draft.content}</p></article>
    <div className={styles.queue}><img className={styles.security} src="/design/security.svg" alt="" /><p className={styles.muted}>Pesan masuk ke antrean validasi otomatis. Pesan belum langsung tampil di beranda.</p></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button className={styles.button} aria-busy={busy} disabled={busy || !draft.rules_accepted} onClick={send}>{busy ? "Mengirim pesan..." : "Kirim Menfess"}<span className="motion-icon-slot">{busy ? <span className="motion-spinner" aria-hidden="true" /> : <img src="/design/plane.svg" alt="" />}</span></button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={edit}>Ubah Pesan</button></div>
    <p className={styles.muted}>Jika koneksi terputus, kirim ulang pesan yang sama. Jangan membuat draf baru.</p>
    <aside className={`${styles.card} ${styles.anonymity}`}><span className={styles.shield}><img src="/design/shield.svg" alt="" /></span><div><h2>Diterbitkan sebagai Anonim</h2><p>Nama tidak ditampilkan kepada siswa lain. Pesan diproses melalui validasi otomatis.</p></div></aside>
    <label className={styles.agreement}><input type="checkbox" checked={!!draft.rules_accepted} disabled={busy} onChange={acceptRules} /><span>Saya memastikan pesan tidak berisi hinaan, data pribadi, atau informasi yang mempermalukan orang lain.</span></label>
  </Page>;
}
