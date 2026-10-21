import styles from "../pages/Page.module.css";
export function MessageSteps({ review = false }) {
  return <div className={styles.steps} aria-label={review ? "Langkah 2 dari 2: Periksa pesan" : "Langkah 1 dari 2: Tulis pesan"}>
    <span>1. Tulis pesan</span><span className={styles.progress} /><span className={styles.progress + (review ? "" : " " + styles.remaining)} /><span>2. Periksa</span>
  </div>;
}
export function PrivacyNotice() {
  return <aside className={styles.privacy}><span className={styles.shield}><img src="/design/shield.svg" alt="" /></span>
    <div><h2>Diterbitkan sebagai Anonim</h2><p>Nama tidak ditampilkan kepada siswa lain. Pesan diproses melalui validasi otomatis.</p></div>
  </aside>;
}
export function RulesAgreement({ checked, onChange, disabled = false }) {
  return <label className={styles.checkbox}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span>Saya memastikan pesan tidak berisi hinaan, data pribadi, atau informasi yang mempermalukan orang lain.</span>
  </label>;
}
