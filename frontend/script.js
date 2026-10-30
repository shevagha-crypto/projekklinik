const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let medicines = [];
let queues = [];
let currentUser = null;
let toastTimer;
const todayKey = localDateKey(new Date());
let selectedDashboardDate = todayKey;

// API Helper
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan sistem');
  return data;
}

async function refreshData() {
  try {
    const [meds, qList] = await Promise.all([
      api('/api/medicines'),
      api('/api/queues')
    ]);
    medicines = meds;
    queues = qList;
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
  $("#patient-nav").classList.toggle("hidden", isAdmin);
  $("#info-obat-nav").classList.toggle("hidden", isAdmin);
  $("#top-user-name").textContent = currentUser.name;
  $(".user-chip small").textContent = isAdmin ? "Administrator" : "Pengguna / Pasien";
  $(".avatar").textContent = initials(currentUser.name).slice(0, 1);
  $("#profile-name").value = currentUser.name;
  $("#profile-email").value = currentUser.email;
  $("#profile-phone").value = currentUser.phone || "";
  $("#profile-role").value = isAdmin ? "Administrator" : "Pengguna / Pasien";
  $("#profile-heading-name").textContent = currentUser.name;
  $("#profile-email-preview").textContent = currentUser.email;
  $(".profile-avatar").textContent = initials(currentUser.name).slice(0, 1);
  $(".profile-card .muted").textContent = isAdmin ? "Administrator" : "Pengguna / Pasien";
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
    renderQueues();
    startPolling();
  } else {
    showPage("pasien");
    renderPatientQueues();
    renderInfoObat();
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
  if (!isAdmin && page !== "pasien" && page !== "profil" && page !== "info-obat") page = "pasien";
  $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
  const labels = {
    home: "Home",
    obat: "Data Obat",
    antrian: "Antrian",
    profil: "Profil",
    pasien: "Antrian Saya",
    "info-obat": "Informasi Obat"
  };
  $("#breadcrumb-current").textContent = labels[page] || "Home";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-link").forEach(link => link.addEventListener("click", () => showPage(link.dataset.page)));
$$("[data-goto]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.goto)));

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
            body: JSON.stringify({ stock: Number(data.stock), image })
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
    renderHome();
    toast('Antrian berhasil dibatalkan');
  } catch (err) {
    toast(err.message);
  }
}
window.cancelQueue = cancelQueue;

function renderInfoObat() {
  const searchEl = $("#info-obat-search");
  if (!searchEl) return;
  const term = searchEl.value.toLowerCase();
  const filtered = medicines.filter(m => `${m.name} ${m.category} ${m.form} ${m.description || ""}`.toLowerCase().includes(term));
  $("#info-obat-list").innerHTML = filtered.length
    ? filtered
        .map(
          m => `
      <div class="info-obat-card">
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

function openModal(title, fields, onSave) {
  $("#modal-title").textContent = title;
  $("#modal-form").innerHTML =
    fields + '<div class="modal-actions"><button type="button" class="btn outline" id="cancel-modal">Batal</button><button type="submit" class="btn primary">Simpan</button></div>';
  $("#modal-backdrop").classList.remove("hidden");
  $("#cancel-modal").addEventListener("click", closeModal);
  $("#modal-form").onsubmit = async event => {
    event.preventDefault();
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
    <textarea name="description" rows="3" placeholder="Jelaskan kegunaan dan indikasi obat..."></textarea>`,
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

  openModal(
    patientMode ? "Daftar Antrian Pemeriksaan" : "Tambah Pasien / Antrian",
    `${patientField}${visitDateField}${complaintField}
    <div class="form-row">
      <div>
        <label>Poli</label>
        <select name="clinic"><option>Poli Umum</option></select>
      </div>
      <div>
        <label>Dokter</label>
        <select name="doctor"><option>dr. Dian</option><option>dr. Tya</option></select>
      </div>
    </div>`,
    async form => {
      const data = Object.fromEntries(new FormData(form).entries());
      const maxNumber = queues.reduce((max, q) => Math.max(max, Number(String(q.number).split("-")[1]) || 0), 0) + 1;
      const now = new Date();
      const visitDate = patientMode ? localDateKey(now) : (data.visitDate || localDateKey(now));
      const patientName = (patientMode ? currentUser.name : (data.name || "")).trim();

      await api('/api/queues', {
        method: 'POST',
        body: JSON.stringify({
          number: `A-${String(maxNumber).padStart(3, "0")}`,
          name: patientName,
          doctor: data.doctor,
          clinic: data.clinic,
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
  if (currentUser?.role === "patient") createQueueForm(true);
});

$("#medicine-search").addEventListener("input", renderMedicines);
$("#info-obat-search").addEventListener("input", renderInfoObat);
$("#queue-search").addEventListener("input", renderQueues);
$("#queue-filter").addEventListener("change", renderQueues);

$("#profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;
  const name = $("#profile-name").value.trim();
  const email = $("#profile-email").value.trim().toLowerCase();
  const phone = $("#profile-phone").value.trim();

  try {
    await api(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, email, phone })
    });
    currentUser = { ...currentUser, name, email, phone };
    await refreshData();
    $("#top-user-name").textContent = name;
    $("#profile-heading-name").textContent = name;
    $("#profile-email-preview").textContent = email;
    $(".avatar").textContent = initials(name).slice(0, 1);
    $(".profile-avatar").textContent = initials(name).slice(0, 1);
    if (currentUser.role === "patient") {
      $("#patient-welcome").textContent = `Halo, ${name}!`;
      renderPatientQueues();
    }
    toast("Perubahan profil berhasil disimpan");
  } catch (err) {
    toast(err.message);
  }
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
    } else {
      renderPatientQueues();
    }
  }, 5000); // ponytail: 5s polling; upgrade ke WebSocket jika perlu realtime <1s
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

$("#logout-btn").addEventListener("click", stopPolling);

// Inisialisasi awal
refreshData().then(() => {
  renderHome();
  renderMedicines();
  renderQueues();
});
