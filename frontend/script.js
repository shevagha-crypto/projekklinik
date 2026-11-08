const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let medicines = [];
let cart = [];
let orders = [];
let queues = [];
let schedules = [];
let currentUser = null;
let toastTimer;
const todayKey = localDateKey(new Date());
let selectedDashboardDate = todayKey;

// Penyimpanan lokal: aplikasi berjalan langsung lewat Live Server tanpa Node.js/database.
const STORE = 'klinik-polinela-v1';
const DEFAULT_ADMIN = {
  id: 1,
  name: 'Admin Klinik',
  email: 'admin@kliniksehat.id',
  password: 'klinik123',
  phone: '0812-3456-7890',
  bio: '',
  role: 'admin',
  status: 'civitas akademik',
  age: '',
  photo: '',
  createdAt: '2026-01-01T00:00:00.000Z'
};

const DEFAULT_SCHEDULES = [
  { id: 1, doctor_name: 'dr. Dian', clinic: 'Poli Umum', day: 'Senin', start_time: '08:00', end_time: '14:00', is_active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, doctor_name: 'dr. Dian', clinic: 'Poli Umum', day: 'Rabu', start_time: '08:00', end_time: '14:00', is_active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 3, doctor_name: 'dr. Tya', clinic: 'Poli Umum', day: 'Selasa', start_time: '09:00', end_time: '15:00', is_active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 4, doctor_name: 'dr. Tya', clinic: 'Poli Umum', day: 'Kamis', start_time: '09:00', end_time: '15:00', is_active: 1, createdAt: '2026-01-01T00:00:00.000Z' }
];

const DEFAULT_MEDICINES = [
  { id: 1, name: 'Paracetamol 500 mg', category: 'Analgesik', form: 'Tablet', stock: 120, description: 'Meredakan demam dan nyeri ringan hingga sedang seperti sakit kepala, sakit gigi, dan nyeri otot.', dosage: 'Dewasa: 1 tablet 3-4 kali sehari setelah makan. Anak 6-12 tahun: 1/2 - 1 tablet 3-4 kali sehari.', sideEffects: 'Jarang terjadi; pemakaian berlebih dapat merusak fungsi hati.', image: '' },
  { id: 2, name: 'Amoxicillin 500 mg', category: 'Antibiotik', form: 'Kapsul', stock: 18, description: 'Antibiotik untuk mengobati infeksi bakteri pada saluran pernapasan, telinga, dan saluran kemih.', dosage: 'Dewasa: 1 kapsul tiap 8 jam sesudah makan. Harus dihabiskan sesuai anjuran dokter.', sideEffects: 'Mual, diare, ruam kulit, atau reaksi alergi.', image: '' },
  { id: 3, name: 'Vitamin C 500 mg', category: 'Vitamin', form: 'Tablet', stock: 75, description: 'Suplemen untuk menjaga daya tahan tubuh dan membantu proses penyembuhan.', dosage: '1 tablet sekali sehari setelah makan.', sideEffects: 'Dosis berlebih dapat memicu kram perut atau diare.', image: '' },
  { id: 4, name: 'Antasida', category: 'Antasida', form: 'Tablet kunyah', stock: 42, description: 'Menetralkan asam lambung berlebih, meredakan maag dan heartburn.', dosage: '1-2 tablet dikunyah 1-2 jam setelah makan dan menjelang tidur.', sideEffects: 'Sembelit, diare ringan, atau kembung.', image: '' },
  { id: 5, name: 'Cetirizine 10 mg', category: 'Antihistamin', form: 'Tablet', stock: 8, description: 'Meredakan gejala alergi seperti bersin, gatal, dan mata berair.', dosage: 'Dewasa & anak >12 tahun: 1 tablet sekali sehari pada malam hari.', sideEffects: 'Kantuk, mulut kering, lelah, atau pusing.', image: '' },
  { id: 6, name: 'Oralit', category: 'Rehidrasi', form: 'Serbuk', stock: 30, description: 'Larutan rehidrasi oral untuk mengganti cairan dan elektrolit yang hilang akibat diare.', dosage: 'Larutkan 1 sachet ke dalam 200 ml air matang. Minum bertahap setiap diare.', sideEffects: 'Umumnya aman jika takaran air tepat.', image: '' }
];

const readStore = () => {
  const raw = localStorage.getItem(STORE);
  const data = raw ? JSON.parse(raw) : { users: [], medicines: [], queues: [], schedules: [], orders: [] };
  let changed = false;

  if (!data.users || !data.users.length) {
    data.users = [{ ...DEFAULT_ADMIN }];
    changed = true;
  } else if (!data.users.some(u => u.role === 'admin' || u.id === 1)) {
    data.users.unshift({ ...DEFAULT_ADMIN });
    changed = true;
  }

  if (!data.medicines || !data.medicines.length) {
    data.medicines = DEFAULT_MEDICINES;
    changed = true;
  } else {
    data.medicines.forEach(m => {
      const def = DEFAULT_MEDICINES.find(d => d.id === m.id);
      if (def) {
        if (!m.dosage) { m.dosage = def.dosage; changed = true; }
        if (!m.sideEffects) { m.sideEffects = def.sideEffects; changed = true; }
      }
    });
  }

  if (!data.schedules || !data.schedules.length) {
    data.schedules = [...DEFAULT_SCHEDULES];
    changed = true;
  }

  if (!data.orders) {
    data.orders = [];
    changed = true;
  }

  if (changed) writeStore(data);
  return data;
};
const writeStore = data => localStorage.setItem(STORE, JSON.stringify(data));
const bodyOf = options => options.body ? JSON.parse(options.body) : {};
const nextId = list => list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;

const API_BASE = (window.location.protocol.startsWith('http') && window.location.port && !['3000', '3001', '3002'].includes(window.location.port))
  ? 'http://localhost:3002'
  : '';

let useMock = null;

async function api(path, options = {}) {
  if (useMock === true) {
    return mockApi(path, options);
  }
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404) {
      useMock = true;
      return mockApi(path, options);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Terjadi kesalahan sistem');
    }
    useMock = false;
    return data;
  } catch (err) {
    if (useMock === null && (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError'))) {
      useMock = true;
      return mockApi(path, options);
    }
    throw err;
  }
}

