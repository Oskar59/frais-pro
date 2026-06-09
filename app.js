/* ─── CONFIG ─────────────────────────────────────────────────── */
// Remplacer ces valeurs par vos identifiants Supabase
// Voir README.md pour les instructions
const SUPABASE_URL = window.SUPABASE_URL || 'https://wnyxzsgrtodmfvzphryz.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndueXh6c2dydG9kbWZ2enBocnl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NzY0NzksImV4cCI6MjA5NjU1MjQ3OX0.y65ZSfNCr4lgcae34jtgO0-1-Fhdxk-RD5EZfYY8u1c';

const FORFAIT_MONTANT = 20; // € par déplacement

/* ─── INIT SUPABASE ──────────────────────────────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── STATE ──────────────────────────────────────────────────── */
let currentUser = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let entriesCache = {}; // { "YYYY-MM-DD": [entry, ...] }
let currentDayDate = null;
let editingEntryId = null;
let pendingImageFile = null;
let pendingImageDataUrl = null;
let existingImageUrl = null;

/* ─── DOM REFS ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const authScreen = $('auth-screen');
const appEl = $('app');

/* ─── AUTH ───────────────────────────────────────────────────── */
// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    hideAuthMessages();
  });
});

function showAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  $('auth-success').classList.add('hidden');
}
function showAuthSuccess(msg) {
  const el = $('auth-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  $('auth-error').classList.add('hidden');
}
function hideAuthMessages() {
  $('auth-error').classList.add('hidden');
  $('auth-success').classList.add('hidden');
}

function setButtonLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="loading-spinner"></span>${originalText}`;
  } else {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

$('btn-login').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
  const btn = $('btn-login');
  setButtonLoading(btn, true, 'Se connecter');
  const { error } = await db.auth.signInWithPassword({ email, password });
  setButtonLoading(btn, false, 'Se connecter');
  if (error) showAuthError(error.message === 'Invalid login credentials'
    ? 'Email ou mot de passe incorrect.' : error.message);
});

$('btn-register').addEventListener('click', async () => {
  const name = $('register-name').value.trim();
  const email = $('register-email').value.trim();
  const password = $('register-password').value;
  if (!name || !email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
  if (password.length < 6) { showAuthError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
  const btn = $('btn-register');
  setButtonLoading(btn, true, "Créer mon compte");
  const { error } = await db.auth.signUp({
    email, password,
    options: { data: { full_name: name } }
  });
  setButtonLoading(btn, false, "Créer mon compte");
  if (error) { showAuthError(error.message); return; }
  showAuthSuccess('Compte créé ! Vérifiez vos emails pour confirmer, puis connectez-vous.');
});

$('btn-logout').addEventListener('click', async () => {
  await db.auth.signOut();
});

// Auth state listener
db.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) {
    authScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    const name = currentUser.user_metadata?.full_name || currentUser.email;
    $('user-display').textContent = name;
    loadMonth();
  } else {
    authScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    entriesCache = {};
  }
});

/* ─── CALENDAR RENDERING ─────────────────────────────────────── */
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function updateMonthLabel() {
  $('month-label').textContent = `${MONTHS_FR[currentMonth]} ${currentYear}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

async function loadMonth() {
  updateMonthLabel();
  const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${getDaysInMonth(currentYear, currentMonth)}`;

  const { data, error } = await db
    .from('deplacements')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('heure_depart', { ascending: true });

  if (error) { console.error(error); return; }

  entriesCache = {};
  (data || []).forEach(entry => {
    if (!entriesCache[entry.date]) entriesCache[entry.date] = [];
    entriesCache[entry.date].push(entry);
  });

  renderCalendar();
  updateSummary();
}

function renderCalendar() {
  const grid = $('calendar-grid');
  grid.innerHTML = '';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const daysInPrevMonth = getDaysInMonth(currentYear, currentMonth - 1);

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const cell = createCell(day, true, null);
    grid.appendChild(cell);
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const entries = entriesCache[dateStr] || [];
    const cell = createCell(d, false, dateStr, isToday, entries);
    grid.appendChild(cell);
  }

  // Next month padding
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    const cell = createCell(i, true, null);
    grid.appendChild(cell);
  }
}

function createCell(day, otherMonth, dateStr, isToday = false, entries = []) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell' + (otherMonth ? ' other-month' : '') + (isToday ? ' today' : '') + (entries.length > 0 ? ' has-entries' : '');

  const num = document.createElement('div');
  num.className = 'cal-day-number';
  num.textContent = day;
  cell.appendChild(num);

  if (!otherMonth && entries.length > 0) {
    const list = document.createElement('div');
    list.className = 'cal-entries';
    const maxShow = 2;
    entries.slice(0, maxShow).forEach(e => {
      const pill = document.createElement('div');
      pill.className = 'cal-entry-pill';
      const route = e.lieu_depart && e.lieu_arrivee
        ? `<span class="pill-route">${truncate(e.lieu_depart, 8)} → ${truncate(e.lieu_arrivee, 8)}</span>`
        : '<span class="pill-route">Déplacement</span>';
      pill.innerHTML = `${FORFAIT_MONTANT} € ${route}`;
      list.appendChild(pill);
    });
    if (entries.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'cal-more';
      more.textContent = `+${entries.length - maxShow} autre${entries.length - maxShow > 1 ? 's' : ''}`;
      list.appendChild(more);
    }
    cell.appendChild(list);
  }

  if (!otherMonth && dateStr) {
    cell.addEventListener('click', () => openDayPanel(dateStr));
  }
  return cell;
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function updateSummary() {
  let count = 0;
  Object.values(entriesCache).forEach(entries => { count += entries.length; });
  $('summary-count').textContent = count;
  $('summary-total').textContent = (count * FORFAIT_MONTANT).toLocaleString('fr-FR') + ' €';
}

/* ─── MONTH NAVIGATION ───────────────────────────────────────── */
$('btn-prev-month').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  loadMonth();
});
$('btn-next-month').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  loadMonth();
});

/* ─── DAY PANEL ──────────────────────────────────────────────── */
function openDayPanel(dateStr) {
  currentDayDate = dateStr;
  const entries = entriesCache[dateStr] || [];
  const d = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('day-panel-title').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  renderDayList(entries);

  $('day-panel').classList.remove('hidden');
  $('day-panel-overlay').classList.remove('hidden');
}

function renderDayList(entries) {
  const list = $('day-panel-list');
  list.innerHTML = '';
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-day">Aucun déplacement ce jour.<br>Appuyez sur le bouton ci-dessous pour en ajouter un.</div>';
    return;
  }
  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const route = [entry.lieu_depart, entry.lieu_arrivee].filter(Boolean).join(' → ') || 'Déplacement';
    const time = [entry.heure_depart, entry.heure_arrivee].filter(Boolean).join(' – ');

    card.innerHTML = `
      <div class="entry-card-info">
        <div class="entry-route">${escapeHtml(route)}</div>
        ${time ? `<div class="entry-time">${escapeHtml(time)}</div>` : ''}
      </div>
      <div class="entry-card-actions">
        ${entry.justificatif_url ? `<button class="entry-justif-btn" data-url="${escapeHtml(entry.justificatif_url)}" title="Voir justificatif">📎</button>` : ''}
        <span class="entry-amount-badge">${FORFAIT_MONTANT} €</span>
        <button class="entry-edit-btn" data-id="${entry.id}">Modifier</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.entry-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeDayPanel();
      const entry = (entriesCache[currentDayDate] || []).find(e => e.id === btn.dataset.id);
      if (entry) openEditModal(entry);
    });
  });
  list.querySelectorAll('.entry-justif-btn').forEach(btn => {
    btn.addEventListener('click', () => openJustifModal(btn.dataset.url));
  });
}

