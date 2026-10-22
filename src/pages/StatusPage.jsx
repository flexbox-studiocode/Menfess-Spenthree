import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Secondary.module.css";
import { trackMenfess } from "../services/index.js";
const statusLabels = { queued: "Pesan diterima", processing: "Sedang diproses", publishing: "Sedang dipublikasikan", published: "Pesan diterbitkan", retry_scheduled: "Sedang mengalami kendala", failed: "Mengalami kendala", blocked: "Tidak dapat diproses" };
function instagramUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname === "www.instagram.com") ? url.href : null; } catch { return null; }
}
export default function StatusPage() {
  const location = useLocation();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(location.state?.submitted || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  const check = async event => {
    event.preventDefault(); if (checking.current) return;
    checking.current = true; setBusy(true); setError(""); setResult(null);
    try { setResult(await trackMenfess(code.trim())); }
    catch (err) { setError(err.message); }
    finally { checking.current = false; setBusy(false); }
  };
  const permalink = instagramUrl(result?.ig_permalink);
  const publicationDate = result?.published_at ? new Date(result.published_at) : null;
  const hasDate = publicationDate && !Number.isNaN(publicationDate.getTime());
  return <Page title="Status pesan" description="Cek apakah menfess kamu sudah diproses dan diterbitkan.">
    <form className={styles.form} onSubmit={check} aria-busy={busy}><label className={styles.label} htmlFor="tracking">Kode pelacakan<input className={styles.input} id="tracking" required value={code} onChange={event => setCode(event.target.value)} placeholder="Contoh: SPT-..." autoComplete="off" autoCapitalize="characters" spellCheck={false} /></label><button className={styles.button} aria-busy={busy} disabled={busy}>{busy ? "Memeriksa..." : "Periksa status"}<span className="motion-icon-slot">{busy ? <span className="motion-spinner" aria-hidden="true" /> : <img src="/design/search.svg" alt="" />}</span></button></form>
    <Link className={`${styles.helpLink} motion-link`} to="/guide">Lihat panduan menfess dan kode pelacakan</Link>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result ? <section className={`${styles.card} ${styles.result}`} aria-live="polite" aria-label="Hasil pelacakan">
      {result === location.state?.submitted && <p className="motion-receipt"><span className="motion-receipt-icon" aria-hidden="true"><svg className="motion-envelope" viewBox="0 0 36 36" fill="#222936" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="12" width="28" height="20" rx="3" /><path d="m4 14 14 10 14-10" fill="none" /><path className="motion-envelope-flap" d="M4 13 18 3 32 13Z" /></svg><img className="motion-receipt-check" src="/design/check.svg" alt="" /></span><span>Menfess berhasil dikirim</span></p>}
      {result.tracking_code && <CopyCode code={result.tracking_code} />}
      <h2>Status menfess</h2><ol className={styles.timeline}><li><h3>{statusLabels[result.status] || "Status belum dikenali"}</h3><p>{result.message}</p></li>{hasDate && <li><h3>Waktu diterbitkan</h3><p><time dateTime={publicationDate.toISOString()}>{publicationDate.toLocaleString("id-ID")}</time></p></li>}</ol>
      {permalink && <a className={`${styles.button} ${styles.secondary}`} href={permalink} target="_blank" rel="noreferrer">Buka Instagram</a>}
      {result.tracking_code && <p className={styles.muted}>Simpan kode ini. Kode pelacakan tidak ditampilkan di URL.</p>}
    </section> : !error && !busy && <p className={styles.muted}>Masukkan kode yang kamu terima setelah mengirim pesan. Simpan kode tersebut untuk memeriksa statusnya kembali.</p>}
  </Page>;
}
function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setError(""); }
    catch { setError("Belum dapat menyalin. Pilih dan salin kode di atas secara manual."); }
  };
  return <div className={styles.resultCode}><code>{code}</code><button className={styles.copy} data-copied={copied} type="button" onClick={copy}><span key={copied ? "copied" : "copy"} className="motion-label">{copied && <span className="motion-copy-success" aria-hidden="true">✓</span>}{copied ? "Tersalin" : "Salin kode"}</span></button>{error && <p className={styles.error} role="alert">{error}</p>}</div>;
}
