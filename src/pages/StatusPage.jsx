import styles from "./Page.module.css";
import Page from "./Page.jsx";
export default function StatusPage() {
  return (
    <Page
      title="Periksa Status"
      description="Status publikasi akan diperiksa menggunakan kode tracking dari backend."
    >
      <div className={styles.placeholder}>
        Pencarian status belum tersedia. Kode tracking tidak akan ditempatkan di
        URL.
      </div>
    </Page>
  );
}
