# Klinik Polinela — Management System

Sistem manajemen antrian dan inventaris obat Klinik Polinela berbasis Node.js native dan SQLite (zero external dependencies).

---

## Prasyarat

- **Node.js v22.5.0 atau lebih baru** (menggunakan fitur bawaan `node:sqlite`). Cek versi:
  ```bash
  node -v
  ```

---

## Cara Menjalankan

1. **Buka terminal** di folder proyek ini.
2. **Jalankan server**:
   ```bash
   npm start
   ```
   *(atau `npm run dev` untuk development)*
3. **Buka browser** dan akses:
   ```
   http://localhost:3000
   ```

---

## Akun Default

| Peran | Username / Email | Kata Sandi |
| :--- | :--- | :--- |
| **Admin** | `admin` *(atau `admin@kliniksehat.id`)* | `klinik123` |

> Untuk akun **Pasien**, klik **"Daftar di sini"** pada halaman login untuk registrasi akun baru.

---

## Pengujian (Testing)

Jalankan suite tes endpoint dan integrasi:
```bash
npm test
```
