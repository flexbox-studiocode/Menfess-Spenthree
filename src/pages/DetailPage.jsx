import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { fetchPublicMenfess } from "../services/index.js";

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" });
const validInstagram = (value) => { try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname === "www.instagram.com"); } catch { return false; } };
const statusLabels = { queued: "Menunggu diproses", processing: "Sedang diproses", publishing: "Sedang dipublikasikan", retry_scheduled: "Menunggu dicoba lagi", published: "Telah diterbitkan", failed: "Gagal dipublikasikan" };

export default function DetailPage() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const controllerRef = useRef(null);
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const request = ++requestRef.current;
    controllerRef.current = controller;
    try { const result = await fetchPublicMenfess(id, controller.signal); if (request === requestRef.current) setState({ status: "success", data: result.data, error: "" }); }
    catch (error) { if (request === requestRef.current && error?.name !== "AbortError") setState({ status: error?.code === "NOT_FOUND" ? "not-found" : "error", data: null, error: error.message }); }
  }, [id]);
  const retry = () => { setState({ status: "loading", data: null, error: "" }); load(); };
  useEffect(() => {
    const controller = new AbortController();
    const request = ++requestRef.current;
    controllerRef.current = controller;
    fetchPublicMenfess(id, controller.signal).then((result) => {
      if (request === requestRef.current) setState({ status: "success", data: result.data, error: "" });
    }).catch((error) => {
      if (request === requestRef.current && error?.name !== "AbortError") setState({ status: error?.code === "NOT_FOUND" ? "not-found" : "error", data: null, error: error.message });
    });
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); requestRef.current += 1; controllerRef.current?.abort(); };
  }, [id, load]);
  return <Page title="Detail menfess" description="Pesan aman dan status publikasinya di linimasa.">
    {state.status === "loading" && <section className={styles.feedState} role="status">Memuat detail menfess…</section>}
    {state.status === "not-found" && <section className={styles.feedState}><h2>Menfess tidak tersedia</h2><p>Pesan tidak ditemukan atau tidak tersedia di linimasa.</p><Link className={styles.button} to="/">Kembali ke linimasa</Link></section>}
    {state.status === "error" && <section className={styles.feedState} role="alert"><h2>Detail gagal dimuat</h2><p>{state.error}</p><button className={styles.button} type="button" onClick={retry}>Coba lagi</button></section>}
    {state.status === "success" && <article className={`${styles.feedCard} ${styles.detailCard}`}><div className={styles.cardMeta}><span>{state.data.category} · {statusLabels[state.data.status] || "Status belum dikenali"}</span><time dateTime={state.data.created_at || state.data.published_at}>{dateFormatter.format(new Date(state.data.created_at || state.data.published_at))}</time></div>{state.data.recipient && <p className={styles.recipient}>Untuk: {state.data.recipient}</p>}<p className={styles.feedContent}>{state.data.content}</p>{validInstagram(state.data.ig_permalink) && <a href={state.data.ig_permalink} target="_blank" rel="noreferrer">Lihat di Instagram</a>}</article>}
  </Page>;
}