function mockApi(path, options = {}) {
  const method = options.method || 'GET';
  const data = readStore();
  const body = bodyOf(options);
  const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

  if (path === '/api/auth/login' && method === 'POST') {
    if (body.role === 'admin') {
      if (body.identifier.toLowerCase() !== 'admin' || body.password !== 'klinik123') fail('Username atau kata sandi admin salah.', 401);
      const admin = data.users.find(u => u.role === 'admin' || u.id === 1) || DEFAULT_ADMIN;
      return { ...admin, password: undefined };
    }
    const user = data.users.find(u => u.email.toLowerCase() === body.identifier.toLowerCase() && u.password === body.password);
    if (!user) fail('Akun pasien tidak ditemukan atau kata sandi salah.', 401);
    return { ...user, password: undefined };
  }

  if (path === '/api/auth/register' && method === 'POST') {
    if (!body.name || !body.email || !body.password) fail('Nama, email, dan kata sandi wajib diisi.');
    if (data.users.some(u => u.email.toLowerCase() === body.email.toLowerCase())) fail('Email sudah terdaftar. Gunakan email lain.', 409);
    const user = { id: nextId(data.users), name: body.name.trim(), email: body.email.trim().toLowerCase(), password: body.password, phone: body.phone || '', bio: '', role: 'patient', createdAt: new Date().toISOString() };
    data.users.push(user);
    writeStore(data);
    return { ...user, password: undefined };
  }

  if (path === '/api/orders' && method === 'GET') {
    return (data.orders || []).slice().reverse();
  }

  if (path === '/api/orders' && method === 'POST') {
    if (!data.orders) data.orders = [];
    const order = { ...body, createdAt: body.date || new Date().toISOString() };
    data.orders.push(order);
    (body.items || []).forEach(it => {
      const med = (data.medicines || []).find(m => m.name === it.name || m.id === it.id);
      if (med) med.stock = Math.max(0, Number(med.stock) - (Number(it.qty) || 0));
    });
    writeStore(data);
    return order;
  }

  const orderMatch = path.match(/^\/api\/orders\/([^\/]+)$/);
  if (orderMatch && (method === 'PATCH' || method === 'PUT')) {
    const o = (data.orders || []).find(x => x.id === orderMatch[1]);
    if (!o) fail('Pesanan tidak ditemukan.', 404);
    if (body.status === 'Dibatalkan' && o.status !== 'Dibatalkan') {
      (o.items || []).forEach(it => {
        const med = (data.medicines || []).find(m => m.name === it.name || m.id === it.id);
        if (med) med.stock = Number(med.stock) + (Number(it.qty) || 0);
      });
    }
    Object.assign(o, body);
    writeStore(data);
    return o;
  }

  const match = path.match(/^\/api\/(medicines|queues|doctor-schedules|users)\/?(\d+)?$/);
  if (!match) fail('Data tidak ditemukan.', 404);
  const type = match[1], id = match[2] ? Number(match[2]) : null;
  const key = { medicines: 'medicines', queues: 'queues', 'doctor-schedules': 'schedules', users: 'users' }[type];

  if (type === 'users' && method === 'PUT') {
    let user = data.users.find(u => u.id === id);
    if (!user && id === 1) {
      user = { ...DEFAULT_ADMIN };
      data.users.unshift(user);
    }
    if (!user) fail('Pengguna tidak ditemukan.', 404);
    if (body.email && data.users.some(u => u.id !== id && u.email.toLowerCase() === body.email.toLowerCase())) {
      fail('Email sudah digunakan akun lain.', 409);
    }
    const prevEmail = user.email;
    Object.assign(user, body);
    if (prevEmail && body.email && prevEmail.toLowerCase() !== body.email.toLowerCase()) {
      data.queues.forEach(q => {
        if (q.patientEmail && q.patientEmail.toLowerCase() === prevEmail.toLowerCase()) {
          q.patientEmail = body.email;
          if (body.name) q.name = body.name;
        }
      });
    }
    writeStore(data);
    return { ...user, password: undefined };
  }

  if (method === 'GET') return key === 'queues' ? data.queues : data[key];
  if (method === 'DELETE') { data[key] = data[key].filter(item => item.id !== id); writeStore(data); return { ok: true }; }
  if (method === 'PUT' || method === 'PATCH') { const item = data[key].find(x => x.id === id); if (!item) fail('Data tidak ditemukan.', 404); Object.assign(item, body); writeStore(data); return item; }
  if (method === 'POST') { const item = { ...body, id: nextId(data[key]), createdAt: body.createdAt || new Date().toISOString() }; data[key].push(item); writeStore(data); return item; }
  fail('Metode tidak didukung.', 405);
}

async function refreshData() {
  try {
    const [meds, qList, sList] = await Promise.all([
      api('/api/medicines'),
      api('/api/queues'),
      api('/api/doctor-schedules')
    ]);
    medicines = meds;
    queues = qList;
    schedules = sList;
  } catch (err) {
    console.error('Gagal mengambil data:', err);
  }
}

function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return todayKey;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(dateKey) {
  if (!dateKey) return "Tanggal tidak diketahui";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function getQueuesForDate(dateKey) {
  return queues
    .filter(q => q.date === dateKey)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || Number(b.id) - Number(a.id));
}

function getUniquePatientsForDate(dateKey, dateQueues) {
  const patientKeys = new Set();
  dateQueues.forEach(q =>
    patientKeys.add(q.patientEmail ? `email:${q.patientEmail.toLowerCase()}` : `name:${String(q.name).trim().toLowerCase()}`)
  );
  return patientKeys.size;
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatProfileStatus(status) {
    return String(status || "").replace(/\b\w/g, letter =>
        letter.toUpperCase()
    );
}

function renderAvatar(element, name, photo) {
    if (!element) return;

    if (photo) {
        element.innerHTML = `
            <img
                src="${photo}"
                alt="Foto profil"
                class="avatar-image"
            >
        `;
    } else {
        element.textContent = initials(name).slice(0, 1);
    }
}

function statusClass(status) {
  return status === "Menunggu" ? "waiting" : status === "Diperiksa" ? "process" : "done";
}

function statusBadge(status) {
  return `<span class="status ${statusClass(status)}">${escapeHTML(status)}</span>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function showError(selector, message) {
  const el = $(selector);
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearError(selector) {
  const el = $(selector);
  el.textContent = "";
  el.classList.add("hidden");
}

function setLoginMode() {
  const isPatient = $("#login-role").value === "patient";
  $("#login-email").value = isPatient ? "" : "admin";
  $("#login-password").value = isPatient ? "" : "klinik123";
  $("#login-email").placeholder = isPatient ? "Masukkan email terdaftar" : "Masukkan username admin";
  $("#login-password").placeholder = "Masukkan kata sandi";
  clearError("#login-error");
}

$$(".toggle-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetInput = document.getElementById(btn.dataset.target);
    if (!targetInput) return;
    const isPassword = targetInput.type === "password";
    targetInput.type = isPassword ? "text" : "password";
    btn.querySelector(".eye-icon").classList.toggle("hidden", isPassword);
    btn.querySelector(".eye-off-icon").classList.toggle("hidden", !isPassword);
    btn.setAttribute("aria-label", isPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
  });
});

// --- Notifikasi ---
const notificationBtn = $("#notification-btn");
const notificationMenu = $("#notification-menu");

let notifications = [
  { text: "Antrian baru telah ditambahkan", time: "Baru saja" },
  { text: "Stok obat Paracetamol menipis", time: "2 jam lalu" },
  { text: "Pasien telah check-in", time: "5 jam lalu" },
];

function renderNotifications() {
  const list = $("#notification-list");
  const empty = $("#notification-empty");
  if (!list) return;
  list.innerHTML = "";
  if (notifications.length === 0) {
    if (empty) empty.classList.remove("hidden");
  } else {
    if (empty) empty.classList.add("hidden");
    notifications.forEach(n => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHTML(n.text)}</span><small>${escapeHTML(n.time)}</small>`;
      list.appendChild(li);
    });
  }
}

notificationBtn.addEventListener("click", e => {
  e.stopPropagation();
  const isHidden = notificationMenu.classList.contains("hidden");
  if (isHidden) renderNotifications();
  notificationMenu.classList.toggle("hidden");
});

$("#notification-clear").addEventListener("click", e => {
  e.stopPropagation();
  notifications = [];
  renderNotifications();
  notificationMenu.classList.add("hidden");
});

document.addEventListener("click", e => {
  if (!notificationBtn.contains(e.target) && !notificationMenu.contains(e.target)) {
    notificationMenu.classList.add("hidden");
  }
});

$("#login-role").addEventListener("change", setLoginMode);

$("#show-register").addEventListener("click", () => {
  $("#login-form").classList.add("hidden");
  $(".register-prompt").classList.add("hidden");
  $("#register-form").classList.remove("hidden");
  clearError("#register-error");
});

$("#cancel-register").addEventListener("click", () => {
  $("#register-form").classList.add("hidden");
  $("#login-form").classList.remove("hidden");
  $(".register-prompt").classList.remove("hidden");
  $("#login-role").value = "patient";
  setLoginMode();
});

$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();
  clearError("#register-error");
  const name = $("#register-name").value.trim();
  const email = $("#register-email").value.trim().toLowerCase();
  const password = $("#register-password").value;
  const phone = $("#register-phone").value.trim();

  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone })
    });
    $("#register-form").reset();
    $("#register-form").classList.add("hidden");
    $("#login-form").classList.remove("hidden");
    $(".register-prompt").classList.remove("hidden");
    $("#login-role").value = "patient";
    $("#login-email").value = email;
    $("#login-password").value = "";
    toast("Akun berhasil dibuat. Silakan masuk.");
  } catch (err) {
    showError("#register-error", err.message);
  }
});

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  clearError("#login-error");
  const role = $("#login-role").value;
  const identifier = $("#login-email").value.trim();
  const password = $("#login-password").value;

  try {
    const user = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, role })
    });
    currentUser = user;
    await refreshData();
    startSession();
  } catch (err) {
    showError("#login-error", err.message);
  }
});

