import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Secondary.module.css";
import { trackMenfess } from "../services/index.js";
import { deliveryLabels, websiteLabel } from "../lib/publicationStatus.js";
const moderationLabels = { pending: "Pemeriksaan AI: menunggu", approved: "Pemeriksaan AI: disetujui", blocked: "Pemeriksaan AI: tidak disetujui" };
function instagramUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname === "www.instagram.com") ? url.href : null; } catch { return null; }
}
export default function StatusPage() {
  const location = useLocation();
  const [code, setCode] = useState(location.state?.submitted?.tracking_code || "");
  const [trackingCode, setTrackingCode] = useState(location.state?.submitted?.tracking_code || "");
  const [result, setResult] = useState(location.state?.submitted || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  const request = useRef(0);
  const checkLatest = useCallback(async (trackingCode, clear = false) => {
    if (checking.current || !trackingCode) return;
    const id = ++request.current;
    checking.current = true; setBusy(true); setError(""); if (clear) { setTrackingCode(trackingCode); setResult(null); }
    try { const next = await trackMenfess(trackingCode); if (id === request.current) setResult({ ...next, tracking_code: trackingCode }); }
    catch (err) { if (id === request.current) setError(err.message); }
    finally { if (id === request.current) { checking.current = false; setBusy(false); } }
  }, []);
  const check = event => { event.preventDefault(); checkLatest(code.trim(), true); };
  useEffect(() => () => { request.current += 1; checking.current = false; }, []);
  useEffect(() => {
    if (!trackingCode) return undefined;
    const refresh = () => { if (document.visibilityState === "visible") checkLatest(trackingCode); };
    document.addEventListener("visibilitychange", refresh);
    const terminal = result?.moderation_status === "blocked" || ["published", "failed", "blocked"].includes(result?.delivery_status || result?.status);
    const interval = terminal ? null : window.setInterval(refresh, 15000);
    return () => { document.removeEventListener("visibilitychange", refresh); if (interval !== null) window.clearInterval(interval); };
  }, [trackingCode, result?.moderation_status, result?.delivery_status, result?.status, checkLatest]);
  const deliveryStatus = result?.delivery_status !== undefined ? result.delivery_status : (result?.status === "pending_moderation" ? null : result?.status);
  const permalink = deliveryStatus === "published" ? instagramUrl(result?.ig_permalink) : null;
  const publicationDate = result?.published_at ? new Date(result.published_at) : null;
  const hasDate = publicationDate && !Number.isNaN(publicationDate.getTime());
  return <Page title="Status pesan" description="Cek apakah menfess kamu sudah diproses dan diterbitkan.">
    <form className={styles.form} onSubmit={check} aria-busy={busy}><label className={styles.label} htmlFor="tracking">Kode pelacakan<input className={styles.input} id="tracking" required value={code} onChange={event => setCode(event.target.value)} placeholder="Contoh: SPT-..." autoComplete="off" autoCapitalize="characters" spellCheck={false} /></label><button className={styles.button} aria-busy={busy} disabled={busy}>{busy ? "Memeriksa..." : "Periksa status"}<span className="motion-icon-slot">{busy ? <span className="motion-spinner" aria-hidden="true" /> : <img src="/design/search.svg" alt="" />}</span></button></form>
    <Link className={`${styles.helpLink} motion-link`} to="/guide">Lihat panduan menfess dan kode pelacakan</Link>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result ? <section className={`${styles.card} ${styles.result}`} aria-live="polite" aria-label="Hasil pelacakan">
      {result === location.state?.submitted && <p className="motion-receipt"><span className="motion-receipt-icon" aria-hidden="true"><svg className="motion-envelope" viewBox="0 0 36 36" fill="#222936" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="12" width="28" height="20" rx="3" /><path d="m4 14 14 10 14-10" fill="none" /><path className="motion-envelope-flap" d="M4 13 18 3 32 13Z" /></svg><img className="motion-receipt-check" src="/design/check.svg" alt="" /></span><span>Menfess berhasil dikirim</span></p>}
      {result.tracking_code && <CopyCode code={result.tracking_code} />}
      <h2>Status menfess</h2><ol className={styles.timeline}><li><h3>{websiteLabel(result.web_status)}</h3><p>{result.message}</p></li><li><h3>{deliveryLabels[deliveryStatus] || "Instagram: belum dikirim"}</h3>{result.moderation_status && <p>{moderationLabels[result.moderation_status] || "Pemeriksaan AI: belum terkonfirmasi"}</p>}</li>{hasDate && deliveryStatus === "published" && <li><h3>Waktu diterbitkan ke Instagram</h3><p><time dateTime={publicationDate.toISOString()}>{publicationDate.toLocaleString("id-ID")}</time></p></li>}</ol>
      {permalink && <a className={`${styles.button} ${styles.secondary}`} href={permalink} target="_blank" rel="noreferrer">Buka Instagram</a>}
      {location.state?.submitted && <Link className={`${styles.button} ${styles.secondary}`} to="/">Lihat linimasa</Link>}
      {result.web_status === "visible" && result.public_id && <Link className={`${styles.button} ${styles.secondary}`} to={`/menfess/${result.public_id}`}>Lihat menfess</Link>}
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
