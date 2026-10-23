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
  const [feed, setFeed] = useState({ status: "loading", items: [], cursor: null, error: "", errorKind: "" });
  const [pendingItems, setPendingItems] = useState([]);
  const request = useRef(0);
  const activeController = useRef(null);
  const isInitialLoad = useRef(true);
  const scrollThreshold = 300; // px from top to consider user "reading below"

  const load = useCallback(async ({ append = false, cursor } = {}) => {
    // Keep one request active. Pagination takes priority over a background refresh
    // so a polling request cannot make the button appear unresponsive.
    if (activeController.current) {
      if (!append) return;
      activeController.current.abort();
      activeController.current = null;
      request.current += 1;
    }
    const id = ++request.current;
    const controller = new AbortController();
    activeController.current = controller;
    // Preserve items during background refresh; only clear on initial load
    const shouldClear = !append && isInitialLoad.current;
    setFeed((old) => ({ ...old, status: append ? "more" : shouldClear ? "loading" : "refreshing", error: "", errorKind: "", ...(shouldClear ? { items: [], cursor: null } : {}) }));
    try {
      const result = await fetchPublicFeed({ category: active.slug, limit: 20, cursor, signal: controller.signal });
      if (id !== request.current) return;
      isInitialLoad.current = false;

      setFeed((old) => {
        if (append) {
          // Pagination: append new items with deduplication
          const merged = [...new Map([...old.items, ...result.data].map((item) => [item.public_id, item])).values()];
          return { ...old, status: "success", items: merged, cursor: result.next_cursor, error: "", errorKind: "" };
        } else {
          // Background refresh: merge existing with new items, preserving cursor if user hasn't scrolled far
          const scrollY = window.scrollY || window.pageYOffset || 0;
          const isUserReadingBelow = scrollY > scrollThreshold;

          if (isUserReadingBelow && old.items.length > 0) {
            // User scrolled down; hold new items that aren't already visible
            const existingIds = new Set(old.items.map((item) => item.public_id));
            const newItems = result.data.filter((item) => !existingIds.has(item.public_id));
            if (newItems.length > 0) {
              setPendingItems(newItems);
            }
            // Keep existing items and cursor stable
            return { ...old, status: "success", error: "" };
          } else {
            // User at top or initial load: merge all items
            const merged = [...new Map([...result.data, ...old.items].map((item) => [item.public_id, item])).values()];
            setPendingItems([]);
            return { ...old, status: "success", items: merged, cursor: result.next_cursor, error: "", errorKind: "" };
          }
        }
      });
    } catch (error) {
      if (id !== request.current || error?.name === "AbortError") return;
      setFeed((old) => ({ ...old, status: "error", errorKind: append ? "pagination" : "refresh", error: error.message || "Linimasa gagal dimuat." }));
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  }, [active.slug]);

  const loadPendingItems = useCallback(() => {
    if (pendingItems.length === 0) return;
    setFeed((old) => {
      const merged = [...new Map([...pendingItems, ...old.items].map((item) => [item.public_id, item])).values()];
      return { ...old, items: merged };
    });
    setPendingItems([]);
  }, [pendingItems]);

  useEffect(() => {
    // Reset initial load flag and clear pending when active category changes
    isInitialLoad.current = true;
    setPendingItems([]);
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
      request.current += 1;
      if (activeController.current) {
        activeController.current.abort();
        activeController.current = null;
      }
    };
  }, [active.slug, load]);

  return <Page home title="Menfess Spenthree" description="Pesan dan cerita dari warga sekolah.">
    <section className={styles.hero}><h2>Ada yang ingin<br />kamu sampaikan?</h2><p>Titip pesan, cerita hari ini, atau beri apresiasi. Kamu juga bisa menyampaikan aspirasi ke OSIS.</p><Link className={styles.heroButton} to="/write">Tulis menfess<img src="/design/write.svg" alt="" /></Link></section>
    <p className={styles.security}><img src="/design/security.svg" alt="" /><span>Nama pengirim tidak ditampilkan. Semua menfess divalidasi sebelum tayang.</span></p>
    <section className={styles.feed} aria-labelledby="feed-heading">
      <div className={styles.feedHeading}><h2 id="feed-heading">Linimasa</h2><span>Terbaru</span></div>
      <div className={styles.categories} data-active={categories.indexOf(active)} role="group" aria-label="Kategori linimasa">{categories.map((item) => <button key={item.label} type="button" aria-pressed={active.slug === item.slug} onClick={() => { isInitialLoad.current = true; setPendingItems([]); setActive(item); }}>{item.label}</button>)}</div>
      {pendingItems.length > 0 && <div className={styles.feedState} role="status" style={{ padding: "12px", fontSize: "0.875rem", backgroundColor: "var(--color-primary, #3b82f6)", color: "white", borderRadius: "8px", cursor: "pointer" }} onClick={loadPendingItems}><button type="button" onClick={loadPendingItems} style={{ background: "none", border: "none", color: "inherit", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}>{pendingItems.length} menfess baru tersedia. Klik untuk memuat.</button></div>}
      {feed.status === "loading" && feed.items.length === 0 && <div className={styles.feedState} role="status" aria-live="polite">Memuat linimasa…</div>}
      {feed.status === "error" && feed.items.length === 0 && <div className={styles.feedState} role="alert"><p>{feed.error}</p><button className={styles.button} type="button" onClick={() => load()}>Coba lagi</button></div>}
      {feed.status === "success" && feed.items.length === 0 && <div className={styles.empty} role="status"><span className={styles.emptyIcon} aria-hidden="true"><img src="/design/write.svg" alt="" /></span><h3>Belum ada menfess di linimasa</h3><p>Pesan yang lolos pemeriksaan keamanan akan muncul di sini beserta status publikasinya.</p><Link className={`${styles.button} ${styles.emptyCta}`} to="/write">Tulis menfess<img src="/design/arrow.svg" alt="" /></Link></div>}
      {feed.status === "refreshing" && <div className={styles.feedState} role="status" aria-live="polite" style={{ padding: "8px", fontSize: "0.875rem", opacity: 0.7 }}>Memperbarui…</div>}
      {feed.status === "error" && feed.items.length > 0 && feed.errorKind === "refresh" && <div className={styles.feedState} role="alert" style={{ padding: "8px", fontSize: "0.875rem" }}><p style={{ margin: 0 }}>Gagal memperbarui. <button type="button" onClick={() => load()} style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>Coba lagi</button></p></div>}
      {feed.status === "error" && feed.items.length > 0 && feed.errorKind === "pagination" && <div className={styles.feedState} role="alert" style={{ padding: "8px", fontSize: "0.875rem" }}><p style={{ margin: 0 }}>Gagal memuat halaman berikutnya: {feed.error}</p></div>}
      {feed.items.length > 0 && <div className={styles.feedList}>{feed.items.map((item) => <article className={styles.feedCard} key={item.public_id}><div className={styles.cardMeta}><span>{item.category} · {statusLabels[item.status] || "Status belum dikenali"}</span><time dateTime={displayDate(item)}>{dateFormatter.format(new Date(displayDate(item)))}</time></div>{item.recipient && <p className={styles.recipient}>Untuk: {item.recipient}</p>}<p className={styles.feedContent}>{item.content}</p><div className={styles.cardLinks}><Link to={`/menfess/${item.public_id}`}>Lihat detail</Link>{validInstagram(item.ig_permalink) && <a href={item.ig_permalink} target="_blank" rel="noreferrer">Lihat di Instagram</a>}</div></article>)}</div>}
      {feed.cursor && (feed.status !== "error" || feed.errorKind === "pagination") && <button className={`${styles.button} ${styles.loadMore}`} type="button" disabled={feed.status === "more"} onClick={() => load({ append: true, cursor: feed.cursor })}>{feed.status === "more" ? "Memuat…" : feed.errorKind === "pagination" ? "Coba muat lagi" : "Muat lagi"}</button>}
    </section>
  </Page>;
}
