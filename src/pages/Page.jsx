import styles from "./Page.module.css";
export default function Page({ title, description, children }) {
  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>MENFESS SPENTHREE</p>
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}