function startSession() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const isAdmin = currentUser.role === "admin";
  $$(".nav-link[data-page='home'], .nav-link[data-page='obat'], .nav-link[data-page='antrian']").forEach(link =>
    link.classList.toggle("hidden", !isAdmin)
  );
  $("#admin-jadwal-nav").classList.toggle("hidden", !isAdmin);
  $("#patient-nav").classList.toggle("hidden", isAdmin);
  $("#info-obat-nav").classList.toggle("hidden", isAdmin);
  $("#patient-lokasi-nav").classList.toggle("hidden", isAdmin);
  $("#patient-jadwal-nav").classList.toggle("hidden", isAdmin);
  $("#top-user-name").textContent = currentUser.name;

$(".user-chip small").textContent = isAdmin
    ? "Administrator"
    : "Pengguna / Pasien";

// Mengisi informasi profil
$("#profile-name").value = currentUser.name || "";
$("#profile-email").value = currentUser.email || "";
$("#profile-phone").value = currentUser.phone || "";
$("#profile-age").value = currentUser.age || "";

$("#profile-status").value = currentUser.status ||
    (isAdmin ? "civitas akademik" : "mahasiswa");

$("#profile-bio").value = currentUser.bio || "";

// Mengosongkan pilihan foto sebelumnya
$("#profile-photo").value = "";

// Menampilkan nama dan email
$("#profile-heading-name").textContent = currentUser.name;
$("#profile-email-preview").textContent = currentUser.email;

// Menampilkan status
$("#profile-status-preview").textContent =
    formatProfileStatus($("#profile-status").value);

// Menampilkan foto profil
renderAvatar(
    $(".avatar"),
    currentUser.name,
    currentUser.photo
);

renderAvatar(
    $("#profile-avatar"),
    currentUser.name,
    currentUser.photo
);
  $("#home-greeting").innerHTML = isAdmin
    ? 'Selamat datang, Admin! <span class="wave">✦</span>'
    : `Halo, ${escapeHTML(currentUser.name.split(" ")[0])}!`;
  $("#home-description").textContent = isAdmin
    ? "Berikut ringkasan aktivitas Klinik Polinela hari ini."
    : "Selamat datang di layanan pasien Klinik Polinela.";

  if (isAdmin) {
    showPage("home");
    renderHome();
    renderMedicines();
    renderAdminOrders();
    renderQueues();
    renderSchedules();
    startPolling();
  } else {
    showPage("pasien");
    renderPatientQueues();
    renderInfoObat();
    renderOrderHistory();
    renderSchedules();
    startPolling();
  }
  toast(`Berhasil masuk sebagai ${isAdmin ? "Admin" : "Pengguna"}`);
}

$("#logout-btn").addEventListener("click", () => {
  currentUser = null;
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-role").value = "admin";
  setLoginMode();
  toast("Anda telah keluar dari akun");
});

function showPage(page) {
  const isAdmin = currentUser?.role === "admin";
  if (!isAdmin && page !== "pasien" && page !== "profil" && page !== "info-obat" && page !== "lokasi" && page !== "jadwal") page = "pasien";
  $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
  const labels = {
    home: "Home / Dashboard",
    obat: "Data Obat",
    antrian: "Antrian",
    profil: "Profil",
    pasien: "Antrian Saya",
    "info-obat": "Informasi Obat",
    lokasi: "Lokasi Klinik",
    jadwal: "Jadwal Dokter"
  };
  $("#breadcrumb-current").textContent = labels[page] || "Home / Dashboard";
  if (page === "info-obat") {
    renderInfoObat();
    renderOrderHistory();
  }
  if (page === "obat") {
    renderMedicines();
    renderAdminOrders();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-link").forEach(link => link.addEventListener("click", () => showPage(link.dataset.page)));
$$("[data-goto]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.goto));
  button.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showPage(button.dataset.goto);
    }
  });
});

function renderHome() {
  const dailyQueues = getQueuesForDate(selectedDashboardDate);
  const dateLabel = formatDateLong(selectedDashboardDate);
  const isToday = selectedDashboardDate === todayKey;
  if ($("#home-description")) $("#home-description").textContent = `Ringkasan aktivitas Klinik Polinela untuk ${dateLabel}.`;
  const subLabel = $("#selected-date-label");
  if (subLabel) subLabel.textContent = isToday ? "Menampilkan data hari ini" : "Menampilkan data riwayat";
  if ($("#home-queue-heading")) $("#home-queue-heading").textContent = isToday ? "Antrian terbaru hari ini" : "Antrian pada tanggal terpilih";
  if ($("#home-queue-description")) $("#home-queue-description").textContent = `${dailyQueues.length} antrian tercatat pada ${dateLabel}.`;

  if ($("#home-queue-body")) {
    $("#home-queue-body").innerHTML =
      dailyQueues
        .slice(0, 5)
        .map(
          q => `
      <tr>
        <td><strong>${escapeHTML(q.number)}</strong></td>
        <td><div class="patient-cell"><div class="patient-avatar">${escapeHTML(initials(q.name))}</div><strong>${escapeHTML(q.name)}</strong></div></td>
        <td>${escapeHTML(q.doctor)}</td>
        <td>${escapeHTML(q.time || "—")}</td>
        <td>${statusBadge(q.status)}</td>
      </tr>`
        )
        .join("") || '<tr><td colspan="5" class="empty-cell">Tidak ada data pasien atau antrian pada tanggal ini.</td></tr>';
  }

  if ($("#home-medicine-list")) {
    $("#home-medicine-list").innerHTML =
      medicines
        .slice(0, 3)
        .map(
          m => `
      <div class="medicine-item">
        ${medicineImg(m)}
        <div><strong>${escapeHTML(m.name)}</strong><small>${escapeHTML(m.category)}</small></div>
        <span class="stock">${Number(m.stock)} unit</span>
      </div>`
        )
        .join("") || '<p class="muted">Belum ada data obat.</p>';
  }

  if ($("#stat-patients")) $("#stat-patients").textContent = getUniquePatientsForDate(selectedDashboardDate, dailyQueues);
  if ($("#stat-queue")) $("#stat-queue").textContent = dailyQueues.length;
  if ($("#stat-waiting")) $("#stat-waiting").textContent = `${dailyQueues.filter(q => q.status === "Menunggu").length} pasien`;
  if ($("#stat-medicine")) $("#stat-medicine").textContent = medicines.length;
}