function closeDayPanel() {
  $('day-panel').classList.add('hidden');
  $('day-panel-overlay').classList.add('hidden');
}
$('btn-close-day').addEventListener('click', closeDayPanel);
$('day-panel-overlay').addEventListener('click', closeDayPanel);
$('btn-add-from-day').addEventListener('click', () => {
  closeDayPanel();
  openNewModal(currentDayDate);
});

/* ─── FAB ────────────────────────────────────────────────────── */
$('btn-fab').addEventListener('click', () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  openDayPanel(dateStr);
});

/* ─── ENTRY MODAL ────────────────────────────────────────────── */
function resetModal() {
  $('entry-id').value = '';
  $('entry-date').value = '';
  $('entry-depart').value = '';
  $('entry-arrivee').value = '';
  $('entry-heure-dep').value = '';
  $('entry-heure-arr').value = '';
  $('modal-error').classList.add('hidden');
  $('btn-delete-entry').classList.add('hidden');
  pendingImageFile = null;
  pendingImageDataUrl = null;
  existingImageUrl = null;
  $('upload-placeholder').classList.remove('hidden');
  $('upload-preview').classList.add('hidden');
  $('preview-img').src = '';
  $('entry-justif').value = '';
}

function openNewModal(dateStr) {
  resetModal();
  editingEntryId = null;
  $('modal-title').textContent = 'Nouveau déplacement';
  $('entry-date').value = dateStr;
  $('modal-entry').classList.remove('hidden');
}

