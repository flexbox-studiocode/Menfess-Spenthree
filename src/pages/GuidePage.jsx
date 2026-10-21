import styles from "./Page.module.css";
import Page from "./Page.jsx";
export default function GuidePage() {
  return (
    <Page
      title="Panduan"
      description="Kirim pesan dengan bijak dan hormati privasi orang lain."
    >
      <ul>
        <li>Jangan membagikan identitas atau data pribadi orang lain.</li>
        <li>
          Pesan yang lolos validasi server dapat dipublikasikan otomatis ke
          Instagram dan website.
        </li>
        <li>
          Pengirim tidak perlu login. Anonim tidak berarti penyedia
          infrastruktur tidak menyimpan metadata teknis.
        </li>
        <li>Simpan kode tracking dari backend untuk memeriksa status.</li>
      </ul>
      <div className={styles.placeholder}>
        Panduan lengkap dan kebijakan privasi akan dilengkapi pada tahap UI.
      </div>
    </Page>
  );
}