function renderMedicines() {
  const term = $("#medicine-search").value.toLowerCase();
  const filtered = medicines.filter(m => `${m.name} ${m.category} ${m.form} ${m.description || ""}`.toLowerCase().includes(term));
  $("#medicine-table-body").innerHTML = filtered.length
    ? filtered
        .map(
          m => `
      <tr>
        <td>
          <div class="patient-cell">
            ${medicineImg(m)}
            <div><strong>${escapeHTML(m.name)}</strong><div class="muted">${escapeHTML(m.description || "Belum ada deskripsi")}</div></div>
          </div>
        </td>
        <td>${escapeHTML(m.category)}</td>
        <td>${escapeHTML(m.form)}</td>
        <td><strong>${Number(m.stock)}</strong> unit</td>
        <td>${m.stock < 20 ? '<span class="status waiting">Stok rendah</span>' : '<span class="status done">Tersedia</span>'}</td>
        <td>
          <div class="action-group">
            <button class="row-action" data-edit-medicine="${m.id}">Edit</button>
            <button class="row-action danger" data-delete-medicine="${m.id}">Hapus</button>
          </div>
        </td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="empty-cell">Data obat tidak ditemukan.</td></tr>';
  $("#medicine-total").textContent = medicines.length;

  $$("[data-edit-medicine]").forEach(button =>
    button.addEventListener("click", () => {
      const m = medicines.find(item => item.id === Number(button.dataset.editMedicine));
      if (!m) return;
      const previewHTML = m.image
        ? `<div id="medicine-image-preview" class="image-preview"><img src="${m.image}" /><button type="button" class="remove-preview">×</button></div>`
        : `<div id="medicine-image-preview" class="image-preview hidden"><img /><button type="button" class="remove-preview">×</button></div>`;

      openModal(
        "Edit Obat",
        `<label>Gambar obat</label>
        <div class="image-upload-area" id="medicine-upload-area">
          <span>${m.image ? "Klik untuk ganti gambar" : "Klik atau seret gambar ke sini"}</span>
          <input name="image" type="file" accept="image/*" class="file-input" />
        </div>
        ${previewHTML}
        <label>Nama obat</label>
        <input value="${escapeHTML(m.name)}" disabled />
        <label>Stok saat ini</label>
        <input name="stock" type="number" min="0" value="${Number(m.stock)}" required />
        <label>Deskripsi / Kegunaan</label>
        <textarea name="description" rows="3">${escapeHTML(m.description || "")}</textarea>
        <label>Dosis</label>
        <textarea name="dosage" rows="3">${escapeHTML(m.dosage || "")}</textarea>
        <label>Efek Samping</label>
        <textarea name="sideEffects" rows="3">${escapeHTML(m.sideEffects || "")}</textarea>
        <input type="hidden" name="keepOldImage" value="${m.image ? "1" : ""}" />`,
        async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          const file = form.querySelector('input[name="image"]').files[0];
          let image = m.image;
          if (file) {
            image = await readFileAsDataURL(file);
          } else if (!data.keepOldImage) {
            image = "";
          }
          await api(`/api/medicines/${m.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              stock: Number(data.stock),
              image,
              description: (data.description || "").trim(),
              dosage: (data.dosage || "").trim(),
              sideEffects: (data.sideEffects || "").trim()
            })
          });
          await refreshData();
          renderMedicines();
          renderHome();
          toast("Data obat berhasil diperbarui");
        }
      );
      initImageUpload();
    })
  );

  $$("[data-delete-medicine]").forEach(button =>
    button.addEventListener("click", async () => {
      if (!confirm("Hapus data obat ini?")) return;
      const id = Number(button.dataset.deleteMedicine);
      try {
        await api(`/api/medicines/${id}`, { method: 'DELETE' });
        await refreshData();
        renderMedicines();
        renderHome();
        toast("Data obat dihapus");
      } catch (err) {
        toast(err.message);
      }
    })
  );
}

function renderQueues() {
  const term = $("#queue-search").value.toLowerCase();
  const filter = $("#queue-filter").value;
  const filtered = queues.filter(
    q => `${q.name} ${q.number} ${q.doctor} ${q.clinic}`.toLowerCase().includes(term) && (filter === "Semua" || q.status === filter)
  );

  $("#queue-table-body").innerHTML = filtered.length
    ? filtered
        .map(
          q => `
      <tr>
        <td><strong>${escapeHTML(q.number)}</strong></td>
        <td><div class="patient-cell"><div class="patient-avatar">${escapeHTML(initials(q.name))}</div><strong>${escapeHTML(q.name)}</strong></div></td>
        <td><strong>${escapeHTML(q.clinic)}</strong><div class="muted">${escapeHTML(q.doctor)}</div></td>
        <td>${escapeHTML(q.time)}</td>
        <td>${statusBadge(q.status)}</td>
        <td>${
          q.status !== "Selesai"
            ? `<button class="row-action" data-next-status="${q.id}">${q.status === "Menunggu" ? "Periksa" : "Selesaikan"}</button>`
            : '<span class="muted">—</span>'
        }</td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="empty-cell">Antrian tidak ditemukan.</td></tr>';

  $("#waiting-count").textContent = queues.filter(q => q.status === "Menunggu").length;
  $("#process-count").textContent = queues.filter(q => q.status === "Diperiksa").length;
  $("#done-count").textContent = queues.filter(q => q.status === "Selesai").length;

  $$("[data-next-status]").forEach(button =>
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.nextStatus);
      const q = queues.find(item => item.id === id);
      if (!q) return;
      const nextStatus = q.status === "Menunggu" ? "Diperiksa" : "Selesai";
      try {
        await api(`/api/queues/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        await refreshData();
        renderQueues();
        renderHome();
        toast("Status antrian diperbarui");
      } catch (err) {
        toast(err.message);
      }
    })
  );
}

function renderPatientQueues() {
  if (!currentUser) return;
  const ownQueues = queues.filter(q => q.patientEmail && q.patientEmail.toLowerCase() === currentUser.email.toLowerCase());
  $("#patient-welcome").textContent = `Halo, ${currentUser.name}!`;
  $("#patient-queue-body").innerHTML = ownQueues.length
    ? ownQueues
        .map(
          q => `
      <tr>
        <td><strong>${escapeHTML(q.number)}</strong></td>
        <td>${escapeHTML(q.clinic)}</td>
        <td>${escapeHTML(q.doctor)}</td>
        <td>${escapeHTML(q.time)}</td>
        <td>${statusBadge(q.status)}</td>
        <td>${q.status === "Menunggu" ? `<button class="row-action danger" onclick="cancelQueue(${q.id})">Batalkan</button>` : '<span class="muted">—</span>'}</td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="empty-cell">Kamu belum memiliki antrian. Tekan “Daftar Antrian” untuk membuat antrian.</td></tr>';
}

async function cancelQueue(id) {
  if (!confirm('Batalkan pendaftaran antrian ini?')) return;
  try {
    await api(`/api/queues/${id}`, { method: 'DELETE' });
    await refreshData();
    renderPatientQueues();
    renderQueues();
    renderHome();
    toast('Antrian berhasil dibatalkan');
  } catch (err) {
    toast(err.message);
  }
}
window.cancelQueue = cancelQueue;

function renderSchedules() {
  const isAdmin = currentUser?.role === "admin";
  $("#add-schedule-btn").classList.toggle("hidden", !isAdmin);
  $("#jadwal-admin-table").classList.toggle("hidden", !isAdmin);
  $("#jadwal-patient-grid").classList.toggle("hidden", isAdmin);

  if (isAdmin) {
    $("#jadwal-subtitle").textContent = "Lihat dan kelola jadwal praktek dokter klinik.";
    $("#jadwal-list-desc").textContent = "Admin dapat menambah, mengedit, atau menghapus jadwal dokter.";
    $("#admin-jadwal-body").innerHTML = schedules.length
      ? schedules.map(s => `
        <tr>
          <td><strong>${escapeHTML(s.doctor_name)}</strong></td>
          <td>${escapeHTML(s.clinic)}</td>
          <td>${escapeHTML(s.day)}</td>
          <td>${escapeHTML(s.start_time)} - ${escapeHTML(s.end_time)}</td>
          <td>${s.is_active ? '<span class="status done">Aktif</span>' : '<span class="status waiting">Nonaktif</span>'}</td>
          <td>
            <div class="action-group">
              <button class="row-action" data-edit-schedule="${s.id}">Edit</button>
              <button class="row-action danger" data-delete-schedule="${s.id}">Hapus</button>
            </div>
          </td>
        </tr>
      `).join("")
      : '<tr><td colspan="6" class="empty-cell">Belum ada data jadwal dokter.</td></tr>';

    $$("[data-edit-schedule]").forEach(btn => {
      btn.addEventListener("click", () => {
        const s = schedules.find(item => item.id === Number(btn.dataset.editSchedule));
        if (!s) return;
        openModal(
          "Edit Jadwal Dokter",
          `<label>Nama Dokter</label>
           <input name="doctor_name" value="${escapeHTML(s.doctor_name)}" required />
           <label>Poli</label>
           <input name="clinic" value="${escapeHTML(s.clinic)}" required />
           <div class="form-row">
             <div>
               <label>Hari</label>
               <select name="day">
                 ${['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d => `<option ${s.day === d ? 'selected' : ''}>${d}</option>`).join("")}
               </select>
             </div>
             <div>
               <label>Status</label>
               <select name="is_active">
                 <option value="1" ${s.is_active ? 'selected' : ''}>Aktif</option>
                 <option value="0" ${!s.is_active ? 'selected' : ''}>Nonaktif</option>
               </select>
             </div>
           </div>
           <div class="form-row">
             <div>
               <label>Jam Mulai</label>
               <input name="start_time" type="time" value="${escapeHTML(s.start_time)}" required />
             </div>
             <div>
               <label>Jam Selesai</label>
               <input name="end_time" type="time" value="${escapeHTML(s.end_time)}" required />
             </div>
           </div>`,
          async form => {
            const data = Object.fromEntries(new FormData(form).entries());
            await api(`/api/doctor-schedules/${s.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                doctor_name: data.doctor_name.trim(),
                clinic: data.clinic.trim(),
                day: data.day,
                start_time: data.start_time,
                end_time: data.end_time,
                is_active: Number(data.is_active)
              })
            });
            await refreshData();
            renderSchedules();
            toast("Jadwal dokter berhasil diperbarui");
          }
        );
      });
    });

    $$("[data-delete-schedule]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus jadwal ini?")) return;
        const id = Number(btn.dataset.deleteSchedule);
        try {
          await api(`/api/doctor-schedules/${id}`, { method: 'DELETE' });
          await refreshData();
          renderSchedules();
          toast("Jadwal dokter dihapus");
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } else {
    $("#jadwal-subtitle").textContent = "Daftar jadwal praktek dokter yang tersedia di Klinik Polinela.";
    $("#jadwal-list-desc").textContent = "Silakan datang sesuai hari dan jam praktek dokter.";
    const activeSchedules = schedules.filter(s => s.is_active);
    $("#jadwal-patient-grid").innerHTML = activeSchedules.length
      ? activeSchedules.map(s => `
        <div class="info-obat-card">
          <div class="info-obat-header">
            <div class="patient-avatar" style="width:40px;height:40px;font-size:12px;">DR</div>
            <div>
              <strong>${escapeHTML(s.doctor_name)}</strong>
              <small>${escapeHTML(s.clinic)}</small>
            </div>
            <span class="status done">Aktif</span>
          </div>
          <div style="font-size:11px; margin-top:8px; line-height: 1.6; color: var(--muted);">
            <div><span style="color: var(--teal); font-weight: 700;">HARI</span> ${escapeHTML(s.day).toUpperCase()}</div>
            <div><span style="color: var(--teal); font-weight: 700;">JAM</span> ${escapeHTML(s.start_time)} - ${escapeHTML(s.end_time)}</div>
          </div>
        </div>
      `).join("")
      : '<p class="muted" style="padding:1.5rem;text-align:center">Tidak ada jadwal dokter aktif saat ini.</p>';
  }
}