function openEditModal(entry) {
  resetModal();
  editingEntryId = entry.id;
  $('modal-title').textContent = 'Modifier le déplacement';
  $('entry-id').value = entry.id;
  $('entry-date').value = entry.date;
  $('entry-depart').value = entry.lieu_depart || '';
  $('entry-arrivee').value = entry.lieu_arrivee || '';
  $('entry-heure-dep').value = entry.heure_depart || '';
  $('entry-heure-arr').value = entry.heure_arrivee || '';
  $('btn-delete-entry').classList.remove('hidden');

  if (entry.justificatif_url) {
    existingImageUrl = entry.justificatif_url;
    $('upload-placeholder').classList.add('hidden');
    $('upload-preview').classList.remove('hidden');
    $('preview-img').src = entry.justificatif_url;
  }
  $('modal-entry').classList.remove('hidden');
}

function closeModal() {
  $('modal-entry').classList.add('hidden');
  resetModal();
}
$('btn-close-modal').addEventListener('click', closeModal);
$('btn-cancel-modal').addEventListener('click', closeModal);
$('modal-entry').addEventListener('click', e => {
  if (e.target === $('modal-entry')) closeModal();
});

/* ─── IMAGE UPLOAD ───────────────────────────────────────────── */
$('entry-justif').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showModalError('Le fichier dépasse 5 Mo.'); return;
  }
  pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingImageDataUrl = ev.target.result;
    $('preview-img').src = pendingImageDataUrl;
    $('upload-placeholder').classList.add('hidden');
    $('upload-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

$('btn-remove-img').addEventListener('click', e => {
  e.stopPropagation();
  pendingImageFile = null;
  pendingImageDataUrl = null;
  existingImageUrl = null;
  $('entry-justif').value = '';
  $('preview-img').src = '';
  $('upload-placeholder').classList.remove('hidden');
  $('upload-preview').classList.add('hidden');
});

// Drag-and-drop
const uploadZone = $('upload-zone');
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    $('entry-justif').files = dt.files;
    $('entry-justif').dispatchEvent(new Event('change'));
  }
});

