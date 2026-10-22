import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
import { fetchPublicFeed } from "../services/index.js";

const categories = [{ label: "Semua", slug: undefined }, { label: "Menfess", slug: "menfess" }, { label: "Aspirasi", slug: "aspirasi" }, { label: "Curhat", slug: "curhat" }, { label: "Apresiasi", slug: "apresiasi" }];
const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" });
const validInstagram = (value) => { try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname === "www.instagram.com"); } catch { return false; } };
const displayDate = (item) => item.created_at || item.published_at;
const statusLabels = { queued: "Menunggu diproses", processing: "Sedang diproses", publishing: "Sedang dipublikasikan", retry_scheduled: "Menunggu dicoba lagi", published: "Telah diterbitkan", failed: "Gagal dipublikasikan" };

export default function HomePage() {
  const [active, setActive] = useState(categories[0]);
  const [feed, setFeed] = useState({ status: "loading", items: [], cursor: null, error: "" });
  const request = useRef(0);
  const activeController = useRef(null);
  const load = useCallback(async ({ append = false, cursor } = {}) => {
    // Do not start a second feed request while a refresh or pagination request is pending.
    if (activeController.current) return;
    const id = ++request.current;
    const controller = new AbortController();
    activeController.current = controller;
    setFeed((old) => ({ ...old, status: append ? "more" : "loading", error: "", ...(append ? {} : { items: [], cursor: null }) }));
    try {
      const result = await fetchPublicFeed({ category: active.slug, limit: 20, cursor, signal: controller.signal });
      if (id !== request.current) return;
      setFeed((old) => ({ status: "success", items: append ? [...new Map([...old.items, ...result.data].map((item) => [item.public_id, item])).values()] : result.data, cursor: result.next_cursor, error: "" }));
    } catch (error) {
      if (id !== request.current || error?.name === "AbortError") return;
      setFeed((old) => ({ ...old, status: "error", error: error.message || "Linimasa gagal dimuat." }));
    } finally {
      if (id === request.current) activeController.current = null;
    }
  }, [active.slug]);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => { document.removeEventListener("visibilitychange", refresh); window.clearInterval(interval); request.current += 1; activeController.current?.abort(); };
  }, [load]);

  return <Page home title="Menfess Spenthree" description="Pesan dan cerita dari warga sekolah.">
    <section className={styles.hero}><h2>Ada yang ingin<br />kamu sampaikan?</h2><p>Titip pesan, cerita hari ini, atau beri apresiasi. Kamu juga bisa menyampaikan aspirasi ke OSIS.</p><Link className={styles.heroButton} to="/write">Tulis menfess<img src="/design/write.svg" alt="" /></Link></section>
    <p className={styles.security}><img src="/design/security.svg" alt="" /><span>Nama pengirim tidak ditampilkan. Semua menfess divalidasi sebelum tayang.</span></p>
    <section className={styles.feed} aria-labelledby="feed-heading">
      <div className={styles.feedHeading}><h2 id="feed-heading">Linimasa</h2><span>Terbaru</span></div>
      <div className={styles.categories} data-active={categories.indexOf(active)} role="group" aria-label="Kategori linimasa">{categories.map((item) => <button key={item.label} type="button" aria-pressed={active.slug === item.slug} onClick={() => setActive(item)}>{item.label}</button>)}</div>
      {feed.status === "loading" && <div className={styles.feedState} role="status" aria-live="polite">Memuat linimasa…</div>}
      {feed.status === "error" && <div className={styles.feedState} role="alert"><p>{feed.error}</p><button className={styles.button} type="button" onClick={() => load()}>Coba lagi</button></div>}
      {feed.status === "success" && feed.items.length === 0 && <div className={styles.empty} role="status"><span className={styles.emptyIcon} aria-hidden="true"><img src="/design/write.svg" alt="" /></span><h3>Belum ada menfess di linimasa</h3><p>Pesan yang lolos pemeriksaan keamanan akan muncul di sini beserta status publikasinya.</p><Link className={`${styles.button} ${styles.emptyCta}`} to="/write">Tulis menfess<img src="/design/arrow.svg" alt="" /></Link></div>}
      {feed.items.length > 0 && <div className={styles.feedList}>{feed.items.map((item) => <article className={styles.feedCard} key={item.public_id}><div className={styles.cardMeta}><span>{item.category} · {statusLabels[item.status] || "Status belum dikenali"}</span><time dateTime={displayDate(item)}>{dateFormatter.format(new Date(displayDate(item)))}</time></div>{item.recipient && <p className={styles.recipient}>Untuk: {item.recipient}</p>}<p className={styles.feedContent}>{item.content}</p><div className={styles.cardLinks}><Link to={`/menfess/${item.public_id}`}>Lihat detail</Link>{validInstagram(item.ig_permalink) && <a href={item.ig_permalink} target="_blank" rel="noreferrer">Lihat di Instagram</a>}</div></article>)}</div>}
      {feed.cursor && feed.status !== "error" && <button className={`${styles.button} ${styles.loadMore}`} type="button" disabled={feed.status === "more"} onClick={() => load({ append: true, cursor: feed.cursor })}>{feed.status === "more" ? "Memuat…" : "Muat lagi"}</button>}
    </section>
  </Page>;
}
