import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, Home, PenLine, Search } from "lucide-react";
import styles from "./AppLayout.module.css";

const links = [
  { to: "/", label: "Beranda", icon: Home, end: true },
  { to: "/write", label: "Tulis Menfess", icon: PenLine },
  { to: "/status", label: "Periksa Status", icon: Search },
  { to: "/guide", label: "Panduan", icon: BookOpen },
];

export default function AppLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.logo}>
          Menfess Spenthree
        </NavLink>
        <nav aria-label="Navigasi utama">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ""}`
              }
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Ruang pesan anonim untuk komunitas Spenthree.
      </footer>
    </div>
  );
}