/* ─── SAVE ENTRY ─────────────────────────────────────────────── */
function showModalError(msg) {
  const el = $('modal-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

$('btn-save-entry').addEventListener('click', async () => {
  const depart = $('entry-depart').value.trim();
  const arrivee = $('entry-arrivee').value.trim();
  const dateStr = $('entry-date').value;

  if (!depart || !arrivee) {
    showModalError('Lieu de départ et d\'arrivée requis.'); return;
  }
  if (!dateStr) {
    showModalError('Date manquante.'); return;
  }

  const btn = $('btn-save-entry');
  setButtonLoading(btn, true, 'Enregistrer');

  try {
    let justificatif_url = existingImageUrl || null;

    // Upload image if new one selected
    if (pendingImageFile) {
      const ext = pendingImageFile.name.split('.').pop().toLowerCase();
      const fileName = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage
        .from('justificatifs')
        .upload(fileName, pendingImageFile, { upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = db.storage
        .from('justificatifs')
        .getPublicUrl(fileName);
      justificatif_url = urlData.publicUrl;
    }

    const payload = {
      user_id: currentUser.id,
      date: dateStr,
      lieu_depart: depart,
      lieu_arrivee: arrivee,
      heure_depart: $('entry-heure-dep').value || null,
      heure_arrivee: $('entry-heure-arr').value || null,
      montant: FORFAIT_MONTANT,
      justificatif_url
    };

    let error;
    if (editingEntryId) {
      ({ error } = await db.from('deplacements').update(payload).eq('id', editingEntryId).eq('user_id', currentUser.id));
    } else {
      ({ error } = await db.from('deplacements').insert(payload));
    }
    if (error) throw error;

    closeModal();
    await loadMonth();
  } catch (err) {
    showModalError(err.message || 'Une erreur est survenue.');
  } finally {
    setButtonLoading(btn, false, 'Enregistrer');
  }
});

/* ─── DELETE ENTRY ───────────────────────────────────────────── */
$('btn-delete-entry').addEventListener('click', async () => {
  if (!editingEntryId) return;
  if (!confirm('Supprimer ce déplacement ?')) return;
  const { error } = await db.from('deplacements').delete().eq('id', editingEntryId).eq('user_id', currentUser.id);
  if (error) { showModalError(error.message); return; }
  closeModal();
  await loadMonth();
});

/* ─── JUSTIF MODAL ───────────────────────────────────────────── */
function openJustifModal(url) {
  $('justif-full-img').src = url;
  $('modal-justif').classList.remove('hidden');
}
$('btn-close-justif').addEventListener('click', () => {
  $('modal-justif').classList.add('hidden');
  $('justif-full-img').src = '';
});
$('modal-justif').addEventListener('click', e => {
  if (e.target === $('modal-justif')) {
    $('modal-justif').classList.add('hidden');
  }
});

/* ─── UTILS ──────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── EXPORT PDF ─────────────────────────────────────────────── */
$('btn-open-export').addEventListener('click', () => {
  // Pré-remplir avec le mois courant
  applyPeriod('month-current');
  $('export-error').classList.add('hidden');
  $('modal-export').classList.remove('hidden');
});

// Raccourcis de période
document.querySelectorAll('.shortcut-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyPeriod(btn.dataset.period);
  });
});

function applyPeriod(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  let debut, fin;

  switch (period) {
    case 'month-current':
      debut = `${y}-${pad(m + 1)}-01`;
      fin   = `${y}-${pad(m + 1)}-${pad(getDaysInMonth(y, m))}`;
      break;
    case 'month-prev': {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      debut = `${py}-${pad(pm + 1)}-01`;
      fin   = `${py}-${pad(pm + 1)}-${pad(getDaysInMonth(py, pm))}`;
      break;
    }
    case 'quarter-current': {
      const q = Math.floor(m / 3);
      debut = `${y}-${pad(q * 3 + 1)}-01`;
      const lastM = q * 3 + 2; // 0-indexed last month of quarter
      fin   = `${y}-${pad(lastM + 1)}-${pad(getDaysInMonth(y, lastM))}`;
      break;
    }
    case 'quarter-prev': {
      const q = Math.floor(m / 3);
      const pq = q === 0 ? 3 : q - 1;
      const py = q === 0 ? y - 1 : y;
      debut = `${py}-${pad(pq * 3 + 1)}-01`;
      const lastM = pq * 3 + 2;
      fin   = `${py}-${pad(lastM + 1)}-${pad(getDaysInMonth(py, lastM))}`;
      break;
    }
    case 'year-current':
      debut = `${y}-01-01`;
      fin   = `${y}-12-31`;
      break;
    case 'year-prev':
      debut = `${y - 1}-01-01`;
      fin   = `${y - 1}-12-31`;
      break;
  }

  $('export-date-debut').value = debut;
  $('export-date-fin').value = fin;
  $('export-error').classList.add('hidden');
  updateExportPreview();
}

function pad(n) { return String(n).padStart(2, '0'); }

function closeExportModal() {
  $('modal-export').classList.add('hidden');
  document.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('active'));
}
$('btn-close-export').addEventListener('click', closeExportModal);
$('btn-cancel-export').addEventListener('click', closeExportModal);
$('modal-export').addEventListener('click', e => {
  if (e.target === $('modal-export')) closeExportModal();
});

// Mise à jour du résumé en temps réel quand les dates changent manuellement
$('export-date-debut').addEventListener('change', () => {
  document.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('active'));
  updateExportPreview();
});
$('export-date-fin').addEventListener('change', () => {
  document.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('active'));
  updateExportPreview();
});

