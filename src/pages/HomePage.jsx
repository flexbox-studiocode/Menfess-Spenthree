import styles from "./Page.module.css";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
export default function HomePage() {
  return (
    <Page
      title="Sampaikan pesanmu, tetap anonim."
      description="Fondasi awal Menfess Spenthree. Feed publik dan pengiriman pesan akan terhubung melalui service layer backend."
    >
      <div className={styles.actions}>
        <Link className={styles.button} to="/write">
          Tulis Menfess
        </Link>
        <Link className={`${styles.button} ${styles.secondary}`} to="/status">
          Periksa Status
        </Link>
      </div>
      <div className={styles.placeholder}>
        Feed publik siap diintegrasikan dengan endpoint public-feed.
      </div>
    </Page>
  );
}
