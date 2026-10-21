import styles from "./Page.module.css";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
export default function WritePage() {
  return (
    <Page
      title="Tulis Menfess"
      description="Halaman penulisan pesan anonim. Form kategori, penerima opsional, pesan, dan persetujuan publikasi akan ditambahkan pada tahap frontend berikutnya."
    >
      <div className={styles.placeholder}>
        Belum ada pesan yang dikirim dari halaman fondasi ini.
      </div>
      <div className={styles.actions}>
        <Link className={`${styles.button} ${styles.secondary}`} to="/review">
          Lihat halaman pratinjau
        </Link>
      </div>
    </Page>
  );
}