async function updateExportPreview() {
  const debut = $('export-date-debut').value;
  const fin = $('export-date-fin').value;
  if (!debut || !fin || debut > fin) {
    $('export-preview').classList.add('hidden');
    return;
  }
  const { data } = await db
    .from('deplacements')
    .select('id, montant')
    .eq('user_id', currentUser.id)
    .gte('date', debut)
    .lte('date', fin);

  const count = data?.length || 0;
  const total = (data || []).reduce((s, r) => s + Number(r.montant), 0);
  $('export-preview-count').textContent =
    `${count} déplacement${count > 1 ? 's' : ''} · ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € remboursables`;
  $('export-preview').classList.remove('hidden');
}

$('btn-generate-pdf').addEventListener('click', async () => {
  const debut = $('export-date-debut').value;
  const fin = $('export-date-fin').value;

  if (!debut || !fin) {
    $('export-error').textContent = 'Veuillez renseigner les deux dates.';
    $('export-error').classList.remove('hidden');
    return;
  }
  if (debut > fin) {
    $('export-error').textContent = 'La date de début doit être avant la date de fin.';
    $('export-error').classList.remove('hidden');
    return;
  }

  const btn = $('btn-generate-pdf');
  setButtonLoading(btn, true, '⏳ Chargement des justificatifs…');

  try {
    const { data, error } = await db
      .from('deplacements')
      .select('*')
      .eq('user_id', currentUser.id)
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: true })
      .order('heure_depart', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      $('export-error').textContent = 'Aucun déplacement sur cette période.';
      $('export-error').classList.remove('hidden');
      return;
    }

    // Fetch des images en base64 pour les justificatifs
    const imagesMap = {};
    const entriesWithJustif = data.filter(e => e.justificatif_url);
    await Promise.all(entriesWithJustif.map(async entry => {
      try {
        const resp = await fetch(entry.justificatif_url);
        const blob = await resp.blob();
        const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        imagesMap[entry.id] = { dataUrl, format };
      } catch (_) {
        // Image non accessible, on continue sans elle
      }
    }));

    generatePDF(data, debut, fin, imagesMap);
    closeExportModal();
  } catch (err) {
    $('export-error').textContent = err.message || 'Erreur lors de la génération.';
    $('export-error').classList.remove('hidden');
  } finally {
    setButtonLoading(btn, false, '⬇ Générer le PDF');
  }
});

