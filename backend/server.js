import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT_DIR, 'frontend');
const DB_PATH = path.resolve(ROOT_DIR, 'database', 'clinic.db');
const SCHEMA_PATH = path.resolve(ROOT_DIR, 'database', 'schema.sql');
const PORT = Number(process.env.PORT || process.argv[2]) || 3000;

// Inisialisasi Database SQLite dengan performa optimal
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

// ponytail: SQLite WAL mode + cache size untuk konkurensi dan query cepat
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -2000;
  PRAGMA temp_store = MEMORY;
`);

if (fs.existsSync(SCHEMA_PATH)) {
  try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN age INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN photo TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE queues ADD COLUMN complaint TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE medicines ADD COLUMN dosage TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE medicines ADD COLUMN sideEffects TEXT DEFAULT ''"); } catch (_) {}
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);
  try {
    db.exec(`
      UPDATE medicines SET
        dosage = CASE id
          WHEN 1 THEN 'Dewasa: 1 tablet 3-4 kali sehari setelah makan. Anak 6-12 tahun: 1/2 - 1 tablet 3-4 kali sehari.'
          WHEN 2 THEN 'Dewasa: 1 kapsul tiap 8 jam sesudah makan. Harus dihabiskan sesuai anjuran dokter.'
          WHEN 3 THEN '1 tablet sekali sehari setelah makan.'
          WHEN 4 THEN '1-2 tablet dikunyah 1-2 jam setelah makan dan menjelang tidur.'
          WHEN 5 THEN 'Dewasa & anak >12 tahun: 1 tablet sekali sehari pada malam hari.'
          WHEN 6 THEN 'Larutkan 1 sachet ke dalam 200 ml air matang. Minum bertahap setiap diare.'
          ELSE dosage
        END,
        sideEffects = CASE id
          WHEN 1 THEN 'Jarang terjadi; pemakaian berlebih dapat merusak fungsi hati.'
          WHEN 2 THEN 'Mual, diare, ruam kulit, atau reaksi alergi.'
          WHEN 3 THEN 'Dosis berlebih dapat memicu kram perut atau diare.'
          WHEN 4 THEN 'Sembelit, diare ringan, atau kembung.'
          WHEN 5 THEN 'Kantuk, mulut kering, lelah, atau pusing.'
          WHEN 6 THEN 'Umumnya aman jika takaran air tepat.'
          ELSE sideEffects
        END
      WHERE (dosage IS NULL OR dosage = '') AND id IN (1, 2, 3, 4, 5, 6);
    `);
  } catch (_) {}
  // Index untuk percepat query filtering antrian & dokter
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_queues_date ON queues(date);
    CREATE INDEX IF NOT EXISTS idx_queues_patientEmail ON queues(patientEmail);
    CREATE INDEX IF NOT EXISTS idx_doctor_schedules_active ON doctor_schedules(is_active);
    CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
  `);
}

