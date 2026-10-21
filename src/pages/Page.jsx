import { Link } from "react-router-dom";
import styles from "./Page.module.css";
export default function Page({ title, description, children, home = false, backTo = "/", backLabel = "Beranda" }) {
  return <section className={styles.page + (home ? " " + styles.homePage : "")}>
    {!home && <Link className={styles.back} to={backTo}><img src="/design/back.svg" alt="" />{backLabel}</Link>}
    <h1>{title}</h1>
    {description && <p className={styles.description}>{description}</p>}
    {children}
  </section>;
}