function generatePDF(entries, debut, fin, imagesMap) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const userName = currentUser.user_metadata?.full_name || currentUser.email;
  const dateDebut = formatDateFR(debut);
  const dateFin = formatDateFR(fin);
  const totalMontant = entries.reduce((s, e) => s + Number(e.montant), 0);
  const generatedAt = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // ── En-tête ──
  doc.setFillColor(44, 58, 74);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Note de frais de déplacements', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Généré le ${generatedAt}`, 14, 20);

  // ── Bloc info ──
  doc.setTextColor(44, 58, 74);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Collaborateur :', 14, 38);
  doc.setFont('helvetica', 'normal');
  doc.text(userName, 52, 38);

  doc.setFont('helvetica', 'bold');
  doc.text('Période :', 14, 45);
  doc.setFont('helvetica', 'normal');
  doc.text(`Du ${dateDebut} au ${dateFin}`, 52, 45);

  doc.setFont('helvetica', 'bold');
  doc.text('Nombre de déplacements :', 14, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(String(entries.length), 72, 52);

  // ── Ligne séparatrice ──
  doc.setDrawColor(196, 123, 26);
  doc.setLineWidth(0.5);
  doc.line(14, 57, 196, 57);

  // ── Tableau récapitulatif ──
  const rows = entries.map((e, i) => [
    String(i + 1),
    formatDateFR(e.date),
    e.lieu_depart || '—',
    e.lieu_arrivee || '—',
    e.heure_depart ? e.heure_depart.slice(0, 5) : '—',
    e.heure_arrivee ? e.heure_arrivee.slice(0, 5) : '—',
    Number(e.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €',
    e.justificatif_url ? 'p.' + (entries.indexOf(e) + 1) : '—',
  ]);

  doc.autoTable({
    startY: 62,
    head: [['#', 'Date', 'Départ', 'Arrivée', 'H. dép.', 'H. ret.', 'Montant', 'Justif.']],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [44, 58, 74] },
    headStyles: { fillColor: [44, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 244, 241] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 38 },
      3: { cellWidth: 38 },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 14, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Bloc total ──
  const finalY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(255, 248, 237);
  doc.setDrawColor(196, 123, 26);
  doc.setLineWidth(0.4);
  doc.roundedRect(130, finalY, 66, 14, 2, 2, 'FD');
  doc.setTextColor(196, 123, 26);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL REMBOURSABLE', 163, finalY + 5.5, { align: 'center' });
  doc.setFontSize(13);
  doc.text(totalMontant.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €', 163, finalY + 11.5, { align: 'center' });

  // ── Signatures ──
  const sigY = finalY + 24;
  doc.setTextColor(44, 58, 74);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Signature du collaborateur :', 14, sigY);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(14, sigY + 14, 80, sigY + 14);
  doc.text('Visa du responsable :', 110, sigY);
  doc.line(110, sigY + 14, 196, sigY + 14);

  // ── Pages justificatifs ──
  const entriesWithJustif = entries.filter(e => e.justificatif_url && imagesMap[e.id]);

  entriesWithJustif.forEach((entry, idx) => {
    doc.addPage();
    const imgNum = idx + 1;
    const totalImgs = entriesWithJustif.length;

    // En-tête page justificatif
    doc.setFillColor(44, 58, 74);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Justificatif ${imgNum}/${totalImgs}`, 14, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Note de frais · Du ${dateDebut} au ${dateFin}`, 196, 11, { align: 'right' });

    // Infos du déplacement
    doc.setTextColor(44, 58, 74);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Date :', 14, 26);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDateFR(entry.date), 32, 26);

    const route = [entry.lieu_depart, entry.lieu_arrivee].filter(Boolean).join(' → ') || 'Déplacement';
    doc.setFont('helvetica', 'bold');
    doc.text('Trajet :', 14, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(route, 34, 32, { maxWidth: 150 });

    const horaires = [
      entry.heure_depart ? `Dép. ${entry.heure_depart.slice(0,5)}` : null,
      entry.heure_arrivee ? `Ret. ${entry.heure_arrivee.slice(0,5)}` : null,
    ].filter(Boolean).join('  ·  ');
    if (horaires) {
      doc.setFont('helvetica', 'bold');
      doc.text('Horaires :', 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.text(horaires, 40, 38);
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Montant :', 14, 44);
    doc.setTextColor(196, 123, 26);
    doc.text(Number(entry.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €', 40, 44);
    doc.setTextColor(44, 58, 74);

    // Ligne séparatrice
    doc.setDrawColor(196, 123, 26);
    doc.setLineWidth(0.4);
    doc.line(14, 49, 196, 49);

    // Image du justificatif
    try {
      const { dataUrl, format } = imagesMap[entry.id];
      const imgX = 14;
      const imgY = 53;
      const maxW = 182;
      const maxH = 210;

      // Calculer les dimensions en gardant le ratio
      const img = new Image();
      img.src = dataUrl;
      let w = img.naturalWidth || 800;
      let h = img.naturalHeight || 600;
      const ratio = Math.min(maxW / w, maxH / h);
      w = w * ratio;
      h = h * ratio;

      doc.addImage(dataUrl, format, imgX, imgY, w, h);
    } catch (e) {
      doc.setFontSize(9);
      doc.setTextColor(180, 60, 40);
      doc.text('Impossible de charger l\'image.', 14, 60);
    }
  });

  // ── Pied de page toutes pages ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Frais Pro · Page ${i}/${pageCount}`, 105, 291, { align: 'center' });
  }

  const filename = `note-frais_${debut}_${fin}.pdf`;
  doc.save(filename);
}

function formatDateFR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/* ─── KEYBOARD SUPPORT ───────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('modal-export').classList.contains('hidden')) closeExportModal();
    else if (!$('modal-entry').classList.contains('hidden')) closeModal();
    else if (!$('modal-justif').classList.contains('hidden')) $('modal-justif').classList.add('hidden');
    else if (!$('day-panel').classList.contains('hidden')) closeDayPanel();
  }
});
