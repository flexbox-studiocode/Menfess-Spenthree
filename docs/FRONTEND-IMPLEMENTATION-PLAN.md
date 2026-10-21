# Rencana penggantian SAGARA

Sumber visual: Figma 4uOzAoUAwIBh6TL7f9cGsN, halaman 52:2, enam frame 59:770, 59:867, 59:937, 59:995, 59:1047, 59:1138. Sumber fungsi: source aplikasi dan dua Edge Functions yang ada. Implementasi langsung sesuai permintaan pengguna.

1. Rekam context/screenshot keenam frame dan unduh aset ke public/design. Gunakan CSS Modules, Inter lokal, dan token global; tanpa dependensi baru.
2. Ganti AppLayout, Page, dan semua halaman pada route yang sama. Komponen bersama hanya progress, privasi, dan persetujuan. Desktop/tablet memperluas hierarki mobile karena Figma hanya menyediakan lebar 412px.
3. Pertahankan src/services, src/lib, env, Supabase, payload submit/track, draft sessionStorage, dan navigasi receipt. Pastikan request_id tetap pada retry. Jangan mengarang feed, likes, tanggapan, atau persetujuan moderator yang tidak tersedia di backend.
4. Uji routes, validasi, draft, submit gagal/retry/sukses, lookup/error/loading, clipboard, navigasi, focus, aset, overflow. Jalankan npm.cmd test, lint, build. Tidak tersedia skrip typecheck pada proyek JavaScript ini.
5. Bandingkan screenshot 412px dengan frame asli, lalu cek 320/375/768/1440px. Catat perbedaan data/backend serta perluasan responsif dalam laporan. Jangan commit atau push.
