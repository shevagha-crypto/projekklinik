const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaultMedicines = [
  {id:1,name:"Paracetamol 500 mg",category:"Analgesik",form:"Tablet",stock:120},
  {id:2,name:"Amoxicillin 500 mg",category:"Antibiotik",form:"Kapsul",stock:18},
  {id:3,name:"Vitamin C 500 mg",category:"Vitamin",form:"Tablet",stock:75},
  {id:4,name:"Antasida",category:"Antasida",form:"Tablet kunyah",stock:42},
  {id:5,name:"Cetirizine 10 mg",category:"Antihistamin",form:"Tablet",stock:8},
  {id:6,name:"Oralit",category:"Rehidrasi",form:"Serbuk",stock:30}
];
const defaultQueues = [
  {id:1,number:"A-024",name:"Nadia Putri",doctor:"dr. Dian",clinic:"Poli Umum",time:"08.15",status:"Menunggu",patientEmail:""},
  {id:2,number:"A-023",name:"Rizky Pratama",doctor:"dr. Andi",clinic:"Poli Umum",time:"08.10",status:"Diperiksa",patientEmail:""},
  {id:3,number:"A-022",name:"Siti Rahma",doctor:"dr. Dian",clinic:"Poli Umum",time:"08.05",status:"Selesai",patientEmail:""},
  {id:4,number:"A-021",name:"Bima Saputra",doctor:"dr. Andi",clinic:"Poli Gigi",time:"07.55",status:"Selesai",patientEmail:""},
  {id:5,number:"A-020",name:"Dewi Lestari",doctor:"dr. Dian",clinic:"Poli Umum",time:"07.45",status:"Menunggu",patientEmail:""},
  {id:6,number:"A-019",name:"Fajar Nugraha",doctor:"dr. Andi",clinic:"Poli Gigi",time:"07.35",status:"Selesai",patientEmail:""}
];
function loadData(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback.map(item => ({...item})); }
  catch { return fallback.map(item => ({...item})); }
}
let medicines = loadData("polinela_medicines", defaultMedicines);
let queues = loadData("polinela_queues", defaultQueues);
let users = loadData("polinela_users", []);
const todayKey = localDateKey(new Date());
let selectedDashboardDate = todayKey;
let nextMedicineId = Math.max(0, ...medicines.map(m => Number(m.id) || 0)) + 1;
let nextQueueId = Math.max(0, ...queues.map(q => Number(q.id) || 0)) + 1;
let currentUser = null;
let toastTimer;
function saveData() {
  localStorage.setItem("polinela_medicines", JSON.stringify(medicines));
  localStorage.setItem("polinela_queues", JSON.stringify(queues));
  localStorage.setItem("polinela_users", JSON.stringify(users));
}
// Migrasi data antrian versi lama agar memiliki tanggal dan bisa masuk laporan harian.
queues = queues.map(q => {
  const date = q.date || (q.createdAt ? localDateKey(new Date(q.createdAt)) : todayKey);
  const time24 = String(q.time || "00:00").replace(".", ":");
  return {...q, date, createdAt: q.createdAt || `${date}T${time24}:00`};
});
saveData();