$("#add-schedule-btn").addEventListener("click", () => {
  if (currentUser?.role !== "admin") return;
  openModal(
    "Tambah Jadwal Dokter",
    `<label>Nama Dokter</label>
     <input name="doctor_name" placeholder="Contoh: dr. Dian" required />
     <label>Poli</label>
     <input name="clinic" value="Poli Umum" required />
     <div class="form-row">
       <div>
         <label>Hari</label>
         <select name="day">
           <option>Senin</option>
           <option>Selasa</option>
           <option>Rabu</option>
           <option>Kamis</option>
           <option>Jumat</option>
           <option>Sabtu</option>
           <option>Minggu</option>
         </select>
       </div>
       <div>
         <label>Status</label>
         <select name="is_active">
           <option value="1">Aktif</option>
           <option value="0">Nonaktif</option>
         </select>
       </div>
     </div>
     <div class="form-row">
       <div>
         <label>Jam Mulai</label>
         <input name="start_time" type="time" value="08:00" required />
       </div>
       <div>
         <label>Jam Selesai</label>
         <input name="end_time" type="time" value="14:00" required />
       </div>
     </div>`,
    async form => {
      const data = Object.fromEntries(new FormData(form).entries());
      await api('/api/doctor-schedules', {
        method: 'POST',
        body: JSON.stringify({
          doctor_name: data.doctor_name.trim(),
          clinic: data.clinic.trim(),
          day: data.day,
          start_time: data.start_time,
          end_time: data.end_time,
          is_active: Number(data.is_active)
        })
      });
      await refreshData();
      renderSchedules();
      toast("Jadwal dokter berhasil ditambahkan");
    }
  );
});

function renderInfoObat() {
  const searchEl = $("#info-obat-search");
  if (!searchEl) return;
  const term = searchEl.value.toLowerCase();
  const filtered = medicines.filter(m => `${m.name} ${m.category} ${m.form} ${m.description || ""}`.toLowerCase().includes(term));
  $("#info-obat-list").innerHTML = filtered.length
    ? filtered
        .map(
          m => `
      <div class="info-obat-card" onclick="openMedicineDetail(${m.id})">
        ${m.image ? `<div class="info-obat-img"><img src="${m.image}" alt="${escapeHTML(m.name)}" /></div>` : ""}
        <div class="info-obat-header">
          ${medicineImg(m)}
          <div><strong>${escapeHTML(m.name)}</strong><small>${escapeHTML(m.category)} · ${escapeHTML(m.form)}</small></div>
          <span class="stock">${Number(m.stock) < 20 ? '<span class="status waiting">Stok rendah</span>' : '<span class="status done">Tersedia</span>'}</span>
        </div>
        <p class="info-obat-desc">${escapeHTML(m.description || "Deskripsi belum tersedia.")}</p>
      </div>`
        )
        .join("")
    : '<p class="muted" style="padding:1.5rem;text-align:center">Obat tidak ditemukan.</p>';
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  $$('.cart-count').forEach(el => el.textContent = count);
  if ($('#cart-count')) $('#cart-count').textContent = count;
}

function addToCart(id, quantity = 1) {
  const medicine = medicines.find(item => Number(item.id) === Number(id));
  quantity = Number(quantity);
  if (!medicine || Number(medicine.stock) < 1) return toast('Obat sedang tidak tersedia');
  if (!Number.isInteger(quantity) || quantity < 1) return toast('Jumlah tidak valid');
  const item = cart.find(entry => Number(entry.id) === Number(id));
  if (item) {
    if (item.quantity + quantity > Number(medicine.stock)) return toast('Jumlah melebihi stok obat');
    item.quantity += quantity;
  } else {
    if (quantity > Number(medicine.stock)) return toast('Jumlah melebihi stok obat');
    cart.push({ id: Number(id), quantity });
  }
  updateCartCount();
  toast(`${medicine.name} ditambahkan ke keranjang`);
}

function openCart() {
  const rows = cart.map(item => {
    const medicine = medicines.find(m => Number(m.id) === Number(item.id));
    return medicine ? `<div class="cart-row"><strong>${escapeHTML(medicine.name)}</strong><span>${item.quantity} unit</span><button type="button" class="row-action danger" onclick="removeFromCart(${item.id})">Hapus</button></div>` : '';
  }).join('') || '<p class="muted">Keranjang masih kosong.</p>';
  const confirmBtn = cart.length
    ? `<div class="cart-confirm-wrap" style="margin-top:12px;"><button type="button" id="confirm-cart-btn" class="btn primary full" onclick="confirmCart()">✓ Konfirmasi &amp; Ambil Obat</button></div>`
    : '';
  openModal('Keranjang Obat', `<div class="cart-list">${rows}</div>${confirmBtn}`, () => {}, { actions: false });
}

function removeFromCart(id) {
  cart = cart.filter(item => Number(item.id) !== Number(id));
  updateCartCount();
  openCart();
}

