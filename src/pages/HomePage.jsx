import { useState } from "react";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
const categories = ["Semua", "Menfess", "Aspirasi", "Curhat", "Apresiasi"];
export default function HomePage() {
  const [category, setCategory] = useState("Semua");
  return <Page home title="Menfess Spenthree" description="Pesan dan cerita dari warga sekolah.">
    <section className={styles.hero}>
      <h2>Ada yang ingin<br />kamu sampaikan?</h2>
      <p>Titip pesan, cerita hari ini, atau beri apresiasi. Kamu juga bisa menyampaikan aspirasi ke OSIS.</p>
      <Link className={styles.heroButton} to="/write">Tulis menfess<img src="/design/write.svg" alt="" /></Link>
    </section>
    <p className={styles.security}><img src="/design/security.svg" alt="" /><span>Nama pengirim tidak ditampilkan. Semua menfess divalidasi sebelum tayang.</span></p>
    <section className={styles.feed} aria-labelledby="feed-heading">
      <div className={styles.feedHeading}><h2 id="feed-heading">Linimasa</h2><span>Terbaru</span></div>
      <div className={styles.categories} data-active={categories.indexOf(category)} role="group" aria-label="Kategori linimasa">
        {categories.map(label => <button key={label} type="button" aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</button>)}
      </div>
      <div className={styles.empty} role="status"><span className={styles.emptyIcon} aria-hidden="true"><img src="/design/write.svg" alt="" /></span><h3>Linimasa belum tersedia</h3>
        <p key={category} className={styles.categoryDescription}>{category === "Semua" ? "Pesan yang telah diterbitkan akan muncul di sini setelah linimasa tersedia." : "Pesan kategori " + category.toLowerCase() + " akan muncul di sini setelah linimasa tersedia."}</p>
        <Link className={styles.button + " " + styles.emptyCta} to="/write">Tulis menfess<img src="/design/arrow.svg" alt="" /></Link>
        <Link to="/status">Periksa status pesanmu</Link>
      </div>
    </section>
  </Page>;
}
