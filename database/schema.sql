-- Schema Database Klinik Polinela
-- SQLite Compatible

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('admin', 'patient')),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  form TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  image TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  doctor TEXT NOT NULL,
  clinic TEXT NOT NULL,
  time TEXT NOT NULL,
  date TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu' CHECK(status IN ('Menunggu', 'Diperiksa', 'Selesai')),
  patientEmail TEXT DEFAULT '',
  complaint TEXT DEFAULT ''
);

-- Data Awal (Seed Data)
INSERT OR IGNORE INTO users (id, name, email, password, phone, role, createdAt)
VALUES (1, 'Admin Klinik', 'admin@kliniksehat.id', 'klinik123', '0812-3456-7890', 'admin', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO medicines (id, name, category, form, stock, description, image) VALUES
(1, 'Paracetamol 500 mg', 'Analgesik', 'Tablet', 120, 'Meredakan demam dan nyeri ringan hingga sedang seperti sakit kepala, sakit gigi, dan nyeri otot.', ''),
(2, 'Amoxicillin 500 mg', 'Antibiotik', 'Kapsul', 18, 'Antibiotik untuk mengobati infeksi bakteri pada saluran pernapasan, telinga, dan saluran kemih.', ''),
(3, 'Vitamin C 500 mg', 'Vitamin', 'Tablet', 75, 'Suplemen untuk menjaga daya tahan tubuh dan membantu proses penyembuhan.', ''),
(4, 'Antasida', 'Antasida', 'Tablet kunyah', 42, 'Menetralkan asam lambung berlebih, meredakan maag dan heartburn.', ''),
(5, 'Cetirizine 10 mg', 'Antihistamin', 'Tablet', 8, 'Meredakan gejala alergi seperti bersin, gatal, dan mata berair.', ''),
(6, 'Oralit', 'Rehidrasi', 'Serbuk', 30, 'Larutan rehidrasi oral untuk mengganti cairan dan elektrolit yang hilang akibat diare.', '');

-- Data antrian sengaja kosong; hanya pendaftaran pasien nyata yang disimpan.
