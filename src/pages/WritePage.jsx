import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Page from "./Page.jsx";
import { MessageSteps, PrivacyNotice, RulesAgreement } from "../components/MessageFormParts.jsx";
import styles from "./Page.module.css";
import { saveDraft, readDraft } from "../services/index.js";
const initial = { category: "menfess", recipient: "", content: "", rules_accepted: false };
export default function WritePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => readDraft() || initial);
  const [error, setError] = useState("");
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const submit = event => {
    event.preventDefault();
    const content = draft.content.replace(/\r\n?/g, "\n").normalize("NFC").trim();
    const recipient = draft.recipient.normalize("NFC").trim();
    if ([...recipient].length > 80) return setError("Penerima maksimal 80 karakter.");
    if ([...content].length < 10 || [...content].length > 500) return setError("Isi harus 10–500 karakter.");
    if (!draft.rules_accepted) return setError("Setujui aturan publikasi terlebih dahulu.");
    setError("");
    saveDraft({ ...draft, content, recipient });
    navigate("/review");
  };
  return <Page title="Tulis menfess" description="Titip pesan atau bagikan ceritamu. Nama pengirim tetap anonim.">
    <MessageSteps />
    <form className={styles.writeForm} onSubmit={submit} noValidate>
      <div className={styles.field}><label htmlFor="category">Kategori</label><select id="category" value={draft.category} onChange={e => update("category", e.target.value)}><option value="menfess">Menfess</option><option value="aspirasi">Aspirasi</option><option value="curhat">Curhat</option><option value="apresiasi">Apresiasi</option></select></div>
      <div className={styles.field}><label htmlFor="recipient">Untuk <span>(opsional)</span></label><input id="recipient" value={draft.recipient} onChange={e => update("recipient", e.target.value)} placeholder="Contoh: teman sekelas atau warga Spenthree" /></div>
      <div className={styles.field}><label htmlFor="content">Isi pesan</label><textarea id="content" required value={draft.content} onChange={e => update("content", e.target.value)} placeholder="Tulis pesanmu di sini..." aria-describedby="content-help content-count" aria-invalid={error.startsWith("Isi") || undefined} /><div className={styles.fieldHelp}><span id="content-help">Minimal 10 karakter</span><span id="content-count">{[...draft.content.normalize("NFC")].length}/500</span></div></div>
      <PrivacyNotice />
      <RulesAgreement checked={draft.rules_accepted} onChange={e => update("rules_accepted", e.target.checked)} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.button} type="submit">Periksa pesan <img src="/design/arrow.svg" alt="" /></button>
    </form>
  </Page>;
}
