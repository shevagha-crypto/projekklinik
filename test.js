import assert from 'node:assert';

// ponytail: self-check minimalis berbasis node stdlib test runner tanpa framework
const PORT = 3001;
process.env.PORT = String(PORT);

await import('./backend/server.js');

const resMeds = await fetch(`http://localhost:${PORT}/api/medicines`);
assert.strictEqual(resMeds.status, 200);
const meds = await resMeds.json();
assert(Array.isArray(meds) && meds.length >= 6);

const resLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin', password: 'klinik123', role: 'admin' })
});
assert.strictEqual(resLogin.status, 200);
const admin = await resLogin.json();
assert.strictEqual(admin.role, 'admin');

const uniqueEmail = `test_${Date.now()}@example.com`;
const resRegister = await fetch(`http://localhost:${PORT}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Pasien Test', email: uniqueEmail, password: 'password123', phone: '08123456789' })
});
assert.strictEqual(resRegister.status, 201);

const resPatientLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: uniqueEmail, password: 'password123', role: 'patient' })
});
assert.strictEqual(resPatientLogin.status, 200);

const resStatic = await fetch(`http://localhost:${PORT}/`);
assert.strictEqual(resStatic.status, 200);

console.log('Self-check passed: Backend, SQLite DB, dan Frontend static OK.');
process.exit(0);
