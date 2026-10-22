import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { fetchPublicMenfess } from "../services/index.js";

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" });
const validInstagram = (value) => { try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com")); } catch { return false; } };

export default function DetailPage() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const load = useCallback(async (signal) => {
    try { const result = await fetchPublicMenfess(id, signal); setState({ status: "success", data: result.data, error: "" }); }
    catch (error) { if (error?.name !== "AbortError") setState({ status: error?.code === "NOT_FOUND" ? "not-found" : "error", data: null, error: error.message }); }
  }, [id]);
  const retry = () => { setState({ status: "loading", data: null, error: "" }); load(); };
  useEffect(() => {
    const controller = new AbortController();
    fetchPublicMenfess(id, controller.signal).then((result) => setState({ status: "success", data: result.data, error: "" })).catch((error) => {
      if (error?.name !== "AbortError") setState({ status: error?.code === "NOT_FOUND" ? "not-found" : "error", data: null, error: error.message });
    });
    return () => controller.abort();
  }, [id]);
  return <Page title="Detail menfess" description="Pesan yang telah diterbitkan untuk publik.">
    {state.status === "loading" && <section className={styles.feedState} role="status">Memuat detail menfess…</section>}
    {state.status === "not-found" && <section className={styles.feedState}><h2>Menfess tidak tersedia</h2><p>Pesan tidak ditemukan atau belum diterbitkan.</p><Link className={styles.button} to="/">Kembali ke linimasa</Link></section>}
    {state.status === "error" && <section className={styles.feedState} role="alert"><h2>Detail gagal dimuat</h2><p>{state.error}</p><button className={styles.button} type="button" onClick={retry}>Coba lagi</button></section>}
    {state.status === "success" && <article className={`${styles.feedCard} ${styles.detailCard}`}><div className={styles.cardMeta}><span>{state.data.category}</span><time dateTime={state.data.published_at}>{dateFormatter.format(new Date(state.data.published_at))}</time></div>{state.data.recipient && <p className={styles.recipient}>Untuk: {state.data.recipient}</p>}<p className={styles.feedContent}>{state.data.content}</p>{validInstagram(state.data.ig_permalink) && <a href={state.data.ig_permalink} target="_blank" rel="noreferrer">Lihat di Instagram</a>}</article>}
  </Page>;
}
