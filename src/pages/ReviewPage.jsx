import styles from "./Page.module.css";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
export default function ReviewPage() {
  return (
    <Page
      title="Periksa Pesan"
      description="Pratinjau oleh pengirim sebelum mengirim pesan, bukan persetujuan moderator."
    >
      <div className={styles.placeholder}>
        Belum ada draf untuk diperiksa. Pesan yang lolos validasi server dapat
        dipublikasikan otomatis ke Instagram dan website.
      </div>
      <div className={styles.actions}>
        <Link className={`${styles.button} ${styles.secondary}`} to="/write">
          Kembali ke Tulis Menfess
        </Link>
      </div>
    </Page>
  );
}