// Pre-compiled prepared statements untuk hindari re-kompilasi query
const stmts = {
  getAdmin: db.prepare('SELECT id, name, email, phone, bio, role, age, status, photo FROM users WHERE role = ?'),
  getUserLogin: db.prepare("SELECT id, name, email, phone, bio, role, age, status, photo FROM users WHERE lower(email) = lower(?) AND password = ? AND role = 'patient'"),
  getUserByEmail: db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)'),
  getUserById: db.prepare('SELECT email FROM users WHERE id = ?'),
  checkDupEmail: db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?'),
  insertUser: db.prepare("INSERT INTO users (name, email, password, phone, role, createdAt) VALUES (?, ?, ?, ?, 'patient', ?)"),
  updateUser: db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, bio = ?, age = ?, status = ?, photo = ? WHERE id = ?'),
  updateQueuesUser: db.prepare('UPDATE queues SET patientEmail = ?, name = ? WHERE lower(patientEmail) = lower(?)'),
  getMedicines: db.prepare('SELECT * FROM medicines ORDER BY id ASC'),
  insertMedicine: db.prepare('INSERT INTO medicines (name, category, form, stock, description, dosage, sideEffects, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  updateMedicine: db.prepare('UPDATE medicines SET stock = ?, image = ?, description = ?, dosage = ?, sideEffects = ? WHERE id = ?'),
  deleteMedicine: db.prepare('DELETE FROM medicines WHERE id = ?'),
  getSchedules: db.prepare('SELECT * FROM doctor_schedules ORDER BY id ASC'),
  insertSchedule: db.prepare('INSERT INTO doctor_schedules (doctor_name, clinic, day, start_time, end_time, is_active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  updateSchedule: db.prepare('UPDATE doctor_schedules SET doctor_name = ?, clinic = ?, day = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?'),
  deleteSchedule: db.prepare('DELETE FROM doctor_schedules WHERE id = ?'),
  getAllQueues: db.prepare('SELECT * FROM queues ORDER BY id DESC'),
  getQueuesByDate: db.prepare('SELECT * FROM queues WHERE date = ? ORDER BY id DESC'),
  insertQueue: db.prepare('INSERT INTO queues (number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateQueueStatus: db.prepare('UPDATE queues SET status = ? WHERE id = ?'),
  deleteQueue: db.prepare('DELETE FROM queues WHERE id = ?'),
  getOrders: db.prepare('SELECT * FROM orders ORDER BY date DESC'),
  getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  insertOrder: db.prepare('INSERT INTO orders (id, userId, name, items, status, date) VALUES (?, ?, ?, ?, ?, ?)'),
  updateOrderStatus: db.prepare('UPDATE orders SET status = ? WHERE id = ?')
};

// Helpers
function sendJSON(res, status, data) {
  const payload = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function parseJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { // limit 10MB
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ponytail: serveStatic dengan ETag / 304 Not Modified & Gzip compression
function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(FRONTEND_DIR, relativePath);

  // Cegah directory traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendJSON(res, 403, { error: 'Akses ditolak' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJSON(res, 404, { error: 'File tidak ditemukan' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCompressible = /text|javascript|json|svg/.test(contentType);
    const etag = `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'ETag': etag,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    };

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) sendJSON(res, 500, { error: 'Gagal membaca file' });
    });

    if (isCompressible && acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      stream.pipe(zlib.createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      stream.pipe(res);
    }
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Router API
  if (pathname.startsWith('/api/')) {
    try {
      // POST /api/auth/login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const { identifier, password, role } = await parseJSON(req);
        if (role === 'admin') {
          if (identifier.toLowerCase() !== 'admin' || password !== 'klinik123') {
            return sendJSON(res, 401, { error: 'Username atau kata sandi admin salah.' });
          }
          const admin = stmts.getAdmin.get('admin') || {
            id: 1, name: 'Admin Klinik', email: 'adminklinik@polinela.ac.id', phone: '0812-3456-7890', bio: '', role: 'admin'
          };
          return sendJSON(res, 200, admin);
        }

        const user = stmts.getUserLogin.get(identifier.trim(), password);
        if (!user) {
          return sendJSON(res, 401, { error: 'Akun pasien tidak ditemukan atau kata sandi salah.' });
        }
        return sendJSON(res, 200, user);
      }

      // POST /api/auth/register
      if (pathname === '/api/auth/register' && method === 'POST') {
        const { name, email, password, phone } = await parseJSON(req);
        if (!name || !email || !password) {
          return sendJSON(res, 400, { error: 'Nama, email, dan kata sandi wajib diisi.' });
        }
        const existing = stmts.getUserByEmail.get(email.trim());
        if (existing) {
          return sendJSON(res, 409, { error: 'Email sudah terdaftar. Gunakan email lain.' });
        }

        const createdAt = new Date().toISOString();
        const insert = stmts.insertUser.run(name.trim(), email.trim().toLowerCase(), password, phone ? phone.trim() : '', createdAt);

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone ? phone.trim() : '',
          role: 'patient',
          createdAt,
        });
      }

      // PUT /api/users/:id
      const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (userMatch && method === 'PUT') {
        const id = Number(userMatch[1]);
        const { name, email, phone, bio = '', age = null, status = '', photo = '' } = await parseJSON(req);
        if (!name?.trim() || !email?.trim() || typeof bio !== 'string' || bio.length > 1000) {
          return sendJSON(res, 400, { error: 'Nama, email, dan bio (maksimal 1000 karakter) wajib valid.' });
        }
        const dup = stmts.checkDupEmail.get(email.trim(), id);
        if (dup) {
          return sendJSON(res, 409, { error: 'Email sudah digunakan akun lain.' });
        }

        const prevUser = stmts.getUserById.get(id);
        stmts.updateUser.run(
          name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : '', bio.trim(),
          age ? Number(age) : null, status ? String(status).trim() : '', photo || '', id
        );

        if (prevUser) {
          stmts.updateQueuesUser.run(
            email.trim().toLowerCase(), name.trim(), prevUser.email
          );
        }

        return sendJSON(res, 200, {
          id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone || '',
          bio: bio.trim(),
          age: age ? Number(age) : null,
          status: status ? String(status).trim() : '',
          photo: photo || ''
        });
      }

      // GET /api/medicines
      if (pathname === '/api/medicines' && method === 'GET') {
        const medicines = stmts.getMedicines.all();
        return sendJSON(res, 200, medicines);
      }

      // POST /api/medicines
      if (pathname === '/api/medicines' && method === 'POST') {
        const { name, category, form, stock, description, dosage, sideEffects, image } = await parseJSON(req);
        if (!name?.trim() || !category?.trim() || !form) {
          return sendJSON(res, 400, { error: 'Nama, kategori, dan bentuk obat wajib diisi.' });
        }
        const insert = stmts.insertMedicine.run(name.trim(), category.trim(), form, Number(stock) || 0, (description || '').trim(), (dosage || '').trim(), (sideEffects || '').trim(), image || '');

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          name: name.trim(),
          category: category.trim(),
          form,
          stock: Number(stock) || 0,
          description: (description || '').trim(),
          dosage: (dosage || '').trim(),
          sideEffects: (sideEffects || '').trim(),
          image: image || '',
        });
      }

      // PUT & DELETE /api/medicines/:id
      const medMatch = pathname.match(/^\/api\/medicines\/(\d+)$/);
      if (medMatch) {
        const id = Number(medMatch[1]);
        if (method === 'PUT') {
          const body = await parseJSON(req);
          const current = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id);
          if (!current) {
            return sendJSON(res, 404, { error: 'Obat tidak ditemukan' });
          }
          const stock = body.stock !== undefined ? Number(body.stock) : current.stock;
          const image = body.image !== undefined ? body.image : current.image;
          const description = body.description !== undefined ? body.description : current.description;
          const dosage = body.dosage !== undefined ? body.dosage : current.dosage;
          const sideEffects = body.sideEffects !== undefined ? body.sideEffects : current.sideEffects;
          stmts.updateMedicine.run(stock, image, description, dosage, sideEffects, id);
          return sendJSON(res, 200, { success: true, id });
        }
        if (method === 'DELETE') {
          stmts.deleteMedicine.run(id);
          return sendJSON(res, 200, { success: true, id });
        }
      }

      // GET /api/doctor-schedules (publik: admin & pasien)
      if (pathname === '/api/doctor-schedules' && method === 'GET') {
        const schedules = stmts.getSchedules.all();
        return sendJSON(res, 200, schedules);
      }

      // POST /api/doctor-schedules (admin)
      if (pathname === '/api/doctor-schedules' && method === 'POST') {
        const body = await parseJSON(req);
        const { doctor_name, clinic, day, start_time, end_time, is_active = 1 } = body;
        if (!doctor_name?.trim() || !clinic?.trim() || !day || !start_time || !end_time) {
          return sendJSON(res, 400, { error: 'Nama dokter, poli, hari, dan jam wajib diisi.' });
        }
        const createdAt = new Date().toISOString();
        const insert = stmts.insertSchedule.run(
          doctor_name.trim(), clinic.trim(), day, start_time, end_time, Number(is_active) ? 1 : 0, createdAt
        );

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          doctor_name: doctor_name.trim(),
          clinic: clinic.trim(),
          day,
          start_time,
          end_time,
          is_active: Number(is_active) ? 1 : 0,
          createdAt,
        });
      }

      // PUT & DELETE /api/doctor-schedules/:id (admin)
      const schedMatch = pathname.match(/^\/api\/doctor-schedules\/(\d+)$/);
      if (schedMatch) {
        const id = Number(schedMatch[1]);
        if (method === 'PUT') {
          const body = await parseJSON(req);
          const { doctor_name, clinic, day, start_time, end_time, is_active = 1 } = body;
          if (!doctor_name?.trim() || !clinic?.trim() || !day || !start_time || !end_time) {
            return sendJSON(res, 400, { error: 'Nama dokter, poli, hari, dan jam wajib diisi.' });
          }
          stmts.updateSchedule.run(
            doctor_name.trim(), clinic.trim(), day, start_time, end_time, Number(is_active) ? 1 : 0, id
          );
          return sendJSON(res, 200, { success: true, id });
        }
        if (method === 'DELETE') {
          stmts.deleteSchedule.run(id);
          return sendJSON(res, 200, { success: true, id });
        }
      }

      // GET /api/queues
      if (pathname === '/api/queues' && method === 'GET') {
        const dateParam = parsedUrl.searchParams.get('date');
        const queues = dateParam
          ? stmts.getQueuesByDate.all(dateParam)
          : stmts.getAllQueues.all();
        return sendJSON(res, 200, queues);
      }

      // POST /api/queues
      if (pathname === '/api/queues' && method === 'POST') {
        const { number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint } = await parseJSON(req);
        if (!name?.trim() || !number?.trim()) {
          return sendJSON(res, 400, { error: 'Nama dan nomor antrian wajib diisi.' });
        }
        const insert = stmts.insertQueue.run(
          number.trim(), name.trim(), doctor || 'dr. Dian', clinic || 'Poli Umum', time || '', date || new Date().toISOString().split('T')[0], createdAt || new Date().toISOString(), status || 'Menunggu', patientEmail ? patientEmail.trim().toLowerCase() : '', complaint ? complaint.trim() : ''
        );

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          number: number.trim(),
          name: name.trim(),
          doctor: doctor || 'dr. Dian',
          clinic: clinic || 'Poli Umum',
          time: time || '',
          date: date || new Date().toISOString().split('T')[0],
          createdAt: createdAt || new Date().toISOString(),
          status: status || 'Menunggu',
          patientEmail: patientEmail ? patientEmail.trim().toLowerCase() : '',
          complaint: complaint ? complaint.trim() : ''
        });
      }

      // PATCH & DELETE /api/queues/:id
      const queueMatch = pathname.match(/^\/api\/queues\/(\d+)$/);
      if (queueMatch && (method === 'PATCH' || method === 'DELETE')) {
        const id = Number(queueMatch[1]);
        if (method === 'PATCH') {
          const { status } = await parseJSON(req);
          if (!['Menunggu', 'Diperiksa', 'Selesai'].includes(status)) {
            return sendJSON(res, 400, { error: 'Status antrian tidak valid' });
          }
          stmts.updateQueueStatus.run(status, id);
          return sendJSON(res, 200, { success: true, id, status });
        }
        if (method === 'DELETE') {
          stmts.deleteQueue.run(id);
          return sendJSON(res, 200, { success: true, id });
        }
      }

      // GET & POST /api/orders
      if (pathname === '/api/orders') {
        if (method === 'GET') {
          const allOrders = stmts.getOrders.all().map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || [])
          }));
          return sendJSON(res, 200, allOrders);
        }
        if (method === 'POST') {
          const { id, userId, name, items, status = 'Menunggu Pengambilan', date = new Date().toISOString() } = await parseJSON(req);
          if (!id || !name || !items) {
            return sendJSON(res, 400, { error: 'Data pesanan tidak lengkap.' });
          }
          const itemsList = typeof items === 'string' ? JSON.parse(items) : items;
          const itemsStr = JSON.stringify(itemsList);
          stmts.insertOrder.run(id, Number(userId) || 0, name.trim(), itemsStr, status, date);
          for (const it of itemsList) {
            if (it.name && it.qty) {
              db.prepare('UPDATE medicines SET stock = MAX(0, stock - ?) WHERE name = ?').run(Number(it.qty) || 0, it.name);
            }
          }
          return sendJSON(res, 201, { id, userId: Number(userId) || 0, name: name.trim(), items: itemsList, status, date });
        }
      }

      // PATCH /api/orders/:id
      const orderMatch = pathname.match(/^\/api\/orders\/([^\/]+)$/);
      if (orderMatch && method === 'PATCH') {
        const orderId = orderMatch[1];
        const { status } = await parseJSON(req);
        const existing = stmts.getOrderById.get(orderId);
        if (!existing) return sendJSON(res, 404, { error: 'Pesanan tidak ditemukan' });

        stmts.updateOrderStatus.run(status, orderId);
        if (status === 'Dibatalkan' && existing.status !== 'Dibatalkan') {
          try {
            const itemsList = JSON.parse(existing.items);
            for (const it of itemsList) {
              if (it.name && it.qty) {
                db.prepare('UPDATE medicines SET stock = stock + ? WHERE name = ?').run(Number(it.qty) || 0, it.name);
              }
            }
          } catch (_) {}
        }
        return sendJSON(res, 200, { success: true, id: orderId, status });
      }

      return sendJSON(res, 404, { error: 'Endpoint API tidak ditemukan' });
    } catch (err) {
      console.error('Server error:', err);
      return sendJSON(res, 500, { error: 'Internal server error', details: err.message });
    }
  }

  // Layani Frontend Static
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
