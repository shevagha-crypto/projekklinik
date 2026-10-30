import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT_DIR, 'frontend');
const DB_PATH = path.resolve(ROOT_DIR, 'database', 'clinic.db');
const SCHEMA_PATH = path.resolve(ROOT_DIR, 'database', 'schema.sql');
const PORT = Number(process.env.PORT) || 3000;

// Inisialisasi Database SQLite
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

if (fs.existsSync(SCHEMA_PATH)) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);
}

// Helpers
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // limit 10MB (mendukung gambar dataURL)
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
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
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
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
          const admin = db.prepare('SELECT id, name, email, phone, role FROM users WHERE role = ?').get('admin') || {
            id: 1, name: 'Admin Klinik', email: 'admin@kliniksehat.id', phone: '0812-3456-7890', role: 'admin'
          };
          return sendJSON(res, 200, admin);
        }

        const user = db.prepare(
          "SELECT id, name, email, phone, role FROM users WHERE lower(email) = lower(?) AND password = ? AND role = 'patient'"
        ).get(identifier.trim(), password);

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
        const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email.trim());
        if (existing) {
          return sendJSON(res, 409, { error: 'Email sudah terdaftar. Gunakan email lain.' });
        }

        const createdAt = new Date().toISOString();
        const insert = db.prepare(
          "INSERT INTO users (name, email, password, phone, role, createdAt) VALUES (?, ?, ?, ?, 'patient', ?)"
        ).run(name.trim(), email.trim().toLowerCase(), password, phone ? phone.trim() : '', createdAt);

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
        const { name, email, phone } = await parseJSON(req);
        const dup = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email.trim(), id);
        if (dup) {
          return sendJSON(res, 409, { error: 'Email sudah digunakan akun lain.' });
        }

        const prevUser = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
        db.prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?').run(
          name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : '', id
        );

        if (prevUser) {
          db.prepare('UPDATE queues SET patientEmail = ?, name = ? WHERE lower(patientEmail) = lower(?)').run(
            email.trim().toLowerCase(), name.trim(), prevUser.email
          );
        }

        return sendJSON(res, 200, { id, name: name.trim(), email: email.trim().toLowerCase(), phone: phone || '' });
      }

      // GET /api/medicines
      if (pathname === '/api/medicines' && method === 'GET') {
        const medicines = db.prepare('SELECT * FROM medicines ORDER BY id ASC').all();
        return sendJSON(res, 200, medicines);
      }

      // POST /api/medicines
      if (pathname === '/api/medicines' && method === 'POST') {
        const { name, category, form, stock, description, image } = await parseJSON(req);
        const insert = db.prepare(
          'INSERT INTO medicines (name, category, form, stock, description, image) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(name.trim(), category.trim(), form, Number(stock) || 0, (description || '').trim(), image || '');

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
            db.prepare('UPDATE medicines SET stock = ?, image = ? WHERE id = ?').run(Number(body.stock) || 0, body.image, id);
          } else {
            db.prepare('UPDATE medicines SET stock = ? WHERE id = ?').run(Number(body.stock) || 0, id);
          }
          return sendJSON(res, 200, { success: true, id });
        }
        if (method === 'DELETE') {
          db.prepare('DELETE FROM medicines WHERE id = ?').run(id);
          return sendJSON(res, 200, { success: true, id });
        }
      }

      // GET /api/queues
      if (pathname === '/api/queues' && method === 'GET') {
        const queues = db.prepare('SELECT * FROM queues ORDER BY id DESC').all();
        return sendJSON(res, 200, queues);
      }

      // POST /api/queues
      if (pathname === '/api/queues' && method === 'POST') {
        const { number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint } = await parseJSON(req);
        const insert = db.prepare(
          'INSERT INTO queues (number, name, doctor, clinic, time, date, createdAt, status, patientEmail, complaint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(number, name, doctor, clinic, time, date, createdAt, status || 'Menunggu', patientEmail || '', complaint || '');

        return sendJSON(res, 201, {
          id: Number(insert.lastInsertRowid),
          number, name, doctor, clinic, time, date, createdAt, status: status || 'Menunggu', patientEmail: patientEmail || '', complaint: complaint || ''
        });
      }

      // PATCH /api/queues/:id
      const queueMatch = pathname.match(/^\/api\/queues\/(\d+)$/);
      if (queueMatch && method === 'PATCH') {
        const id = Number(queueMatch[1]);
        if (method === 'PATCH') {
          const { status } = await parseJSON(req);
          db.prepare('UPDATE queues SET status = ? WHERE id = ?').run(status, id);
          return sendJSON(res, 200, { success: true, id, status });
        }
        if (method === 'DELETE') {
          db.prepare('DELETE FROM queues WHERE id = ?').run(id);
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
