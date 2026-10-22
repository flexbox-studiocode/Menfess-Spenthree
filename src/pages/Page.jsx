import { Link, useLocation } from "react-router-dom";
import styles from "./Page.module.css";
export default function Page({ title, description, children, home = false, backTo = "/", backLabel = "Beranda", onBack }) {
  const { state } = useLocation();
  return <section className={styles.page + (home ? " " + styles.homePage : "")} data-message-direction={state?.messageDirection} data-message-transition={state?.messageTransition || undefined}>
    {!home && <Link className={`${styles.back} motion-link`} to={backTo} onClick={onBack}><img src="/design/back.svg" alt="" /><span>{backLabel}</span></Link>}
    <h1>{title}</h1>
    {description && <p className={styles.description}>{description}</p>}
    {children}
  </section>;
}