async function confirmCart() {
  if (!cart.length) return toast('Keranjang kosong');
  const btn = $('#confirm-cart-btn');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Memproses...';
  }
  const now = new Date();
  const kode = 'RX-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const nama = currentUser ? currentUser.name : 'Pasien';
  const tanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const items = cart.map(item => {
    const m = medicines.find(x => Number(x.id) === Number(item.id));
    return m ? { id: m.id, name: m.name, qty: item.quantity } : null;
  }).filter(Boolean);

  if (!items.length) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Konfirmasi & Ambil Obat'; }
    return toast('Keranjang tidak valid atau obat tidak ditemukan');
  }

  const tableRows = items.map((it, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHTML(it.name)}</td><td class="center">${it.qty}</td></tr>`
  ).join('');

  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        id: kode,
        userId: currentUser ? Number(currentUser.id) || 0 : 0,
        name: nama,
        items,
        status: 'Menunggu Pengambilan',
        date: now.toISOString()
      })
    });

    cart = [];
    updateCartCount();
    await refreshData();
    await loadOrders();
    renderOrderHistory();
    renderInfoObat();
    renderMedicines();
    renderHome();

    const struk = `
    <div class="struk" id="struk-content" data-filename="struk-${kode}">
      <div class="struk-header">
        <strong>KLINIK POLINELA</strong>
        <small>Struk Pengambilan Obat</small>
      </div>
      <div class="struk-meta">
        <div><small>No. Resep</small><strong>${kode}</strong></div>
        <div><small>Pasien</small><strong>${escapeHTML(nama)}</strong></div>
        <div><small>Tanggal</small><strong>${tanggal}, ${jam}</strong></div>
      </div>
      <table class="struk-table">
        <thead><tr><th>No</th><th>Nama Obat</th><th class="center">Jumlah</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="struk-footer">
        <p>Tunjukkan struk ini di loket farmasi klinik untuk pengambilan obat.</p>
        <small class="muted">Berlaku pada hari yang sama.</small>
      </div>
      <div style="margin-top:12px;"><button type="button" class="btn primary full" onclick="printStruk()">🖨 Cetak Struk</button></div>
    </div>`;
    openModal('Struk Pengambilan Obat', struk, () => {}, { actions: false });
    toast('Pesanan dikonfirmasi! Silakan ambil obat di klinik.');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Konfirmasi & Ambil Obat'; }
    toast(err.message || 'Gagal membuat pesanan');
  }
}

function printStruk() {
  const content = document.getElementById('struk-content');
  if (!content) return;
  const filename = content.dataset.filename || 'struk-pengambilan-obat';

  if (window.html2pdf) {
    const clone = content.cloneNode(true);
    clone.querySelectorAll('button').forEach(b => b.remove());
    html2pdf().set({
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
    }).from(clone).save();
    toast('Mengunduh struk PDF...');
    return;
  }

  const w = window.open('', '_blank', 'width=400,height=600');
  if (w) {
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Struk Pengambilan Obat</title><style>
      body{font-family:sans-serif;padding:20px;max-width:350px;margin:auto;color:#1e293b}
      .struk-header{text-align:center;margin-bottom:12px;border-bottom:2px dashed #94a3b8;padding-bottom:10px}
      .struk-header strong{display:block;font-size:16px}
      .struk-header small{color:#64748b}
      .struk-meta{margin-bottom:12px;font-size:13px;display:flex;flex-direction:column;gap:4px}
      .struk-meta div{display:flex;justify-content:space-between}
      .struk-meta small{color:#64748b}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
      th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #e2e8f0}
      .center{text-align:center}
      .struk-footer{text-align:center;border-top:2px dashed #94a3b8;padding-top:10px;font-size:12px;color:#64748b}
      @media print{button{display:none}}
    </style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  } else {
    window.print();
  }
}

async function loadOrders() {
  try {
    orders = await api('/api/orders');
  } catch (_) {
    const data = readStore();
    orders = data.orders || [];
  }
}

async function renderOrderHistory() {
  const container = $('#order-history-list');
  if (!container) return;
  await loadOrders();
  const userId = currentUser ? Number(currentUser.id) || 0 : 0;
  const userOrders = orders.filter(o => (Number(o.userId) || 0) === userId).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!userOrders.length) {
    container.innerHTML = '<p class="muted" style="padding:1.5rem;text-align:center">Belum ada pesanan obat.</p>';
    return;
  }
  container.innerHTML = `<table class="order-table"><thead><tr><th>No. Resep</th><th>Tanggal</th><th>Obat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${userOrders.map(o => {
    const d = new Date(o.date);
    const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const items = Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]');
    const obatList = items.map(it => `${it.name} (${it.qty})`).join(', ');
    const statusClass = o.status === 'Selesai' ? 'done' : o.status === 'Dibatalkan' ? 'danger' : 'waiting';
    return `<tr>
      <td><strong>${escapeHTML(o.id)}</strong></td>
      <td>${tgl}, ${jam}</td>
      <td>${escapeHTML(obatList)}</td>
      <td><span class="status ${statusClass}">${escapeHTML(o.status)}</span></td>
      <td class="order-actions">
        <button type="button" class="row-action" onclick="viewOrderStruk('${escapeHTML(o.id)}')">Lihat Struk</button>
        ${o.status === 'Menunggu Pengambilan' ? `<button type="button" class="row-action danger" onclick="cancelOrder('${escapeHTML(o.id)}')">Batalkan</button>` : ''}
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function viewOrderStruk(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const d = new Date(o.date);
  const tanggal = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const items = Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]');
  const tableRows = items.map((it, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHTML(it.name)}</td><td class="center">${it.qty}</td></tr>`
  ).join('');
  const statusClass = o.status === 'Selesai' ? 'done' : o.status === 'Dibatalkan' ? 'danger' : 'waiting';
  const struk = `
    <div class="struk" id="struk-content" data-filename="struk-${o.id}">
      <div class="struk-header">
        <strong>KLINIK POLINELA</strong>
        <small>Struk Pengambilan Obat</small>
      </div>
      <div class="struk-meta">
        <div><small>No. Resep</small><strong>${escapeHTML(o.id)}</strong></div>
        <div><small>Pasien</small><strong>${escapeHTML(o.name)}</strong></div>
        <div><small>Tanggal</small><strong>${tanggal}, ${jam}</strong></div>
        <div><small>Status</small><span class="status ${statusClass}">${escapeHTML(o.status)}</span></div>
      </div>
      <table class="struk-table">
        <thead><tr><th>No</th><th>Nama Obat</th><th class="center">Jumlah</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="struk-footer">
        <p>Tunjukkan struk ini di loket farmasi klinik untuk pengambilan obat.</p>
        <small class="muted">Berlaku pada hari yang sama.</small>
      </div>
      <div style="margin-top:12px;"><button type="button" class="btn primary full" onclick="printStruk()">🖨 Cetak Struk</button></div>
    </div>`;
  openModal('Struk Pengambilan Obat', struk, () => {}, { actions: false });
}

async function cancelOrder(orderId) {
  if (!confirm('Batalkan pesanan obat ini?')) return;
  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Dibatalkan' })
    });
    await refreshData();
    await loadOrders();
    renderOrderHistory();
    renderInfoObat();
    renderMedicines();
    renderHome();
    toast('Pesanan berhasil dibatalkan');
  } catch (err) {
    toast(err.message || 'Gagal membatalkan pesanan');
  }
}

async function renderAdminOrders() {
  const tbody = $('#admin-order-table-body');
  if (!tbody) return;
  await loadOrders();
  const term = ($('#order-search') ? $('#order-search').value : '').toLowerCase();
  const filtered = orders.filter(o => `${o.id} ${o.name}`.toLowerCase().includes(term))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Belum ada pesanan obat dari pasien.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(o => {
    const d = new Date(o.date);
    const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const items = Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]');
    const obatList = items.map(it => `${it.name} (${it.qty})`).join(', ');
    const statusClass = o.status === 'Selesai' ? 'done' : o.status === 'Dibatalkan' ? 'danger' : 'waiting';
    const actions = o.status === 'Menunggu Pengambilan'
      ? `<button type="button" class="row-action" onclick="adminCompleteOrder('${escapeHTML(o.id)}')">Selesai</button>
         <button type="button" class="row-action danger" onclick="adminCancelOrder('${escapeHTML(o.id)}')">Tolak</button>`
      : '';
    return `<tr>
      <td><strong>${escapeHTML(o.id)}</strong></td>
      <td>${escapeHTML(o.name)}</td>
      <td>${tgl}, ${jam}</td>
      <td>${escapeHTML(obatList)}</td>
      <td><span class="status ${statusClass}">${escapeHTML(o.status)}</span></td>
      <td class="order-actions">${actions}</td>
    </tr>`;
  }).join('');
}

