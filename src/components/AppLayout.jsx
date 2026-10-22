import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import styles from "./AppLayout.module.css";
const links = [
  { to: "/", label: "Beranda", icon: "home" },
  { to: "/write", label: "Tulis", icon: "write" },
  { to: "/status", label: "Status", icon: "status" },
  { to: "/guide", label: "Panduan", icon: "guide" },
];
export default function AppLayout() {
  const { pathname } = useLocation();
  const activeIndex = links.findIndex(({ to }) => pathname === to || (to === "/write" && pathname === "/review"));
  const previousPath = useRef(pathname);
  const main = useRef(null);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      window.scrollTo?.(0, 0);
      main.current?.focus({ preventScroll: true });
      previousPath.current = pathname;
    }
  }, [pathname]);
  return <div className={styles.shell}>
    <a className={styles.skip} href="#main">Lewati ke konten</a>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link to="/" className={styles.brand} aria-label="Beranda SAGARA">
        <img className={styles.brandLogo} src="/design/spenthree-fess-logo.jpg" alt="Spenthree Fess" width="35" height="35" />
        <span className={styles.identity}><span>spenthreeskj_fess</span><span>SMP Negeri 3 Sokaraja</span></span>
      </Link>
      <span className={styles.school}><span className={styles.schoolCrop}><img src="/design/school.png" alt="SMP Negeri 3 Sokaraja" /></span></span>
    </div></header>
    <main className={styles.main} id="main" ref={main} tabIndex={-1}><Outlet /></main>
    <nav className={styles.nav} aria-label="Navigasi utama"><div className={styles.navInner} data-active={activeIndex}>
      <span className={styles.navIndicator} aria-hidden="true"><span /></span>
      {links.map(({ to, label, icon }) => {
        const selected = pathname === to || (to === "/write" && pathname === "/review");
        return <Link key={to} to={to} aria-current={selected ? "page" : undefined} className={styles.link + (selected ? " " + styles.active : "")}>
          <span className={styles.navIcon}><img src={"/design/" + icon + (selected ? "-active" : "") + ".svg"} alt="" /></span><span>{label}</span>
        </Link>;
      })}
    </div></nav>
  </div>;
}