function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return todayKey;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDateLong(dateKey) {
  if (!dateKey) return "Tanggal tidak diketahui";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month-1, day).toLocaleDateString("id-ID", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
}
function getQueuesForDate(dateKey) {
  return queues.filter(q => q.date === dateKey).sort((a,b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || Number(b.id)-Number(a.id)
  );
}
function getUniquePatientsForDate(dateKey, dateQueues) {
  const patientKeys = new Set();
  dateQueues.forEach(q => patientKeys.add(q.patientEmail ? `email:${q.patientEmail.toLowerCase()}` : `name:${String(q.name).trim().toLowerCase()}`));
  users.forEach(user => {
    if (user.createdAt && localDateKey(new Date(user.createdAt)) === dateKey) patientKeys.add(`email:${String(user.email).toLowerCase()}`);
  });
  return patientKeys.size;
}
function toast(message) {
  const el = $("#toast"); if (!el) return;
  el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
function initials(name) { return String(name || "?").trim().split(/\s+/).map(part => part[0]).slice(0,2).join("").toUpperCase(); }
function statusClass(status) { return status === "Menunggu" ? "waiting" : status === "Diperiksa" ? "process" : "done"; }
function statusBadge(status) { return `<span class="status ${statusClass(status)}">${escapeHTML(status)}</span>`; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showError(selector, message) { const el = $(selector); el.textContent = message; el.classList.remove("hidden"); }
function clearError(selector) { const el = $(selector); el.textContent = ""; el.classList.add("hidden"); }
function setLoginMode() {
  const isPatient = $("#login-role").value === "patient";
  $("#login-email").value = isPatient ? "" : "admin";
  $("#login-password").value = isPatient ? "" : "klinik123";
  $("#login-email").placeholder = isPatient ? "Masukkan email terdaftar" : "Masukkan username admin";
  $("#login-password").placeholder = "Masukkan kata sandi";
  clearError("#login-error");
}
$("#login-role").addEventListener("change", setLoginMode);
$("#show-register").addEventListener("click", () => {
  $("#login-form").classList.add("hidden"); $(".register-prompt").classList.add("hidden");
  $("#register-form").classList.remove("hidden"); clearError("#register-error");
});
$("#cancel-register").addEventListener("click", () => {
  $("#register-form").classList.add("hidden"); $("#login-form").classList.remove("hidden");
  $(".register-prompt").classList.remove("hidden"); $("#login-role").value = "patient"; setLoginMode();
});
$("#register-form").addEventListener("submit", event => {
  event.preventDefault(); clearError("#register-error");
  const name = $("#register-name").value.trim();
  const email = $("#register-email").value.trim().toLowerCase();
  const password = $("#register-password").value;
  const phone = $("#register-phone").value.trim();
  if (users.some(user => user.email.toLowerCase() === email)) { showError("#register-error", "Email sudah terdaftar. Silakan masuk atau gunakan email lain."); return; }
  users.push({id:Date.now(),name,email,password,phone,role:"patient",createdAt:new Date().toISOString()});
  saveData();
  $("#register-form").reset(); $("#register-form").classList.add("hidden");
  $("#login-form").classList.remove("hidden"); $(".register-prompt").classList.remove("hidden");
  $("#login-role").value = "patient"; $("#login-email").value = email; $("#login-password").value = "";
  toast("Akun berhasil dibuat. Silakan masuk.");
});

$("#login-form").addEventListener("submit", event => {
  event.preventDefault(); clearError("#login-error");
  const role = $("#login-role").value;
  const identifier = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if (role === "admin") {
    if (identifier.toLowerCase() !== "admin" || password !== "klinik123") { showError("#login-error", "Username atau kata sandi admin salah. Gunakan admin / klinik123 untuk akun contoh."); return; }
    currentUser = {name:"Admin Klinik",email:"admin@kliniksehat.id",role:"admin",phone:"0812-3456-7890"};
  } else {
    const user = users.find(item => item.email.toLowerCase() === identifier.toLowerCase() && item.password === password && item.role === "patient");
    if (!user) { showError("#login-error", "Akun pasien tidak ditemukan atau kata sandi salah. Silakan daftar akun terlebih dahulu."); return; }
    currentUser = {...user};
  }
  startSession();
});
function startSession() {
  $("#login-screen").classList.add("hidden"); $("#app").classList.remove("hidden");
  const isAdmin = currentUser.role === "admin";
  $$(".nav-link[data-page='home'], .nav-link[data-page='obat'], .nav-link[data-page='antrian']").forEach(link => link.classList.toggle("hidden", !isAdmin));
  $("#patient-nav").classList.toggle("hidden", isAdmin);
  $("#top-user-name").textContent = currentUser.name;
  $(".user-chip small").textContent = isAdmin ? "Administrator" : "Pengguna / Pasien";
  $(".avatar").textContent = initials(currentUser.name).slice(0,1);
  $("#profile-name").value = currentUser.name;
  $("#profile-email").value = currentUser.email;
  $("#profile-phone").value = currentUser.phone || "";
  $("#profile-role").value = isAdmin ? "Administrator" : "Pengguna / Pasien";
  $("#profile-heading-name").textContent = currentUser.name;
  $("#profile-email-preview").textContent = currentUser.email;
  $(".profile-avatar").textContent = initials(currentUser.name).slice(0,1);
  $(".profile-card .muted").textContent = isAdmin ? "Administrator" : "Pengguna / Pasien";
  $("#home-greeting").innerHTML = isAdmin ? 'Selamat datang, Admin! <span class="wave">✦</span>' : `Halo, ${escapeHTML(currentUser.name.split(" ")[0])}!`;
  $("#home-description").textContent = isAdmin ? "Berikut ringkasan aktivitas Klinik Polinela hari ini." : "Selamat datang di layanan pasien Klinik Polinela.";
  if (isAdmin) { showPage("home"); renderHome(); renderMedicines(); renderQueues(); }
  else { showPage("pasien"); renderPatientQueues(); }
  toast(`Berhasil masuk sebagai ${isAdmin ? "Admin" : "Pengguna"}`);
}
$("#logout-btn").addEventListener("click", () => {
  currentUser = null; $("#app").classList.add("hidden"); $("#login-screen").classList.remove("hidden");
  $("#login-role").value = "admin"; setLoginMode(); $("#login-email").value = "admin"; $("#login-password").value = "klinik123";
  toast("Anda telah keluar dari akun");
});
function showPage(page) {
  const isAdmin = currentUser?.role === "admin";
  if (!isAdmin && page !== "pasien" && page !== "profil") page = "pasien";
  $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
  const labels = {home:"Home",obat:"Data Obat",antrian:"Antrian",profil:"Profil",pasien:"Antrian Saya"};
  $("#breadcrumb-current").textContent = labels[page] || "Home";
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".nav-link").forEach(link => link.addEventListener("click", () => showPage(link.dataset.page)));
$$("[data-goto]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.goto)));
function renderHome() {
  const dailyQueues = getQueuesForDate(selectedDashboardDate);
  const dateLabel = formatDateLong(selectedDashboardDate);
  const isToday = selectedDashboardDate === todayKey;
  $("#home-description").textContent = `Ringkasan aktivitas Klinik Polinela untuk ${dateLabel}.`;
  $("#selected-date-label").textContent = isToday ? "Menampilkan data hari ini" : "Menampilkan data riwayat";
  $("#home-queue-heading").textContent = isToday ? "Antrian terbaru hari ini" : "Antrian pada tanggal terpilih";
  $("#home-queue-description").textContent = `${dailyQueues.length} antrian tercatat pada ${dateLabel}.`;
  $("#home-queue-body").innerHTML = dailyQueues.slice(0,5).map(q => `
    <tr><td><strong>${escapeHTML(q.number)}</strong></td><td><div class="patient-cell"><div class="patient-avatar">${escapeHTML(initials(q.name))}</div><strong>${escapeHTML(q.name)}</strong></div></td><td>${escapeHTML(q.doctor)}</td><td>${escapeHTML(q.time || "—")}</td><td>${statusBadge(q.status)}</td></tr>`).join("") ||
    '<tr><td colspan="5" class="empty-cell">Tidak ada data pasien atau antrian pada tanggal ini.</td></tr>';
  $("#home-medicine-list").innerHTML = medicines.slice(0,3).map(m => `<div class="medicine-item"><div class="medicine-symbol">✚</div><div><strong>${escapeHTML(m.name)}</strong><small>${escapeHTML(m.category)}</small></div><span class="stock">${Number(m.stock)} unit</span></div>`).join("") || '<p class="muted">Belum ada data obat.</p>';
  $("#stat-patients").textContent = getUniquePatientsForDate(selectedDashboardDate, dailyQueues);
  $("#stat-queue").textContent = dailyQueues.length;
  $("#stat-waiting").textContent = `${dailyQueues.filter(q => q.status === "Menunggu").length} pasien`;
  $("#stat-medicine").textContent = medicines.length;
}
function renderMedicines() {
  const term = $("#medicine-search").value.toLowerCase();
  const filtered = medicines.filter(m => `${m.name} ${m.category} ${m.form}`.toLowerCase().includes(term));
  $("#medicine-table-body").innerHTML = filtered.length ? filtered.map(m => `<tr><td><div class="patient-cell"><div class="medicine-symbol">✚</div><div><strong>${escapeHTML(m.name)}</strong><div class="muted">${String(m.id).padStart(3,"0")}</div></div></div></td><td>${escapeHTML(m.category)}</td><td>${escapeHTML(m.form)}</td><td><strong>${Number(m.stock)}</strong> unit</td><td>${m.stock < 20 ? '<span class="status waiting">Stok rendah</span>' : '<span class="status done">Tersedia</span>'}</td><td><button class="row-action danger" data-delete-medicine="${m.id}">Hapus</button></td></tr>`).join("") : '<tr><td colspan="6" class="empty-cell">Data obat tidak ditemukan.</td></tr>';
  $("#medicine-total").textContent = medicines.length;
  $$('[data-delete-medicine]').forEach(button => button.addEventListener("click", () => {
    medicines = medicines.filter(m => m.id !== Number(button.dataset.deleteMedicine)); saveData(); renderMedicines(); renderHome(); toast("Data obat dihapus");
  }));
}
function renderQueues() {
  const term = $("#queue-search").value.toLowerCase(); const filter = $("#queue-filter").value;
  const filtered = queues.filter(q => `${q.name} ${q.number} ${q.doctor} ${q.clinic}`.toLowerCase().includes(term) && (filter === "Semua" || q.status === filter));
  $("#queue-table-body").innerHTML = filtered.length ? filtered.map(q => `<tr><td><strong>${escapeHTML(q.number)}</strong></td><td><div class="patient-cell"><div class="patient-avatar">${escapeHTML(initials(q.name))}</div><strong>${escapeHTML(q.name)}</strong></div></td><td><strong>${escapeHTML(q.clinic)}</strong><div class="muted">${escapeHTML(q.doctor)}</div></td><td>${escapeHTML(q.time)}</td><td>${statusBadge(q.status)}</td><td>${q.status !== "Selesai" ? `<button class="row-action" data-next-status="${q.id}">${q.status === "Menunggu" ? "Periksa" : "Selesaikan"}</button>` : '<span class="muted">—</span>'}</td></tr>`).join("") : '<tr><td colspan="6" class="empty-cell">Antrian tidak ditemukan.</td></tr>';
  $("#waiting-count").textContent = queues.filter(q => q.status === "Menunggu").length;
  $("#process-count").textContent = queues.filter(q => q.status === "Diperiksa").length;
  $("#done-count").textContent = queues.filter(q => q.status === "Selesai").length;
  $$('[data-next-status]').forEach(button => button.addEventListener("click", () => {
    const q = queues.find(item => item.id === Number(button.dataset.nextStatus));
    if (q) q.status = q.status === "Menunggu" ? "Diperiksa" : "Selesai";
    saveData(); renderQueues(); renderHome(); toast("Status antrian diperbarui");
  }));
}
function renderPatientQueues() {
  if (!currentUser) return;
  const ownQueues = queues.filter(q => q.patientEmail && q.patientEmail.toLowerCase() === currentUser.email.toLowerCase());
  $("#patient-welcome").textContent = `Halo, ${currentUser.name}!`;
  $("#patient-queue-body").innerHTML = ownQueues.length ? ownQueues.map(q => `<tr><td><strong>${escapeHTML(q.number)}</strong></td><td>${escapeHTML(q.clinic)}</td><td>${escapeHTML(q.doctor)}</td><td>${escapeHTML(q.time)}</td><td>${statusBadge(q.status)}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-cell">Kamu belum memiliki antrian. Tekan “Daftar Antrian” untuk membuat antrian.</td></tr>';
}
function openModal(title, fields, onSave) {
  $("#modal-title").textContent = title;
  $("#modal-form").innerHTML = fields + '<div class="modal-actions"><button type="button" class="btn outline" id="cancel-modal">Batal</button><button type="submit" class="btn primary">Simpan</button></div>';
  $("#modal-backdrop").classList.remove("hidden"); $("#cancel-modal").addEventListener("click", closeModal);
  $("#modal-form").onsubmit = event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); onSave(data); closeModal(); };
}
function closeModal() { $("#modal-backdrop").classList.add("hidden"); }
$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", event => { if (event.target.id === "modal-backdrop") closeModal(); });
$("#add-medicine-btn").addEventListener("click", () => {
  if (currentUser?.role !== "admin") return;
  openModal("Tambah Obat", '<label>Nama obat</label><input name="name" placeholder="Contoh: Ibuprofen 200 mg" required /><div class="form-row"><div><label>Kategori</label><input name="category" placeholder="Kategori obat" required /></div><div><label>Bentuk</label><select name="form"><option>Tablet</option><option>Kapsul</option><option>Sirup</option><option>Serbuk</option><option>Salep</option><option>Cairan</option></select></div></div><label>Jumlah stok (unit)</label><input name="stock" type="number" min="0" placeholder="0" required />', data => {
    medicines.push({id:nextMedicineId++,name:data.name.trim(),category:data.category.trim(),form:data.form,stock:Number(data.stock)});
    saveData(); renderMedicines(); renderHome(); toast("Data obat berhasil ditambahkan");
  });
});
function createQueueForm(patientMode) {
  const patientField = patientMode ? `<label>Nama pasien</label><input value="${escapeHTML(currentUser.name)}" disabled /><input type="hidden" name="name" value="${escapeHTML(currentUser.name)}" />` : '<label>Nama pasien</label><input name="name" placeholder="Nama lengkap pasien" required />';
  const visitDateField = patientMode ? "" : `<label>Tanggal kunjungan</label><input name="visitDate" type="date" value="${localDateKey(new Date())}" max="${localDateKey(new Date())}" required />`;
  openModal(patientMode ? "Daftar Antrian Pemeriksaan" : "Tambah Pasien / Antrian", `${patientField}${visitDateField}<div class="form-row"><div><label>Poli</label><select name="clinic"><option>Poli Umum</option></select></div><div><label>Dokter</label><select name="doctor"><option>dr. Dian</option><option>dr. Tya</option></select></div></div>`, data => {
    const maxNumber = queues.reduce((max,q) => Math.max(max, Number(String(q.number).split("-")[1]) || 0), 0) + 1;
    const now = new Date();
    const visitDate = patientMode ? localDateKey(now) : (data.visitDate || localDateKey(now));
    queues.unshift({id:nextQueueId++,number:`A-${String(maxNumber).padStart(3,"0")}`,name:data.name.trim(),doctor:data.doctor,clinic:data.clinic,time:now.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),date:visitDate,createdAt:now.toISOString(),status:"Menunggu",patientEmail:patientMode ? currentUser.email : ""});
    selectedDashboardDate = visitDate;
    $("#dashboard-date").value = selectedDashboardDate;
    saveData(); renderQueues(); renderHome(); if (patientMode) renderPatientQueues(); toast("Antrian berhasil didaftarkan");
  });
}
$("#add-queue-btn").addEventListener("click", () => { if (currentUser?.role === "admin") createQueueForm(false); });
$("#patient-add-queue-btn").addEventListener("click", () => { if (currentUser?.role === "patient") createQueueForm(true); });
$("#medicine-search").addEventListener("input", renderMedicines);
$("#queue-search").addEventListener("input", renderQueues);
$("#queue-filter").addEventListener("change", renderQueues);
$("#profile-form").addEventListener("submit", event => {
  event.preventDefault(); if (!currentUser) return;
  const name = $("#profile-name").value.trim(); const email = $("#profile-email").value.trim().toLowerCase(); const phone = $("#profile-phone").value.trim();
  if (currentUser.role === "patient") {
    if (users.some(user => user.email === email && user.id !== currentUser.id)) { toast("Email sudah digunakan akun lain"); return; }
    const index = users.findIndex(user => user.id === currentUser.id);
    if (index >= 0) users[index] = {...users[index],name,email,phone};
    queues.forEach(q => { if (q.patientEmail === currentUser.email) { q.patientEmail = email; q.name = name; } });
    currentUser = {...currentUser,name,email,phone}; saveData(); renderPatientQueues();
  } else { currentUser = {...currentUser,name,email,phone}; }
  $("#top-user-name").textContent = name; $("#profile-heading-name").textContent = name; $("#profile-email-preview").textContent = email;
  $(".avatar").textContent = initials(name).slice(0,1); $(".profile-avatar").textContent = initials(name).slice(0,1);
  if (currentUser.role === "patient") $("#patient-welcome").textContent = `Halo, ${name}!`;
  toast("Perubahan profil berhasil disimpan");
});
$("#profile-form").addEventListener("reset", () => setTimeout(() => toast("Form profil dikembalikan"), 0));
const date = new Date();
$("#dashboard-date").value = todayKey;
$("#dashboard-date").max = todayKey;
$("#dashboard-date").addEventListener("change", event => {
  if (!event.target.value) return;
  selectedDashboardDate = event.target.value;
  renderHome();
});
$("#today-date-btn").addEventListener("click", () => {
  selectedDashboardDate = todayKey;
  $("#dashboard-date").value = todayKey;
  renderHome();
});
$("#patient-date").textContent = date.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
renderHome(); renderMedicines(); renderQueues();
