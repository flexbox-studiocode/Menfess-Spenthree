import { useState } from "react";
import { useLocation } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { trackMenfess } from "../services/index.js";

export default function StatusPage() {
  const location = useLocation();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(location.state?.submitted || null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const check = async (event) => { event.preventDefault(); setBusy(true); setError(""); setResult(null); try { setResult(await trackMenfess(code.trim())); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <Page title="Periksa Status" description="Masukkan kode tracking yang diberikan backend. Kode tidak disimpan di URL.">
    <form className={styles.form} onSubmit={check}><label>Kode tracking<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="SPT-..." autoComplete="off" /></label><button className={styles.button} disabled={busy}>{busy ? "Memeriksa..." : "Periksa status"}</button></form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <section className={styles.success} aria-live="polite"><h2>{result.status}</h2><p>{result.message}</p>{result.tracking_code && <CopyCode code={result.tracking_code} />}{result.published_at && <p>Diterbitkan: {new Date(result.published_at).toLocaleString("id-ID")}</p>}{result.ig_permalink && <a href={result.ig_permalink} target="_blank" rel="noreferrer">Buka Instagram</a>}</section>}
  </Page>;
}
function CopyCode({ code }) { const [copied, setCopied] = useState(false); return <p><code>{code}</code> <button type="button" onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(true))}>{copied ? "Tersalin" : "Salin kode"}</button></p>; }
