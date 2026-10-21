import styles from "./Page.module.css";
import { Link } from "react-router-dom";
import Page from "./Page.jsx";
export default function NotFoundPage() {
  return (
    <Page
      title="Halaman tidak ditemukan"
      description="Alamat ini tidak tersedia."
    >
      <Link className={styles.button} to="/">
        Kembali ke Beranda
      </Link>
    </Page>
  );
}
