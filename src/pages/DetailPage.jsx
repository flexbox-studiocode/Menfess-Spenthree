import { Link } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Secondary.module.css";
export default function DetailPage() {
  return <Page title="Detail menfess" description="Hanya pesan yang telah dipublikasikan akan tersedia di halaman ini.">
    <section className={`${styles.card} ${styles.empty} ${styles.detail}`} aria-labelledby="detail-unavailable"><h2 id="detail-unavailable">Detail pesan belum tersedia</h2><p>Halaman detail publik belum terhubung. Gunakan kode pelacakan untuk memeriksa status pesanmu.</p><Link className={`${styles.button} ${styles.secondary}`} to="/status">Periksa status</Link></section>
    <aside className={styles.notice}><h2>Tentang detail publik</h2><p>Kode pelacakan bersifat pribadi. Halaman ini tidak menampilkan kode, pesan, atau tanggapan yang belum tersedia dari layanan publik.</p></aside>
  </Page>;
}
