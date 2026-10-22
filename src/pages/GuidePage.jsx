import Page from "./Page.jsx";
import styles from "./Secondary.module.css";
const rules = [
  ["Boleh cerita, tapi jaga perasaan", "Kirim cerita, titip pesan, atau apresiasi dengan sopan. Hindari ejekan, rumor, dan pesan yang mempermalukan orang lain."],
  ["Jaga informasi pribadi", "Jangan mencantumkan nama lengkap, nomor telepon, alamat, atau informasi pribadi orang lain."],
  ["Tunggu proses validasi", "Pesan divalidasi secara otomatis sebelum tayang. Pesan yang tidak sesuai panduan dapat tidak diterbitkan."],
  ["Simpan kode pelacakan", "Gunakan kode untuk melihat apakah menfess sudah tayang. Kode diberikan setelah pesan berhasil dikirim."],
];
export default function GuidePage() {
  const list = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: no-preference)");
    if (!preference?.matches || !window.IntersectionObserver) return;
    const animations = [];
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        observer.unobserve(entry.target);
        const animation = entry.target.animate?.([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, delay: index * 50, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        if (animation) animations.push(animation);
      });
    }, { threshold: .15, rootMargin: "0px 0px -84px 0px" });
    const stop = () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
    [...list.current.children].forEach(item => observer.observe(item));
    const onPreferenceChange = () => { if (!preference.matches) stop(); };
    preference.addEventListener("change", onPreferenceChange);
    return () => { stop(); preference.removeEventListener("change", onPreferenceChange); };
  }, []);
  return <Page title="Panduan menfess" description="Bebas bercerita, tetap saling menghargai.">
    <section className={`${styles.card} ${styles.about}`}><h2>TENTANG SPENTHREE SKJ_FESS</h2><p>Menfess warga SMP Negeri 3 Sokaraja untuk titip pesan anonim, curhat, dan saling memberi apresiasi. Aspirasi ke OSIS tersedia sebagai salah satu kategori.</p></section>
    <ol className={styles.rules} ref={list}>{rules.map(([title, body]) => <li key={title}><h2>{title}</h2><p>{body}</p></li>)}</ol>
    <aside className={styles.support}><span className={styles.contact}><img src="/design/support.svg" alt="" /></span><div><h2>perlu pendampingan pribadi?</h2><p>Untuk perundungan atau masalah sensitif, hubungi guru BK atau wali kelas secara langsung.</p></div></aside>
    <p className={styles.muted}>Pengirim tidak perlu login. Identitas tidak ditampilkan kepada pengunjung; penyedia infrastruktur dapat menyimpan metadata teknis.</p>
  </Page>;
}
import { useEffect, useRef } from "react";
