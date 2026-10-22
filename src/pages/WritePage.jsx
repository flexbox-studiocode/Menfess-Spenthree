import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Page from "./Page.jsx";
import { MessageSteps, PrivacyNotice, RulesAgreement } from "../components/MessageFormParts.jsx";
import styles from "./Page.module.css";
import { saveDraft, readDraft } from "../services/index.js";
import { navigateMessage } from "../lib/messageTransition.js";
const initial = { category: "menfess", recipient: "", content: "", rules_accepted: false };
export default function WritePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => readDraft() || initial);
  const [error, setError] = useState(null);
  const contentLength = [...draft.content.normalize("NFC")].length;
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const submit = event => {
    event.preventDefault();
    const reject = (field, message) => {
      setError({ field, message });
      const input = event.currentTarget.elements.namedItem(field);
      input.focus({ preventScroll: true });
      input.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto" });
    };
    const content = draft.content.replace(/\r\n?/g, "\n").normalize("NFC").trim();
    const recipient = draft.recipient.normalize("NFC").trim();
    if ([...recipient].length > 80) return reject("recipient", "Penerima maksimal 80 karakter.");
    if ([...content].length < 10 || [...content].length > 500) return reject("content", "Isi harus 10–500 karakter.");
    if (!draft.rules_accepted) return reject("rules", "Setujui aturan publikasi terlebih dahulu.");
    setError(null);
    saveDraft({ ...draft, content, recipient });
    navigateMessage(navigate, "/review");
  };
  return <Page title="Tulis menfess" description="Titip pesan atau bagikan ceritamu. Nama pengirim tetap anonim.">
    <MessageSteps />
    <form className={styles.writeForm} onSubmit={submit} noValidate>
      <div className={styles.field}><label htmlFor="category">Kategori</label><select id="category" value={draft.category} onChange={e => update("category", e.target.value)}><option value="menfess">Menfess</option><option value="aspirasi">Aspirasi</option><option value="curhat">Curhat</option><option value="apresiasi">Apresiasi</option></select></div>
      <div className={styles.field}><label htmlFor="recipient">Untuk <span>(opsional)</span></label><input id="recipient" name="recipient" value={draft.recipient} onChange={e => update("recipient", e.target.value)} placeholder="Contoh: teman sekelas atau warga Spenthree" aria-invalid={error?.field === "recipient" || undefined} aria-describedby={error?.field === "recipient" ? "write-error" : undefined} /></div>
      <div className={styles.field}><label htmlFor="content">Isi pesan</label><textarea className="motion-message" id="content" name="content" required value={draft.content} onChange={e => update("content", e.target.value)} placeholder="Tulis pesanmu di sini..." aria-describedby={`content-help content-count${error?.field === "content" ? " write-error" : ""}`} aria-invalid={error?.field === "content" || undefined} /><div className={styles.fieldHelp}><span id="content-help">Minimal 10 karakter</span><span id="content-count" data-limit={contentLength > 500 ? "over" : contentLength >= 450 ? "near" : "normal"}>{contentLength}/500</span></div></div>
      <PrivacyNotice />
      <RulesAgreement checked={draft.rules_accepted} onChange={e => update("rules_accepted", e.target.checked)} invalid={error?.field === "rules"} />
      {error && <p className={styles.error} id="write-error" role="alert">{error.message}</p>}
      <button className={styles.button} type="submit">Periksa pesan <img src="/design/arrow.svg" alt="" /></button>
    </form>
  </Page>;
}
