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
const PORT = Number(process.env.PORT) || 3000;

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
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);
  try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch (err) { if (!err.message.includes('duplicate column name')) throw err; }
  try { db.exec("ALTER TABLE queues ADD COLUMN complaint TEXT DEFAULT ''"); } catch (err) { if (!err.message.includes('duplicate column name')) throw err; }
  // Index untuk percepat query filtering antrian & dokter
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_queues_date ON queues(date);
    CREATE INDEX IF NOT EXISTS idx_queues_patientEmail ON queues(patientEmail);
    CREATE INDEX IF NOT EXISTS idx_doctor_schedules_active ON doctor_schedules(is_active);
  `);
}

// Pre-compiled prepared statements untuk hindari re-kompilasi query
const stmts = {
  getAdmin: db.prepare('SELECT id, name, email, phone, bio, role FROM users WHERE role = ?'),
  getUserLogin: db.prepare("SELECT id, name, email, phone, bio, role FROM users WHERE lower(email) = lower(?) AND password = ? AND role = 'patient'"),
  getUserByEmail: db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)'),
  getUserById: db.prepare('SELECT email FROM users WHERE id = ?'),
  checkDupEmail: db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?'),
  insertUser: db.prepare("INSERT INTO users (name, email, password, phone, role, createdAt) VALUES (?, ?, ?, ?, 'patient', ?)"),
  updateUser: db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, bio = ? WHERE id = ?'),
  updateQueuesUser: db.prepare('UPDATE queues SET patientEmail = ?, name = ? WHERE lower(patientEmail) = lower(?)'),
  getMedicines: db.prepare('SELECT * FROM medicines ORDER BY id ASC'),
  insertMedicine: db.prepare('INSERT INTO medicines (name, category, form, stock, description, image) VALUES (?, ?, ?, ?, ?, ?)'),
  updateMedicineWithImg: db.prepare('UPDATE medicines SET stock = ?, image = ? WHERE id = ?'),
  updateMedicineStock: db.prepare('UPDATE medicines SET stock = ? WHERE id = ?'),
  deleteMedicine: db.prepare('DELETE FROM medicines WHERE id = ?'),
  getSchedules: db.prepare('SELECT * FROM doctor_schedules ORDER BY id ASC'),
  insertSchedule: db.prepare('INSERT INTO doctor_schedules (doctor_name, clinic, day, start_time, end_time, is_active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  updateSchedule: db.prepare('UPDATE doctor_schedules SET doctor_name = ?, clinic = ?, day = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?'),
  deleteSchedule: db.prepare('DELETE FROM doctor_schedules WHERE id = ?'),
  getQueuesByDate: db.prepare('SELECT * FROM queues WHERE date = ? ORDER BY id DESC'),
  insertQueue: db.prepare('INSERT INTO queues (number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateQueueStatus: db.prepare('UPDATE queues SET status = ? WHERE id = ?'),
  deleteQueue: db.prepare('DELETE FROM queues WHERE id = ?')
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
    if (isCompressible && acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
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
            id: 1, name: 'Admin Klinik', email: 'admin@kliniksehat.id', phone: '0812-3456-7890', bio: '', role: 'admin'
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
        const { name, email, phone, bio = '' } = await parseJSON(req);
        if (!name?.trim() || !email?.trim() || typeof bio !== 'string' || bio.length > 1000) {
          return sendJSON(res, 400, { error: 'Nama, email, dan bio (maksimal 1000 karakter) wajib valid.' });
        }
        const dup = stmts.checkDupEmail.get(email.trim(), id);
        if (dup) {
          return sendJSON(res, 409, { error: 'Email sudah digunakan akun lain.' });
        }

        const prevUser = stmts.getUserById.get(id);
        stmts.updateUser.run(
          name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : '', bio.trim(), id
        );

        if (prevUser) {
          stmts.updateQueuesUser.run(
            email.trim().toLowerCase(), name.trim(), prevUser.email
          );
        }

        return sendJSON(res, 200, { id, name: name.trim(), email: email.trim().toLowerCase(), phone: phone || '', bio: bio.trim() });
      }

      // GET /api/medicines
      if (pathname === '/api/medicines' && method === 'GET') {
        const medicines = stmts.getMedicines.all();
        return sendJSON(res, 200, medicines);
      }

      // POST /api/medicines
      if (pathname === '/api/medicines' && method === 'POST') {
        const { name, category, form, stock, description, image } = await parseJSON(req);
        const insert = stmts.insertMedicine.run(name.trim(), category.trim(), form, Number(stock) || 0, (description || '').trim(), image || '');

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          name: name.trim(),
          category: category.trim(),
          form,
          stock: Number(stock) || 0,
          description: (description || '').trim(),
          image: image || '',
        });
      }

      // PUT & DELETE /api/medicines/:id
      const medMatch = pathname.match(/^\/api\/medicines\/(\d+)$/);
      if (medMatch) {
        const id = Number(medMatch[1]);
        if (method === 'PUT') {
          const body = await parseJSON(req);
          if (body.image !== undefined) {
            stmts.updateMedicineWithImg.run(Number(body.stock) || 0, body.image, id);
          } else {
            stmts.updateMedicineStock.run(Number(body.stock) || 0, id);
          }
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
        const today = new Date().toISOString().split('T')[0];
        const queues = stmts.getQueuesByDate.all(today);
        return sendJSON(res, 200, queues);
      }

      // POST /api/queues
      if (pathname === '/api/queues' && method === 'POST') {
        const { number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint } = await parseJSON(req);
        const insert = stmts.insertQueue.run(
          number, name, doctor, clinic, time, date, createdAt, status || 'Menunggu', patientEmail || '', complaint || ''
        );

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          number, name, doctor, clinic, time, date, createdAt, status: status || 'Menunggu', patientEmail: patientEmail || '', complaint: complaint || ''
        });
      }

      // PATCH & DELETE /api/queues/:id
      const queueMatch = pathname.match(/^\/api\/queues\/(\d+)$/);
      if (queueMatch && (method === 'PATCH' || method === 'DELETE')) {
        const id = Number(queueMatch[1]);
        if (method === 'PATCH') {
          const { status } = await parseJSON(req);
          stmts.updateQueueStatus.run(status, id);
          return sendJSON(res, 200, { success: true, id, status });
        }
        if (method === 'DELETE') {
          stmts.deleteQueue.run(id);
          return sendJSON(res, 200, { success: true, id });
        }
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
