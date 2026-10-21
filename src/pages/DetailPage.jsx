import styles from "./Page.module.css";
import { useParams } from "react-router-dom";
import Page from "./Page.jsx";
export default function DetailPage() {
  const { id } = useParams();
  return (
    <Page
      title="Detail Menfess"
      description="Hanya pesan yang telah dipublikasikan akan tersedia di halaman ini."
    >
      <div className={styles.placeholder}>
        Integrasi detail publik belum tersedia. ID: {id}
      </div>
    </Page>
  );
}
