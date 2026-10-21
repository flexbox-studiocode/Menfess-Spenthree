import { Link } from "react-router-dom";
import Page from "./Page.jsx";
import styles from "./Page.module.css";
export default function NotFoundPage() {
  return <Page title="Halaman tidak ditemukan" description="Alamat ini tidak tersedia.">
    <div className={styles.empty}><p>Kembali ke beranda untuk membaca panduan atau menulis menfess.</p><Link className={styles.button} to="/">Kembali ke Beranda</Link></div>
  </Page>;
}