async function adminCompleteOrder(orderId) {
  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Selesai' })
    });
    await loadOrders();
    renderAdminOrders();
    toast('Pesanan ditandai selesai');
  } catch (err) {
    toast(err.message || 'Gagal menyelesaikan pesanan');
  }
}

async function adminCancelOrder(orderId) {
  if (!confirm('Tolak pesanan obat ini?')) return;
  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Dibatalkan' })
    });
    await refreshData();
    await loadOrders();
    renderAdminOrders();
    renderInfoObat();
    renderMedicines();
    renderHome();
    toast('Pesanan ditolak');
  } catch (err) {
    toast(err.message || 'Gagal menolak pesanan');
  }
}

window.adminCompleteOrder = adminCompleteOrder;
window.adminCancelOrder = adminCancelOrder;

function openMedicineDetail(id) {
  const m = medicines.find(x => Number(x.id) === Number(id));
  if (!m) return;
  openModal(
    `Detail ${escapeHTML(m.name)}`,
    `<div class="medicine-detail">
      ${m.image ? `<div class="info-obat-img"><img src="${m.image}" alt="${escapeHTML(m.name)}" /></div>` : ""}
      <div><strong>Nama:</strong> ${escapeHTML(m.name)}</div>
      <div><strong>Kategori:</strong> ${escapeHTML(m.category)} · <strong>Bentuk:</strong> ${escapeHTML(m.form)}</div>
      <div><strong>Stok:</strong> ${Number(m.stock)} unit</div>
      <div><strong>Kegunaan:</strong> ${escapeHTML(m.description || "-")}</div>
      <div><strong>Dosis:</strong> ${escapeHTML(m.dosage || "-")}</div>
      <div><strong>Efek Samping:</strong> ${escapeHTML(m.sideEffects || "-")}</div>
      <div class="cart-detail-actions" style="display:flex;gap:8px;align-items:center;margin-top:12px;">
        <label for="detail-cart-quantity">Jumlah</label>
        <input id="detail-cart-quantity" type="number" min="1" max="${Math.max(1, Number(m.stock))}" value="1" ${Number(m.stock) < 1 ? "disabled" : ""} style="width:70px;" />
        <button type="button" class="btn primary" onclick="addToCart(${m.id}, Number(document.getElementById('detail-cart-quantity').value)); closeModal();" ${Number(m.stock) < 1 ? "disabled" : ""}>＋ Tambah ke Keranjang</button>
      </div>
    </div>`,
    () => {},
    { actions: false }
  );
}

window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.openCart = openCart;
window.confirmCart = confirmCart;
window.printStruk = printStruk;
window.viewOrderStruk = viewOrderStruk;
window.cancelOrder = cancelOrder;
window.openMedicineDetail = openMedicineDetail;
window.closeModal = closeModal;

function readFileAsDataURL(file) {
  return new Promise(resolve => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function medicineImg(m) {
  return m.image ? `<img src="${m.image}" class="medicine-thumb" alt="${escapeHTML(m.name)}" />` : '<div class="medicine-symbol">✚</div>';
}

function initImageUpload() {
  const area = $("#medicine-upload-area");
  if (!area) return;
  const input = area.querySelector('input[type="file"]');
  const preview = $("#medicine-image-preview");

  function showPreview(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    preview.querySelector("img").src = url;
    preview.classList.remove("hidden");
    area.querySelector("span").textContent = "Klik untuk ganti gambar";
  }

  input.addEventListener("change", () => {
    if (input.files[0]) showPreview(input.files[0]);
  });
  area.addEventListener("dragover", e => {
    e.preventDefault();
    area.classList.add("drag-over");
  });
  area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
  area.addEventListener("drop", e => {
    e.preventDefault();
    area.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) {
      input.files = e.dataTransfer.files;
      showPreview(e.dataTransfer.files[0]);
    }
  });
  if (preview) {
    preview.querySelector(".remove-preview")?.addEventListener("click", () => {
      preview.classList.add("hidden");
      preview.querySelector("img").src = "";
      input.value = "";
      area.querySelector("span").textContent = "Klik atau seret gambar ke sini";
      const keepOld = $('input[name="keepOldImage"]');
      if (keepOld) keepOld.value = "";
    });
  }
}

function openModal(title, fields, onSave, { actions = true } = {}) {
  $("#modal-title").textContent = title;
  $("#modal-form").innerHTML =
    fields + (actions ? '<div class="modal-actions"><button type="button" class="btn outline" id="cancel-modal">Batal</button><button type="submit" class="btn primary">Simpan</button></div>' : '');
  $("#modal-backdrop").classList.remove("hidden");
  if (actions) $("#cancel-modal").addEventListener("click", closeModal);
  $("#modal-form").onsubmit = async event => {
    event.preventDefault();
    if (!actions) return;
    try {
      await onSave(event.currentTarget);
      closeModal();
    } catch (err) {
      console.error("Gagal menyimpan form:", err);
      toast(err.message || "Gagal menyimpan data");
    }
  };
}

function closeModal() {
  $("#modal-backdrop").classList.add("hidden");
}

$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", event => {
  if (event.target.id === "modal-backdrop") closeModal();
});

$("#add-medicine-btn").addEventListener("click", () => {
  if (currentUser?.role !== "admin") return;
  openModal(
    "Tambah Obat",
    `<label>Gambar obat</label>
    <div class="image-upload-area" id="medicine-upload-area">
      <span>Klik atau seret gambar ke sini</span>
      <input name="image" type="file" accept="image/*" class="file-input" />
    </div>
    <div id="medicine-image-preview" class="image-preview hidden">
      <img /><button type="button" class="remove-preview">×</button>
    </div>
    <label>Nama obat</label>
    <input name="name" placeholder="Contoh: Ibuprofen 200 mg" required />
    <div class="form-row">
      <div>
        <label>Kategori</label>
        <input name="category" placeholder="Kategori obat" required />
      </div>
      <div>
        <label>Bentuk</label>
        <select name="form">
          <option>Tablet</option>
          <option>Kapsul</option>
          <option>Sirup</option>
          <option>Serbuk</option>
          <option>Salep</option>
          <option>Cairan</option>
        </select>
      </div>
    </div>
    <label>Jumlah stok (unit)</label>
    <input name="stock" type="number" min="0" placeholder="0" required />
    <label>Deskripsi / Kegunaan</label>
    <textarea name="description" rows="3" placeholder="Jelaskan kegunaan dan indikasi obat..."></textarea>
    <label>Dosis</label>
    <textarea name="dosage" rows="3" placeholder="Contoh: Dewasa: 1 tablet 3 kali sehari setelah makan"></textarea>
    <label>Efek Samping</label>
    <textarea name="sideEffects" rows="3" placeholder="Contoh: Kantuk, mual, pusing..."></textarea>`,
    async form => {
      const data = Object.fromEntries(new FormData(form).entries());
      const file = form.querySelector('input[name="image"]').files[0];
      const image = await readFileAsDataURL(file);
      await api('/api/medicines', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name.trim(),
          category: data.category.trim(),
          form: data.form,
          stock: Number(data.stock),
          description: (data.description || "").trim(),
          dosage: (data.dosage || "").trim(),
          sideEffects: (data.sideEffects || "").trim(),
          image
        })
      });
      await refreshData();
      renderMedicines();
      renderHome();
      toast("Data obat berhasil ditambahkan");
    }
  );
  initImageUpload();
});

