import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { saveDraft, readDraft } from "../services/index.js";

const initial = { category: "menfess", recipient: "", content: "", rules_accepted: false };
export default function WritePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => readDraft() || initial);
  const [error, setError] = useState("");
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const content = draft.content.normalize("NFC").trim();
    if (content.length < 10 || content.length > 500) return setError("Isi harus 10–500 karakter.");
    if (!draft.rules_accepted) return setError("Setujui aturan publikasi terlebih dahulu.");
    setError("");
    const next = { ...draft, content, recipient: draft.recipient.trim() };
    saveDraft(next);
    navigate("/review");
  };
  useEffect(() => () => {}, []);
  return <Page title="Tulis Menfess" description="Kirim pesan anonim. Pesan akan divalidasi server sebelum masuk antrean publikasi.">
    <form className={styles.form} onSubmit={submit} noValidate>
      <label>Kategori<select value={draft.category} onChange={(e) => update("category", e.target.value)}><option value="menfess">Menfess</option><option value="aspirasi">Aspirasi</option><option value="curhat">Curhat</option><option value="apresiasi">Apresiasi</option></select></label>
      <label>Penerima <span className={styles.muted}>(opsional)</span><input maxLength="80" value={draft.recipient} onChange={(e) => update("recipient", e.target.value)} placeholder="Contoh: Untuk kelas 9A" /></label>
      <label>Isi pesan<textarea required minLength="10" maxLength="500" value={draft.content} onChange={(e) => update("content", e.target.value)} placeholder="Tulis pesanmu..." /><span className={styles.counter}>{draft.content.length}/500</span></label>
      <label className={styles.checkbox}><input type="checkbox" checked={draft.rules_accepted} onChange={(e) => update("rules_accepted", e.target.checked)} /> Saya menyetujui pesan ini diproses dan dipublikasikan jika lolos validasi.</label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.button} type="submit">Lihat pratinjau</button>
    </form>
  </Page>;
}
