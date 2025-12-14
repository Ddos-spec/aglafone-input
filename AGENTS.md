# Repository Guidelines

## Struktur Proyek & Organisasi Modul
- Kode aplikasi ada di `src/` per fitur: `src/pages/penjualan.tsx`, `src/pages/pembelian.tsx`, `src/pages/dashboard-stok.tsx`; logika stok di `src/lib/stock/`.
- Komponen pakai ulang di `src/components/` (form, tabel); utilitas umum di `src/lib/`.
- Aset publik di `public/`; aset yang diimpor di `src/assets/`.
- Tes di `tests/` meniru struktur atau berdampingan sebagai `__tests__/`.

## Perintah Build, Test, dan Pengembangan
- `npm install` - pasang dependensi.
- `npm run dev` - jalankan server dev dengan hot reload.
- `npm run build` - bundel produksi ke `dist/`.
- `npm test` - jalankan unit/integrasi; tambah `-- --watch` saat iterasi.
- `npm run lint` - jalankan ESLint dan cek format.
- `npm run format` - terapkan Prettier.

## Gaya Kode & Konvensi Penamaan
- Gunakan TypeScript (`.ts`, `.tsx`); UI dan teks harus berbahasa Indonesia.
- Prettier: indent 2 spasi, single quotes, trailing commas, semicolon; urutkan import: bawaan -> eksternal -> internal.
- Komponen/kelas `PascalCase`; fungsi/variabel `camelCase`; konstanta `SCREAMING_SNAKE_CASE`.
- Satu komponen per berkas; stil terkolokasi dalam folder yang sama.

## Panduan Pengujian
- Gunakan Vitest/Jest dengan nama `*.test.ts[x]` (mis. `stockReducer.test.ts`).
- Uji bahwa input penjualan mengurangi stok, input pembelian menambah stok, dan dashboard menampilkan saldo/riwayat stok.
- Target cakupan 80%+; sertakan jalur error dan edge case.
- Mock jaringan/penyimpanan; hindari memanggil layanan nyata.

## Pedoman Commit & Pull Request
- Ikuti Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) dengan kalimat imperatif singkat.
- Cabang: `feature/<id>-<slug>` atau `fix/<id>-<slug>`.
- PR harus menjelaskan perubahan, tes yang dijalankan, tautan isu, dan tangkapan layar untuk perubahan UI (bahasa Indonesia).
- Pastikan data contoh memakai konteks lokal dan berbahasa Indonesia.

## Keamanan & Konfigurasi
- Jangan commit rahasia atau artefak build (`dist/`, laporan cakupan, `.env.local`); pakai `.env.example` untuk contoh variabel.
- Validasi input (angka, tanggal, stok tidak negatif) di sisi klien dan server; tampilkan pesan error yang jelas.
- Tinjau dependensi baru; gunakan utilitas yang sudah ada sebelum menambah paket.