function createQueueForm(patientMode) {
  const patientField = patientMode
    ? `<label>Nama pasien</label><input value="${escapeHTML(currentUser.name)}" disabled /><input type="hidden" name="name" value="${escapeHTML(currentUser.name)}" />`
    : '<label>Nama pasien</label><input name="name" placeholder="Nama lengkap pasien" required />';
  const visitDateField = patientMode
    ? ""
    : `<label>Tanggal kunjungan</label><input name="visitDate" type="date" value="${localDateKey(new Date())}" max="${localDateKey(new Date())}" required />`;
  const complaintField = `<label>Keluhan</label><textarea name="complaint" rows="3" placeholder="Contoh: demam, sakit kepala, batuk..." required></textarea>`;

  // patient mode: only name (prefilled) and complaint
  const extraFields = patientMode
    ? ""
    : `<div class="form-row">
      <div>
        <label>Poli</label>
        <select name="clinic"><option>Poli Umum</option></select>
      </div>
      <div>
        <label>Dokter</label>
        <select name="doctor"><option>dr. Dian</option><option>dr. Tya</option></select>
      </div>
    </div>`;

  openModal(
    patientMode ? "Daftar Antrian Pemeriksaan" : "Tambah Pasien / Antrian",
    `${patientField}${visitDateField}${complaintField}${extraFields}`,
    async form => {
      const data = Object.fromEntries(new FormData(form).entries());
      const now = new Date();
      const visitDate = patientMode ? localDateKey(now) : (data.visitDate || localDateKey(now));
      
      // ponytail: reset nomor antrian harian (berdasarkan tanggal kunjungan)
      const dailyQueues = queues.filter(q => q.date === visitDate);
      const maxNumber = dailyQueues.reduce((max, q) => Math.max(max, Number(String(q.number).split("-")[1]) || 0), 0) + 1;
      
      const patientName = (patientMode ? currentUser.name : (data.name || "")).trim();

      await api('/api/queues', {
        method: 'POST',
        body: JSON.stringify({
          number: `A-${String(maxNumber).padStart(3, "0")}`,
          name: patientName,
          doctor: patientMode ? "dr. Dian" : data.doctor,
          clinic: patientMode ? "Poli Umum" : data.clinic,
          time: now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          date: visitDate,
          createdAt: now.toISOString(),
          status: "Menunggu",
          patientEmail: patientMode ? currentUser.email : "",
          complaint: (data.complaint || "").trim()
        })
      });

      selectedDashboardDate = visitDate;
      if ($("#dashboard-date")) $("#dashboard-date").value = selectedDashboardDate;
      await refreshData();
      renderQueues();
      renderHome();
      if (patientMode) renderPatientQueues();
      toast("Antrian berhasil didaftarkan");
    }
  );
}

$("#add-queue-btn").addEventListener("click", () => {
  if (currentUser?.role === "admin") createQueueForm(false);
});
$("#patient-add-queue-btn").addEventListener("click", () => {
  if (currentUser && currentUser.role !== "admin") createQueueForm(true);
});

$("#medicine-search").addEventListener("input", renderMedicines);
$("#order-search").addEventListener("input", renderAdminOrders);
$("#info-obat-search").addEventListener("input", renderInfoObat);
$("#queue-search").addEventListener("input", renderQueues);
$("#queue-filter").addEventListener("change", renderQueues);

// =====================================
// EDIT DAN SIMPAN PROFIL
// =====================================

let selectedProfilePhoto = null;


// GANTI FOTO PROFIL
$("#profile-photo").addEventListener("change", async event => {
    const file = event.target.files[0];

    selectedProfilePhoto = null;

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        toast("File harus berupa gambar!");
        event.target.value = "";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        toast("Ukuran foto maksimal 2 MB!");
        event.target.value = "";
        return;
    }

    selectedProfilePhoto = await readFileAsDataURL(file);

    renderAvatar(
        $("#profile-avatar"),
        $("#profile-name").value,
        selectedProfilePhoto
    );
});


// SIMPAN PROFIL
$("#profile-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) return;

    const name = $("#profile-name").value.trim();
    const email = $("#profile-email").value.trim().toLowerCase();
    const phone = $("#profile-phone").value.trim();
    const age = $("#profile-age").value
        ? Number($("#profile-age").value)
        : "";
    const status = $("#profile-status").value;
    const bio = $("#profile-bio").value.trim();

    const photo = selectedProfilePhoto ??
        currentUser.photo ?? "";

    if (!name || !email) {
        toast("Nama dan email wajib diisi!");
        return;
    }

    try {
        const updatedUser = await api(
            `/api/users/${currentUser.id}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    name,
                    email,
                    phone,
                    age,
                    status,
                    bio,
                    photo
                })
            }
        );

        currentUser = {
            ...currentUser,
            ...updatedUser
        };

        selectedProfilePhoto = null;

        $("#top-user-name").textContent = name;
        $("#profile-heading-name").textContent = name;
        $("#profile-email-preview").textContent = email;

        $("#profile-status-preview").textContent =
            formatProfileStatus(status);

        renderAvatar($(".avatar"), name, photo);
        renderAvatar($("#profile-avatar"), name, photo);

        if (currentUser.role === "patient") {
            $("#patient-welcome").textContent = `Halo, ${name}!`;
            renderPatientQueues();
        }

        toast("Profil berhasil diperbarui!");

    } catch (err) {
        toast(err.message);
    }
});

// TOMBOL BATAL
$("#profile-form").addEventListener("reset", event => {
    event.preventDefault();
    selectedProfilePhoto = null;
    $("#profile-photo").value = "";

    if (currentUser) {
        $("#profile-name").value = currentUser.name || "";
        $("#profile-email").value = currentUser.email || "";
        $("#profile-phone").value = currentUser.phone || "";
        $("#profile-age").value = currentUser.age || "";
        $("#profile-status").value = currentUser.status || (currentUser.role === "admin" ? "civitas akademik" : "mahasiswa");
        $("#profile-bio").value = currentUser.bio || "";

        renderAvatar($(".avatar"), currentUser.name, currentUser.photo);
        renderAvatar($("#profile-avatar"), currentUser.name, currentUser.photo);
        toast("Form profil dikembalikan ke data tersimpan");
    }
});

const date = new Date();
$("#dashboard-date").value = todayKey;
$("#dashboard-date").max = todayKey;
$("#dashboard-date").addEventListener("change", event => {
  if (!event.target.value) return;
  selectedDashboardDate = event.target.value;
  renderHome();
});
const helpBtn = $("#help-btn");
if (helpBtn) {
  helpBtn.addEventListener("click", () => {
    openModal(
      "Bantuan & Layanan Klinik",
      `<div class="help-modal-content">
        <p><strong>Klinik Polinela</strong> siap melayani kebutuhan kesehatan mahasiswa, dosen, dan seluruh civitas akademik.</p>
        <div style="margin-top:14px; font-size:13px; line-height:1.8; color: var(--text);">
          <div>📍 <strong>Alamat:</strong> Jl. Soekarno-Hatta No. 10, Rajabasa, Bandar Lampung</div>
          <div>🕒 <strong>Jam Buka:</strong> Senin – Jumat, 08.00 – 15.00 WIB</div>
          <div>📞 <strong>Telepon / WA:</strong> 0812-3456-7890</div>
          <div>✉️ <strong>Email:</strong> klinik@polinela.ac.id</div>
        </div>
      </div>
      <div style="margin-top:16px; text-align:right;">
        <button type="button" class="btn primary" onclick="closeModal()">Mengerti</button>
      </div>`,
      () => {},
      { actions: false }
    );
  });
}

$("#today-date-btn").addEventListener("click", () => {
  selectedDashboardDate = todayKey;
  $("#dashboard-date").value = todayKey;
  renderHome();
});
$("#patient-date").textContent = date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

// Auto-refresh: poll setiap 5 detik agar admin melihat antrian baru dari pasien
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentUser) return;
    await refreshData();
    if (currentUser.role === "admin") {
      renderQueues();
      renderHome();
      renderAdminOrders();
    } else {
      renderPatientQueues();
      renderSchedules();
      renderOrderHistory();
    }
  }, 5000); // ponytail: 5s polling; upgrade ke WebSocket jika perlu realtime <1s
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

$("#logout-btn").addEventListener("click", stopPolling);

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#modal-backdrop").classList.contains("hidden")) {
    closeModal();
  }
});

// Inisialisasi awal
refreshData().then(() => {
  renderHome();
  renderMedicines();
  renderAdminOrders();
  renderQueues();
});
