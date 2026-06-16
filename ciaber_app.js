// ============================================================
//  CIABER — Firebase directo (sin backend)
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDijZ5KYg1OPcSJnDsQh9pxtH_cr_xobRU",
  authDomain:        "workflow-equipo.firebaseapp.com",
  databaseURL:       "https://workflow-equipo-default-rtdb.firebaseio.com",
  projectId:         "workflow-equipo",
  storageBucket:     "workflow-equipo.firebasestorage.app",
  messagingSenderId: "974073018957",
  appId:             "1:974073018957:web:9200142d312802f74d3a04"
};
const DB_DATA    = 'ciaber/data';
const DB_USERS   = 'ciaber/usuarios';
const SUPER_ADMINS = ['mbottarelli@harf.com.ar', 'bottarellim@gmail.com', 'nicolasbottarelli@gmail.com'];

firebase.initializeApp(FIREBASE_CONFIG);
const fbAuth = firebase.auth();
const fbDB   = firebase.database();

function emailToKey(e) { return (e||'').toLowerCase().replace(/[.@+]/g, '_'); }

async function cargarUsuarioDB(email) {
  const key     = emailToKey(email);
  const isSuper = SUPER_ADMINS.includes(email.toLowerCase());
  let ud = null;
  try {
    const snap = await fbDB.ref(DB_USERS + '/' + key).once('value');
    ud = snap.val();
  } catch(e) { console.warn('No se pudo leer usuario DB:', e.message); }

  // Soporta formato viejo (rol) y nuevo (role)
  const roleFromDB = ud ? (ud.role || ud.rol || 'user') : 'user';
  const role = isSuper ? 'admin' : roleFromDB;

  if (!ud) {
    ud = { email: email.toLowerCase(), nombre: email.split('@')[0], role, permissions: null };
    try { await fbDB.ref(DB_USERS + '/' + key).set(ud); } catch(e) {}
  } else if (ud.rol && !ud.role) {
    // Migrar campo "rol" → "role"
    try { await fbDB.ref(DB_USERS + '/' + key).update({ role: roleFromDB }); } catch(e) {}
  }

  currentUser = {
    email:       ud.email || email.toLowerCase(),
    nombre:      ud.nombre || '',
    role,
    permissions: ud.permissions || null
  };
}

// ============================================================
// CONSTANTES
// ============================================================
const ESTADOS_CLIENTE = ['Activo', 'Potencial', 'Inactivo', 'Suspendido'];
const EC_CLASS = { Activo: 'ec-Activo', Potencial: 'ec-Potencial', Inactivo: 'ec-Inactivo', Suspendido: 'ec-Suspendido' };
const GRUPOS_TRABAJO = [
  { g: '— Común —', e: ['Sin Iniciar', 'En Relevamiento'] },
  { g: '— Camino 1: Con Presupuesto —', e: ['Presupuestado', 'Esperando Aprobación', 'En Ejecución', 'Avanzado', 'Terminado', 'Facturar', 'Cobrado'] },
  { g: '— Camino 2: De Palabra —', e: ['Aprobado de Palabra', 'En Ejecución sin Presupuesto', 'Avanzado sin Presupuesto', 'Terminado sin Presupuesto', 'Presupuestar', 'Aprobar', 'Facturar', 'Cobrado'] }
];
const ESTADOS_TRABAJO = [...new Set(GRUPOS_TRABAJO.flatMap(g => g.e))];
const ET_CLASS = {
  'Sin Iniciar': 'etj-SinIniciar', 'En Relevamiento': 'etj-Gris',
  'Presupuestado': 'etj-Presupuestado', 'Esperando Aprobación': 'etj-IniciadoSinAprobar',
  'En Ejecución': 'etj-Iniciado', 'Avanzado': 'etj-AvanzadoFaltaTerminar',
  'Terminado': 'etj-Terminado', 'Facturar': 'etj-Cobrado', 'Cobrado': 'etj-Cobrado',
  'Aprobado de Palabra': 'etj-IniciadoSinAprobar', 'En Ejecución sin Presupuesto': 'etj-AvanzadoFaltaTerminar',
  'Avanzado sin Presupuesto': 'etj-AvanzadoFaltaTerminar', 'Terminado sin Presupuesto': 'etj-Terminado',
  'Presupuestar': 'etj-Presupuestado', 'Aprobar': 'etj-Aprobado'
};
const COLOR_HEX = {
  amarillo: '#f59e0b', rojo: '#dc2626', verde: '#10b981', violeta: '#7c3aed',
  gris: '#475569', celeste: '#0ea5e9', naranja: '#f97316', turquesa: '#0d9488', esmeralda: '#059669'
};
const ET_COLOR = {
  'Sin Iniciar': null, 'En Relevamiento': 'gris', 'Presupuestado': 'violeta',
  'Esperando Aprobación': 'amarillo', 'En Ejecución': 'celeste', 'Avanzado': 'naranja',
  'Terminado': 'verde', 'Facturar': 'turquesa', 'Cobrado': 'turquesa',
  'Aprobado de Palabra': 'amarillo', 'En Ejecución sin Presupuesto': 'rojo',
  'Avanzado sin Presupuesto': 'naranja', 'Terminado sin Presupuesto': 'esmeralda',
  'Presupuestar': 'violeta', 'Aprobar': 'esmeralda'
};
const OPCIONES_ABONO = ['Sin Abono', 'Abono'];
const ESTADOS = ['Pendiente', 'En proceso', 'Terminado'];
const PRIORIDADES = ['', 'Alta', 'Media', 'Baja'];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let clientes = [];
let vistaActual = 'clientes';
let clienteActual = null;
let _saving = false;
let _pendingSave = false;
let _confirmedJson = null;
const _selected = new Set();
const _history = [];
const expandedKeys = new Set();

// Usuario actual
let currentUser = { email: '', nombre: '', role: 'user', permissions: null };

// ============================================================
// AUTH
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('q').oninput = renderVista;
  fbAuth.onAuthStateChanged(async user => {
    if (user) {
      try {
        await cargarUsuarioDB(user.email);
        showApp(currentUser.email, currentUser.role, currentUser.permissions);
        await initData();
      } catch(e) {
        console.error('Error iniciando sesión:', e);
      }
    } else {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      const btn = document.getElementById('l-btn');
      if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
    }
  });
});

function showApp(email, role, permissions) {
  currentUser = { email, nombre: '', role: role || 'user', permissions: permissions || null };
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-email').textContent = email;
  const btnU = document.getElementById('btn-users');
  if (btnU) btnU.style.display = (role === 'admin') ? 'inline-flex' : 'none';
}

async function doLogin() {
  const btn = document.getElementById('l-btn');
  const err = document.getElementById('l-err');
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) { err.textContent = 'Completá email y contraseña.'; return; }
  btn.textContent = 'Ingresando...';
  btn.disabled = true;
  err.textContent = '';
  try {
    await fbAuth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    err.textContent = 'Email o contraseña incorrectos.';
    btn.textContent = 'Ingresar';
    btn.disabled = false;
  }
}

function doLogout() {
  clearTimeout(window._it);
  _saving = false;
  _pendingSave = false;
  clientes = [];
  localStorage.removeItem('ciaber_v2');
  document.getElementById('l-email').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('l-err').textContent = '';
  fbAuth.signOut();
}

// ============================================================
// DATOS — HELPERS
// ============================================================
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fixClientes(arr) {
  if (!Array.isArray(arr)) return [];
  arr.forEach(c => {
    if (!c.id) c.id = newId();
    if (!c.estado) c.estado = 'Activo';
    if (!c.proyectos) c.proyectos = [];
    c.proyectos.forEach(p => {
      if (!p.id) p.id = newId();
      if (!p.adjuntos) p.adjuntos = [];
      if (!p.tareas) p.tareas = [];
      if (!p.subpuntos) p.subpuntos = [];
      if (p.fechaEstimada == null) p.fechaEstimada = '';
      p.tareas.forEach(t => {
        if (!t.adjuntos) t.adjuntos = [];
        if (!t.subtareas) t.subtareas = [];
        if (t.fechaEstimada == null) t.fechaEstimada = '';
        t.subtareas.forEach(st => {
          if (!st.adjuntos) st.adjuntos = [];
          if (st.fechaEstimada == null) st.fechaEstimada = '';
        });
      });
      p.subpuntos.forEach(s => {
        if (!s.id) s.id = newId();
        if (!s.tareas) s.tareas = [];
        if (s.fechaEstimada == null) s.fechaEstimada = '';
        s.tareas.forEach(t => {
          if (!t.adjuntos) t.adjuntos = [];
          if (!t.subtareas) t.subtareas = [];
          if (t.fechaEstimada == null) t.fechaEstimada = '';
          t.subtareas.forEach(st => {
            if (!st.adjuntos) st.adjuntos = [];
            if (st.fechaEstimada == null) st.fechaEstimada = '';
          });
        });
      });
    });
    renumerarProyectos(c.proyectos);
  });
  return arr;
}

// Normaliza la prioridad de los proyectos de un cliente a enteros 1..N
// consecutivos, respetando el orden relativo que ya tuvieran (los que no
// tenían número quedan al final). Se llama siempre que la lista cambia,
// así nunca queda un valor manual ni un hueco.
function renumerarProyectos(arr) {
  if (!arr || !arr.length) return;
  const sorted = [...arr].sort((a, b) => {
    const oa = a.orden != null && a.orden !== '' && !isNaN(+a.orden) ? +a.orden : 9999;
    const ob = b.orden != null && b.orden !== '' && !isNaN(+b.orden) ? +b.orden : 9999;
    return oa - ob;
  });
  sorted.forEach((p, i) => { p.orden = i + 1; });
}

function migrarDesdeFormatoViejo(viejos) {
  const c = { id: newId(), nombre: 'Ciaber', estado: 'Activo', nota: '', color: null, proyectos: [] };
  c.proyectos = viejos.map(p => ({
    id: newId(), nombre: p.nombre || '', estadoTrabajo: p.estadoTrabajo || 'Sin Iniciar',
    abono: p.abono || 'Sin Abono', color: p.color || null, nota: p.nota || '',
    adjuntos: [], fechaTerminado: p.fechaTerminado || null, fechaEstimada: '',
    tareas: (p.tareas || []).map(t => ({
      id: t.id, tarea: t.tarea || '', estado: t.estado || 'Pendiente', prioridad: t.prioridad || '',
      fechaEstimada: '', adjuntos: [],
      subtareas: (t.subtareas || []).map(st => ({
        id: st.id, tarea: st.tarea || '', estado: st.estado || 'Pendiente', prioridad: st.prioridad || '',
        fechaEstimada: '', adjuntos: []
      }))
    })),
    subpuntos: (p.subpuntos || []).map(s => ({
      id: newId(), nombre: s.nombre || '', desc: s.desc || '', fechaEstimada: '',
      tareas: (s.tareas || []).map(t => ({
        id: t.id, tarea: t.tarea || '', estado: t.estado || 'Pendiente', prioridad: t.prioridad || '',
        fechaEstimada: '', adjuntos: [],
        subtareas: (t.subtareas || []).map(st => ({
          id: st.id, tarea: st.tarea || '', estado: st.estado || 'Pendiente', prioridad: st.prioridad || '',
          fechaEstimada: '', adjuntos: []
        }))
      }))
    }))
  }));
  return [c];
}

// ============================================================
// CARGAR DATOS
// ============================================================
let _initVersion = 0;

async function initData(retryN = 0) {
  const myVersion = retryN === 0 ? ++_initVersion : _initVersion;

  // Mostrar datos locales inmediatamente mientras carga del servidor
  if (retryN === 0) {
    const local = localStorage.getItem('ciaber_v2');
    if (local) {
      try {
        const d = JSON.parse(local);
        if (d.clientes?.length) { clientes = fixClientes(d.clientes); renderVista(); }
      } catch(e) {}
    }
    setSyncDot(false, 'Cargando...');
  }

  if (myVersion !== _initVersion) return;

  try {
    const snap = await fbDB.ref(DB_DATA).once('value');
    const data = snap.val() || { clientes: [], updated_at: null };

    if (myVersion !== _initVersion) return;

    if (data.clientes?.length) {
      // Comparar timestamp local vs servidor — usar el más nuevo
      let useServer = true;
      try {
        const localRaw = localStorage.getItem('ciaber_v2');
        if (localRaw) {
          const localData = JSON.parse(localRaw);
          const localTime  = localData.savedAt || 0;
          const serverTime = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          if (localTime > serverTime + 5000 && localData.clientes?.length) {
            clientes = fixClientes(localData.clientes);
            useServer = false;
            setTimeout(() => saveToServer(), 1000); // sync local → servidor
          }
        }
      } catch(e) {}
      if (useServer) clientes = fixClientes(data.clientes);
    } else {
      // Servidor vacío — migrar desde localStorage o crear estructura inicial
      const localV2   = localStorage.getItem('ciaber_v2');
      const localViejo = localStorage.getItem('ciaber_puntos_v3');
      if (localV2) {
        try { const d = JSON.parse(localV2); if (d.clientes?.length) clientes = fixClientes(d.clientes); } catch(e) {}
      } else if (localViejo) {
        try { clientes = migrarDesdeFormatoViejo(JSON.parse(localViejo)); } catch(e) {}
      }
      if (!clientes.length) {
        clientes = [{ id: newId(), nombre: 'Ciaber', estado: 'Activo', nota: '', color: null, proyectos: [] }];
      }
      await saveToServer();
    }

    if (myVersion !== _initVersion) return;

    localStorage.setItem('ciaber_v2', JSON.stringify({ clientes, savedAt: Date.now() }));
    _confirmedJson = JSON.stringify(clientes);
    setSyncDot(true);
    renderVista();
  } catch(e) {
    console.error('Error cargando datos:', e);
    if (myVersion !== _initVersion) return;
    if (retryN < 5) {
      setSyncDot(false, 'Reintentando (' + (retryN + 1) + '/5)...');
      setTimeout(() => initData(retryN + 1), Math.min((retryN + 1) * 2000, 10000));
    } else {
      setSyncDot(false, 'Sin conexión');
      showSaved('⚠ Servidor no disponible — datos locales');
    }
  }
}

async function recuperarDatos() {
  setSyncDot(false, 'Recuperando...');
  showSaved('⏳ Recuperando...');
  _initVersion++;
  await initData();
}

// ============================================================
// GUARDAR DATOS
// ============================================================
async function saveToServer() {
  if (!clientes || !clientes.length) {
    console.warn('saveToServer abortado: clientes vacío');
    return false;
  }
  if (_saving) { _pendingSave = true; return false; }
  _saving = true;
  const safetyTimer = setTimeout(() => { _saving = false; _pendingSave = false; }, 20000);
  let ok = false;
  try {
    const payload = { clientes, updated_at: new Date().toISOString() };
    await fbDB.ref(DB_DATA).set(payload);
    localStorage.setItem('ciaber_v2', JSON.stringify({ clientes, savedAt: Date.now() }));
    _confirmedJson = JSON.stringify(clientes);
    setSyncDot(true);
    ok = true;
  } catch(e) {
    console.error('Error guardando:', e);
    showSaved('⚠ Error al guardar');
    setSyncDot(false, 'Error al guardar');
  }
  clearTimeout(safetyTimer);
  _saving = false;
  if (_pendingSave) { _pendingSave = false; saveToServer(); }
  return ok;
}

function save() {
  // Guardar en localStorage inmediatamente (cache offline)
  if (clientes && clientes.length) {
    localStorage.setItem('ciaber_v2', JSON.stringify({ clientes, savedAt: Date.now() }));
  }
  showSaved('⏳ Guardando...');
  saveToServer().then(ok => {
    if (ok) showSaved('✓ Guardado ' + new Date().toLocaleTimeString());
    else {
      const s = document.getElementById('saved');
      if (s && s.textContent === '⏳ Guardando...') showSaved('⚠ Sin conexión — guardado local');
    }
  });
}

// ============================================================
// UI HELPERS
// ============================================================
function showSaved(msg) {
  const s = document.getElementById('saved');
  if (!s) return;
  s.textContent = msg;
  clearTimeout(window._st);
  if (!msg.startsWith('⏳')) window._st = setTimeout(() => s.textContent = '', 2500);
}

function setSyncDot(on, msg) {
  const d = document.getElementById('sync-dot');
  const l = document.getElementById('sync-label');
  if (d) d.className = 'sync-dot' + (on ? '' : ' off');
  if (l) { l.textContent = msg || (on ? '' : 'Sin conexión'); l.className = 'sync-label' + (on ? '' : ' err'); }
}

async function reconectar() {
  if (!fbAuth.currentUser) { setSyncDot(false, 'Sin sesión'); return; }
  setSyncDot(false, 'Reconectando...');
  await initData();
}

// ============================================================
// ADJUNTOS — SERVIDOR LOCAL
// ============================================================
function fileToBase64(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

async function handleUpload(event, refTipo, refId, adjArr) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  if (file.size > 4 * 1024 * 1024) { alert('Archivo muy grande (máx 4MB).'); return; }
  showSaved('⏳ Subiendo archivo...');
  try {
    const data = await fileToBase64(file);
    const ext  = file.name.split('.').pop().toLowerCase();
    adjArr.push({ id: newId(), nombre: file.name, data, ext, ts: Date.now() });
    await saveToServer();
    showSaved('✓ Archivo subido');
    renderVista();
  } catch(e) {
    showSaved('⚠ Error subiendo archivo');
    console.error(e);
  }
}

function openFile(dataUrl, nombre) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = nombre || 'archivo';
  a.target = '_blank';
  a.click();
}

function openAdjunto(ci, pi, ai) {
  const adj = clientes[ci]?.proyectos?.[pi]?.adjuntos?.[ai];
  if (adj && adj.data) openFile(adj.data, adj.nombre);
}

function toggleNotaTarea(base, btn) {
  const taskNode = btn.closest('.node.task');
  const treeTx = taskNode.querySelector('.tree-tx');
  let box = treeTx.querySelector('.nota-tarea-box');
  if (box) {
    box.remove();
  } else {
    box = document.createElement('div');
    box.className = 'nota-tarea-box';
    const ta = document.createElement('textarea');
    ta.className = 'nota-tarea-txt';
    ta.dataset.path = base;
    ta.dataset.k = 'notas';
    ta.placeholder = 'Notas de la tarea...';
    ta.value = '';
    box.appendChild(ta);
    treeTx.appendChild(box);
    ta.focus();
  }
}

function delArchivo(adjArr, idx) {
  const adj = adjArr[idx];
  if (!adj) return;
  if (!confirm(`¿Eliminar "${adj.nombre}"?`)) return;
  adjArr.splice(idx, 1);
  save();
  renderVista();
}

function icono(extOrMime) {
  if (!extOrMime) return '📎';
  const s = extOrMime.toLowerCase();
  if (s.startsWith('image') || ['png','jpg','jpeg','gif','webp','svg'].includes(s)) return '🖼️';
  if (s.includes('pdf') || s === 'pdf') return '📄';
  if (s.includes('word') || s.includes('document') || ['doc','docx'].includes(s)) return '📝';
  if (s.includes('sheet') || s.includes('excel') || ['xls','xlsx'].includes(s)) return '📊';
  if (['zip','rar','7z'].includes(s)) return '📦';
  return '📎';
}

// ============================================================
// HELPERS RENDER
// ============================================================
const ESC = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const opt = (arr, v) => arr.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o || '—'}</option>`).join('');
function optTrabajo(val) {
  return GRUPOS_TRABAJO.map(g =>
    `<optgroup label="${g.g}">${g.e.map(e => `<option value="${e}"${e === val ? ' selected' : ''}>${e}</option>`).join('')}</optgroup>`
  ).join('');
}

function pctOf(arr) {
  let t = 0, h = 0;
  arr.forEach(x => {
    t++; if (x.estado === 'Terminado') h++;
    (x.subtareas || []).forEach(s => { t++; if (s.estado === 'Terminado') h++; });
  });
  return t ? Math.round(h * 100 / t) : 0;
}

function allTareasProy(p) {
  return [...(p.tareas || []), ...(p.subpuntos || []).flatMap(s => s.tareas || [])];
}

// ============================================================
// RENDER TAREAS
// ============================================================
function renderTareas(tareas, ci, pi, kind, si) {
  const q = document.getElementById('q');
  const f = q ? q.value.toLowerCase() : '';
  let html = `<div class="tree">`;
  tareas.forEach((t, ti) => {
    const vis = !f || t.tarea.toLowerCase().includes(f) || (t.subtareas || []).some(st => st.tarea.toLowerCase().includes(f));
    if (!vis) return;
    const base  = kind === 's' ? `${ci}|s|${pi}|${si}|${ti}` : `${ci}|t|${pi}|${ti}`;
    const refId = t.id || base;
    const rowStyle = t.estado === 'Terminado'
      ? 'background:#d1fae5;border-left:2px solid #10b981'
      : t.estado === 'En proceso' ? 'background:#fff7ed;border-left:2px solid #f97316' : '';
    html += `<div class="node task" style="${rowStyle}">
      <span class="tree-id">${ESC(t.id)}</span>
      <div class="tree-tx">
        <textarea class="txt" data-path="${base}" data-k="tarea">${ESC(t.tarea)}</textarea>
      </div>
      <div class="tree-meta">
        <input type="date" class="fecha-est" data-path="${base}" data-k="fechaEstimada" value="${ESC(t.fechaEstimada || '')}" title="Fecha estimada">
        <input type="time" class="hora-est" data-path="${base}" data-k="horaEstimada" value="${ESC(t.horaEstimada || '')}" title="Horario">
        <select class="est" data-path="${base}" data-k="estado">${opt(ESTADOS, t.estado)}</select>
        <select class="pri" data-path="${base}" data-k="prioridad">${opt(PRIORIDADES, t.prioridad)}</select>
        <button class="btn-sub" onclick="addSub('${base}')">+sub</button>
        <button class="btn-move" onclick="moveTarea('${base}',-1)" title="Subir">▲</button>
        <button class="btn-move" onclick="moveTarea('${base}',1)" title="Bajar">▼</button>
        <button class="del" onclick="delTarea('${base}')">✕</button>
      </div></div>`;
    if ((t.subtareas || []).length) {
      html += `<div style="margin-left:14px">`;
      t.subtareas.forEach((st, sti) => {
        const spath   = `${base}|${sti}`;
        const stStyle = st.estado === 'Terminado' ? 'background:#d1fae5;border-left:2px solid #10b981' : '';
        html += `<div class="node subtask" style="${stStyle}">
          <span class="tree-id">${ESC(st.id || '└')}</span>
          <div class="tree-tx"><textarea class="txt" data-path="${spath}" data-k="tarea">${ESC(st.tarea)}</textarea></div>
          <div class="tree-meta">
            <input type="date" class="fecha-est" data-path="${spath}" data-k="fechaEstimada" value="${ESC(st.fechaEstimada || '')}" title="Fecha estimada">
            <input type="time" class="hora-est" data-path="${spath}" data-k="horaEstimada" value="${ESC(st.horaEstimada || '')}" title="Horario">
            <select class="est" data-path="${spath}" data-k="estado">${opt(ESTADOS, st.estado)}</select>
            <select class="pri" data-path="${spath}" data-k="prioridad">${opt(PRIORIDADES, st.prioridad)}</select>
            <button class="btn-move" onclick="moveSub('${spath}',-1)" title="Subir">▲</button>
            <button class="btn-move" onclick="moveSub('${spath}',1)" title="Bajar">▼</button>
            <button class="del" onclick="delSub('${spath}')">✕</button>
          </div></div>`;
      });
      html += `</div>`;
    }
  });
  html += `</div>`;
  return html;
}

// ============================================================
// RENDER PROYECTO BODY
// ============================================================
function renderProyectoBody(p, ci, pi) {
  const total   = allTareasProy(p).length;
  const adjPath = `Promise.resolve(clientes[${ci}].proyectos[${pi}].adjuntos)`;
  const uploadId = 'pup_' + p.id;
  const adjItems = (p.adjuntos || []).map((a, i) => `
    <div class="adj-item">
      <span>${icono(a.ext || a.tipo_mime)}</span>
      <a onclick="openAdjunto(${ci},${pi},${i})" style="cursor:pointer" title="${ESC(a.nombre)}">${ESC(a.nombre)}</a>
      <span class="adj-del-btn" onclick="${adjPath}.then(arr=>delArchivo(arr,${i}))">✕</span>
    </div>`).join('');

  let tareasHtml;
  if (p.subpuntos && p.subpuntos.length) {
    tareasHtml = p.subpuntos.map((s, si) => {
      const spKey = `sp-${ci}-${pi}-${si}`;
      const spOpen = expandedKeys.has(spKey);
      return `
      <div class="node subp-as-task">
        <span class="toggle-sp${spOpen ? '' : ' col'} spat-toggle" onclick="toggleSubp(this,${ci},${pi},${si})">▼</span>
        <div class="tree-tx">
          <input class="spat-name" data-path="${ci}|sp|${pi}|${si}" data-k="nombreSub" value="${ESC(s.nombre)}" placeholder="Nombre del subproyecto...">
        </div>
        <div class="tree-meta">
          <input type="date" class="fecha-est" data-path="${ci}|sp|${pi}|${si}" data-k="fechaEstimada" value="${ESC(s.fechaEstimada || '')}" title="Fecha estimada">
          <button class="add" style="font-size:10px;padding:1px 6px" onclick="addTarea('s|${ci}|${pi}|${si}')">+ Tarea</button>
          <button class="btn-save" onclick="guardarAhora(this)">✓</button>
          <button class="del" onclick="delSubpunto(${ci},${pi},${si})">✕</button>
        </div>
      </div>
      <div class="${spOpen ? 'spat-children' : 'spat-children collapsed-ch'}">
        ${renderTareas(s.tareas || [], ci, pi, 's', si)}
      </div>`;
    }).join('');
  } else {
    tareasHtml = renderTareas(p.tareas || [], ci, pi, 't');
  }

  return `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <label style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px">📅 Fecha estimada
        <input type="date" class="fecha-est" data-path="${ci}|p|${pi}" data-k="fechaEstimada" value="${ESC(p.fechaEstimada || '')}">
      </label>
    </div>
    <div>${tareasHtml}</div>
    <div class="nota-box"><textarea data-path="${ci}|p|${pi}" data-k="nota" placeholder="Escribir nota del proyecto...">${ESC(p.nota || '')}</textarea></div>
    <div class="adj-section">
      <div class="adj-title">📎 Adjuntos del proyecto
        <button class="btn-adj" onclick="document.getElementById('${uploadId}').click()">+ Adjuntar</button>
        <input type="file" id="${uploadId}" class="adj-upload-inp" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          onchange="${adjPath}.then(arr=>handleUpload(event,'proyecto','${p.id}',arr))">
      </div>
      <div class="adj-list">${adjItems}</div>
    </div>`;
}

// ============================================================
// RENDER VISTAS
// ============================================================
function renderClientes() {
  document.getElementById('btn-add').textContent = '+ Nuevo Cliente';
  document.getElementById('filtroAbono').style.display = 'none';
  document.getElementById('wrapVerTerminados').style.display = 'none';
  const filtroSel = document.getElementById('filtroEstado');
  if (filtroSel.options.length <= 1) {
    ESTADOS_CLIENTE.forEach(e => {
      const o = document.createElement('option');
      o.value = e; o.textContent = e;
      filtroSel.appendChild(o);
    });
  }
  const q   = document.getElementById('q').value.toLowerCase();
  const fv  = filtroSel.value;
  const lista = clientes.filter(c =>
    (!fv || (c.estado || 'Activo') === fv) && (!q || c.nombre.toLowerCase().includes(q))
  );
  document.getElementById('filtroCount').textContent = fv ? `${lista.length} cliente${lista.length !== 1 ? 's' : ''}` : '';
  document.getElementById('breadcrumb').innerHTML = `<span class="cur">Clientes</span>`;

  if (!lista.length) {
    if (!clientes.length) {
      try {
        const local = localStorage.getItem('ciaber_v2');
        if (local) {
          const d = JSON.parse(local);
          if (d.clientes?.length) { clientes = fixClientes(d.clientes); renderVista(); return; }
        }
      } catch(e) {}
    }
    document.getElementById('root').innerHTML = `<div class="empty"><div class="empty-icon">🏢</div><p>No hay clientes. Hacé clic en <b>+ Nuevo Cliente</b>.</p></div>`;
    return;
  }
  document.getElementById('root').innerHTML = `<div class="lista-c">${lista.map(c => {
    const ci    = clientes.indexOf(c);
    const strip = COLOR_HEX[c.color] || '#305496';
    return `<div class="it-wrap it-cliente" data-ek="c-${ci}">
      <div class="it-row" onclick="if(event.target.tagName==='INPUT'||event.target.tagName==='BUTTON'||event.target.tagName==='SELECT')return;abrirCliente(${ci})">
        <div class="it-strip" style="background:${strip}"></div>
        <span class="it-arrow" style="transform:rotate(90deg);cursor:default">▶</span>
        <input class="nm-c" data-path="${ci}|c" data-k="nombre" value="${ESC(c.nombre)}" onclick="event.stopPropagation()">
        <div class="it-meta">
          <select class="est-cliente ${EC_CLASS[c.estado || 'Activo']}" data-path="${ci}|c" data-k="estadoCliente" onclick="event.stopPropagation()">${opt(ESTADOS_CLIENTE, c.estado || 'Activo')}</select>
          <span class="it-count">${c.proyectos.length} proy.</span>
          <button class="del it-del" onclick="event.stopPropagation();delCliente(${ci})">✕</button>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
  bindEvents();
}

function renderProyectos(ci) {
  const c = clientes[ci];
  if (!c) { vistaActual = 'clientes'; clienteActual = null; renderClientes(); return; }
  _exportCi = ci;
  document.getElementById('btn-add').textContent = '+ Nuevo Proyecto';
  document.getElementById('filtroAbono').style.display = '';
  document.getElementById('wrapVerTerminados').style.display = 'flex';
  const filtroSel = document.getElementById('filtroEstado');
  const savedFv   = filtroSel.value;
  filtroSel.innerHTML = '<option value="">📋 Todos los estados</option>';
  GRUPOS_TRABAJO.forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.g;
    g.e.forEach(e => {
      const o = document.createElement('option');
      o.value = e; o.textContent = e;
      og.appendChild(o);
    });
    filtroSel.appendChild(og);
  });
  if (savedFv) filtroSel.value = savedFv;
  const q    = document.getElementById('q').value.toLowerCase();
  const fv   = filtroSel.value;
  const fAb  = document.getElementById('filtroAbono').value;
  const verTerminados = document.getElementById('chkVerTerminados').checked;
  const lista = c.proyectos.filter(p => {
    // Por defecto los proyectos terminados quedan ocultos; se ven si se
    // activa "Ver terminados" o si se filtra explícitamente por ese estado.
    if (!verTerminados && !fv && esProyectoTerminado(p)) return false;
    if (fv  && (p.estadoTrabajo || 'Sin Iniciar') !== fv) return false;
    if (fAb && (p.abono || 'Sin Abono') !== fAb) return false;
    if (q   && !p.nombre.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const oa = a.orden != null && a.orden !== '' ? +a.orden : 9999;
    const ob = b.orden != null && b.orden !== '' ? +b.orden : 9999;
    return oa - ob;
  });
  const ocultosTerminados = (!verTerminados && !fv) ? c.proyectos.filter(esProyectoTerminado).length : 0;
  document.getElementById('filtroCount').textContent = (fv || fAb)
    ? `${lista.length} proyecto${lista.length !== 1 ? 's' : ''}`
    : (ocultosTerminados ? `${ocultosTerminados} terminado${ocultosTerminados !== 1 ? 's' : ''} oculto${ocultosTerminados !== 1 ? 's' : ''}` : '');
  document.getElementById('breadcrumb').innerHTML = `<a onclick="volverClientes()">Clientes</a><span class="sep">›</span><span class="cur">${ESC(c.nombre)}</span>`;

  if (!lista.length) {
    document.getElementById('root').innerHTML = `<div class="empty"><div class="empty-icon">📁</div><p>${ocultosTerminados ? 'Todos los proyectos están terminados. Activá "Ver terminados" para verlos, o ' : ''}Hacé clic en <b>+ Nuevo Proyecto</b>.</p></div>`;
    return;
  }
  document.getElementById('root').innerHTML = `<div class="lista-c">${lista.map(p => {
    const pi    = c.proyectos.indexOf(p);
    const t     = allTareasProy(p);
    const total = t.length + t.reduce((a, x) => a + (x.subtareas || []).length, 0);
    const pct   = pctOf(t);
    const strip = COLOR_HEX[p.color] || '#305496';
    return `<div class="it-wrap" data-ek="p-${ci}-${pi}">
      <div class="it-row">
        <div class="it-strip" style="background:${strip}"></div>
        <span class="it-arrow" onclick="toggleExpand(event)" style="cursor:pointer;padding:12px 6px">▶</span>
        <input class="nm-c" data-path="${ci}|p|${pi}" data-k="nombre" value="${ESC(p.nombre)}" onclick="event.stopPropagation()">
        <div class="it-meta">
          <span class="prio-orden-ro" title="Prioridad (1 = más urgente) — se asigna solo con las flechas">${p.orden != null && p.orden !== '' ? p.orden : '—'}</span>
          <select class="est-trabajo ${ET_CLASS[p.estadoTrabajo || 'Sin Iniciar'] || 'etj-SinIniciar'}" data-path="${ci}|p|${pi}" data-k="estadoTrabajo" onclick="event.stopPropagation()">${optTrabajo(p.estadoTrabajo || 'Sin Iniciar')}</select>
          <select class="est-abono ${(p.abono || 'Sin Abono') === 'Abono' ? 'abono-Con' : 'abono-Sin'}" data-path="${ci}|p|${pi}" data-k="abono" onclick="event.stopPropagation()">${opt(OPCIONES_ABONO, p.abono || 'Sin Abono')}</select>
          <span class="it-pct">${pct}% · ${total}t</span>
          ${p.fechaTerminado ? `<span class="it-fecha">✓ ${p.fechaTerminado}</span>` : ''}
          <button class="btn-save it-del" onclick="event.stopPropagation();guardarAhora(this)" title="Guardar proyecto">✓</button>
          <button class="add it-del" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();quickAddTarea(${ci},${pi})" title="Nueva tarea">+Tarea</button>
          <button class="btn-move it-del" onclick="event.stopPropagation();moveProyecto(${ci},${pi},-1)" title="Subir proyecto">▲</button>
          <button class="btn-move it-del" onclick="event.stopPropagation();moveProyecto(${ci},${pi},1)" title="Bajar proyecto">▼</button>
          <input type="checkbox" class="sel-cb it-del" data-sel="p|${ci}|${pi}" onclick="event.stopPropagation();toggleSel(this)" title="Seleccionar para eliminar">
          <button class="del it-del" onclick="event.stopPropagation();delProyecto(${ci},${pi})" title="Eliminar proyecto">✕</button>
        </div>
      </div>
      <div class="it-body" style="display:none">${renderProyectoBody(p, ci, pi)}</div>
    </div>`;
  }).join('')}</div>`;
  bindEvents();
}

let _exportCi = null;
function exportarExcel() {
  if (_exportCi == null) return;
  const c = clientes[_exportCi];
  if (!c) return;
  const rows = [['Proyecto','Estado','Abono','Tarea','Est. Tarea','Prioridad','Vencimiento','Notas']];
  (c.proyectos || []).forEach(p => {
    const tareas = [...(p.tareas||[]), ...(p.subpuntos||[]).flatMap(s=>s.tareas||[])];
    if (!tareas.length) {
      rows.push([p.nombre, p.estadoTrabajo, p.abono||'', '', '', '', '', p.nota||'']);
    } else {
      tareas.forEach((t, ti) => {
        rows.push([
          ti===0?p.nombre:'', ti===0?p.estadoTrabajo:'', ti===0?(p.abono||''):'',
          t.tarea||'', t.estado||'', t.prioridad||'', t.fechaEstimada||'',
          ti===0?(p.nota||''):''
        ]);
      });
    }
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, c.nombre.slice(0,31));
  XLSX.writeFile(wb, c.nombre + '.xlsx');
}

function abrirCliente(ci) { vistaActual = 'proyectos'; clienteActual = ci; renderVista(); }

function volverClientes() {
  vistaActual  = 'clientes';
  clienteActual = null;
  _exportCi = null;
  document.getElementById('filtroEstado').innerHTML = '<option value="">📋 Todos los estados</option>';
  document.getElementById('filtroAbono').style.display = 'none';
  document.getElementById('wrapVerTerminados').style.display = 'none';
  renderVista();
}

// Un proyecto se considera "terminado" cuando ya no requiere trabajo activo
// (coincide con el criterio usado en el calendario para tachar items).
function esProyectoTerminado(p) {
  const e = p.estadoTrabajo;
  return e === 'Terminado' || e === 'Cobrado' || e === 'Terminado sin Presupuesto';
}

// ============================================================
// ESTADO EXPANDIDO
// ============================================================
function restoreExpanded() {
  document.querySelectorAll('.it-wrap[data-ek]').forEach(w => {
    if (expandedKeys.has(w.dataset.ek)) {
      const row  = w.querySelector('.it-row');
      const body = w.querySelector('.it-body');
      if (row)  row.classList.add('it-open');
      if (body) body.style.display = 'block';
    }
  });
  document.querySelectorAll('.tareas-toggle[data-tkey]').forEach(tog => {
    if (expandedKeys.has(tog.dataset.tkey)) {
      tog.classList.add('t-open');
      const sib = tog.parentElement ? tog.parentElement.nextElementSibling : null;
      if (sib) sib.style.display = 'block';
    }
  });
}

function toggleExpand(ev) {
  ev.stopPropagation();
  const wrap   = ev.currentTarget.closest('.it-wrap');
  const row    = wrap.querySelector('.it-row');
  const body   = wrap.querySelector('.it-body');
  const isOpen = row.classList.contains('it-open');
  row.classList.toggle('it-open', !isOpen);
  if (body) body.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) expandedKeys.add(wrap.dataset.ek);
  else expandedKeys.delete(wrap.dataset.ek);
}

function toggleTareas(tog) {
  const key    = tog.dataset.tkey;
  const isOpen = tog.classList.contains('t-open');
  tog.classList.toggle('t-open', !isOpen);
  const tareasDiv = tog.parentElement ? tog.parentElement.nextElementSibling : null;
  if (tareasDiv) tareasDiv.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) expandedKeys.add(key);
  else expandedKeys.delete(key);
}

function toggleSubp(btn, ci, pi, si) {
  const key = `sp-${ci}-${pi}-${si}`;
  const contentDiv = btn.parentElement.nextElementSibling;
  const isOpen = !contentDiv.classList.contains('collapsed-ch');
  btn.classList.toggle('col', isOpen);
  contentDiv.classList.toggle('collapsed-ch', isOpen);
  if (isOpen) expandedKeys.delete(key);
  else expandedKeys.add(key);
}

function renderVista() {
  if (vistaActual === 'proyectos' && clienteActual != null) renderProyectos(clienteActual);
  else renderClientes();
  restoreExpanded();
  if (_calVisible) renderCal();
}

// ============================================================
// EVENTOS DE EDICIÓN (delegación)
// ============================================================
function _onRootChange(ev) {
  const t = ev.target;
  if (!t.dataset.path) return;
  applyEdit(t.dataset.path, t.dataset.k, t.value);
  save();
  renderVista();
}

function _onRootInput(ev) {
  const t = ev.target;
  if (!t.dataset.path || t.tagName === 'SELECT') return;
  applyEdit(t.dataset.path, t.dataset.k, t.value);
  clearTimeout(window._it);
  window._it = setTimeout(save, 8000);
}

let _eventsBound = false;
function bindEvents() {
  if (_eventsBound) return;
  document.getElementById('root').addEventListener('change', _onRootChange);
  document.getElementById('root').addEventListener('input',  _onRootInput);
  _eventsBound = true;
}

function applyEdit(path, k, val) {
  try {
    const p = path.split('|'), ci = +p[0], c = clientes[ci];
    if (!c) return;
    if (p[1] === 'c') {
      if (k === 'nombre') c.nombre = val;
      else if (k === 'estadoCliente') c.estado = val;
      else if (k === 'notaCliente') c.nota = val;
      return;
    }
    if (p[1] === 'p') {
      const pi = +p[2], pr = c.proyectos[pi]; if (!pr) return;
      if (k === 'nombre') pr.nombre = val;
      else if (k === 'nota') pr.nota = val;
      else if (k === 'estadoTrabajo') { pr.estadoTrabajo = val; const col = ET_COLOR[val]; if (col) pr.color = col; else delete pr.color; }
      else if (k === 'abono') pr.abono = val;
      else pr[k] = val;
      return;
    }
    if (p[1] === 'sp') {
      const pi = +p[2], si = +p[3], s = c.proyectos[pi]?.subpuntos[si]; if (!s) return;
      if (k === 'nombreSub') s.nombre = val;
      else if (k === 'descSub') s.desc = val;
      else s[k] = val;
      return;
    }
    if (p[1] === 't') {
      const pi = +p[2], ti = +p[3], t = c.proyectos[pi]?.tareas[ti]; if (!t) return;
      if (p.length === 4) t[k] = val;
      else if (p.length === 5) { const st = t.subtareas[+p[4]]; if (st) st[k] = val; }
      return;
    }
    if (p[1] === 's') {
      const pi = +p[2], si = +p[3], ti = +p[4], t = c.proyectos[pi]?.subpuntos[si]?.tareas[ti]; if (!t) return;
      if (p.length === 5) t[k] = val;
      else if (p.length === 6) { const st = t.subtareas[+p[5]]; if (st) st[k] = val; }
      return;
    }
  } catch(e) { console.warn('applyEdit:', e.message); }
}

// ============================================================
// HISTORIAL / DESHACER
// ============================================================
function pushHistory() {
  _history.push(JSON.stringify({ clientes: JSON.parse(JSON.stringify(clientes)), vistaActual, clienteActual }));
  if (_history.length > 20) _history.shift();
  updateUndoBtn();
}

function undo() {
  if (!_history.length) return;
  const prev = JSON.parse(_history.pop());
  clientes      = fixClientes(prev.clientes);
  vistaActual   = prev.vistaActual;
  clienteActual = prev.clienteActual;
  updateUndoBtn();
  save(); renderVista();
  showSaved('« Deshecho');
}

function updateUndoBtn() {
  const b = document.getElementById('btn-undo');
  if (b) b.style.display = _history.length ? '' : 'none';
}

// ============================================================
// SELECCIÓN MÚLTIPLE
// ============================================================
function toggleSel(cb) {
  const k = cb.dataset.sel;
  if (cb.checked) _selected.add(k); else _selected.delete(k);
  const n   = _selected.size;
  const btn = document.getElementById('btn-del-sel');
  const cnt = document.getElementById('sel-count');
  btn.style.display = n ? '' : 'none';
  if (cnt) cnt.textContent = n;
}

function deleteSelected() {
  if (!_selected.size) return;
  if (!confirm(`¿Eliminar ${_selected.size} elemento(s) seleccionado(s)?`)) return;
  pushHistory();
  const projs = [], tareas = [], subs = [];
  _selected.forEach(k => {
    const p = k.split('|');
    if (p[0] === 'p') projs.push({ ci: +p[1], pi: +p[2] });
    else if (p[0] === 't') {
      const pp = p[1].split('|');
      if (p[1].includes('|t|')) tareas.push({ ci: +pp[0], pi: +pp[2], ti: +pp[3], kind: 't' });
      else if (p[1].includes('|s|')) tareas.push({ ci: +pp[0], pi: +pp[2], si: +pp[3], ti: +pp[4], kind: 's' });
    } else if (p[0] === 'st') {
      const pp = p[1].split('|');
      if (pp[1] === 't') subs.push({ ci: +pp[0], pi: +pp[2], ti: +pp[3], sti: +pp[4], kind: 't' });
      else if (pp[1] === 's') subs.push({ ci: +pp[0], pi: +pp[2], si: +pp[3], ti: +pp[4], sti: +pp[5], kind: 's' });
    }
  });
  subs.sort((a, b) => b.sti - a.sti).forEach(x => {
    const t = x.kind === 't' ? clientes[x.ci].proyectos[x.pi].tareas[x.ti] : clientes[x.ci].proyectos[x.pi].subpuntos[x.si].tareas[x.ti];
    if (t) t.subtareas.splice(x.sti, 1);
  });
  tareas.sort((a, b) => b.ti - a.ti).forEach(x => {
    const arr = x.kind === 't' ? clientes[x.ci].proyectos[x.pi].tareas : clientes[x.ci].proyectos[x.pi].subpuntos[x.si].tareas;
    if (arr) arr.splice(x.ti, 1);
  });
  projs.sort((a, b) => b.pi - a.pi).forEach(x => { clientes[x.ci].proyectos.splice(x.pi, 1); });
  _selected.clear();
  document.getElementById('btn-del-sel').style.display = 'none';
  save(); renderVista();
}

// ============================================================
// ACCIONES
// ============================================================
function guardarAhora(btn) {
  clearTimeout(window._it);
  if (btn) {
    btn.classList.add('guardado');
    btn.textContent = '✓ Guardado';
    setTimeout(() => { if (btn) { btn.classList.remove('guardado'); btn.textContent = '✓'; } }, 1500);
  }
  save();
}

function quickAddTarea(ci, pi) {
  pushHistory();
  const p   = clientes[ci].proyectos[pi];
  const arr = (p.subpuntos && p.subpuntos.length) ? p.subpuntos[p.subpuntos.length - 1].tareas : p.tareas;
  const nid = (arr.length + 1).toString().padStart(2, '0');
  arr.push({ id: nid, tarea: 'Nueva tarea', estado: 'Pendiente', prioridad: 'Media', fechaEstimada: '', horaEstimada: '', notas: '', adjuntos: [], subtareas: [] });
  expandedKeys.add('p-' + ci + '-' + pi);
  expandedKeys.add('tareas-' + ci + '-' + pi);
  save(); renderVista();
  setTimeout(() => {
    const txts = document.querySelectorAll('.tree .task textarea.txt');
    if (txts.length) { const l = txts[txts.length - 1]; l.focus(); l.select(); }
  }, 60);
}

function addItem() {
  pushHistory();
  if (vistaActual === 'clientes') {
    clientes.push({ id: newId(), nombre: 'Nuevo Cliente', estado: 'Activo', nota: '', color: null, proyectos: [] });
  } else {
    if (clienteActual == null) return;
    const ci = clienteActual;
    clientes[ci].proyectos.push({
      id: newId(), nombre: 'Nuevo Proyecto', estadoTrabajo: 'Sin Iniciar', abono: 'Sin Abono',
      color: null, nota: '', adjuntos: [], fechaTerminado: null, fechaEstimada: '',
      tareas: [], subpuntos: []
    });
    renumerarProyectos(clientes[ci].proyectos);
    expandedKeys.add('p-' + ci + '-' + (clientes[ci].proyectos.length - 1));
  }
  save(); renderVista();
}

function delCliente(ci) {
  if (!confirm(`¿Eliminar cliente "${clientes[ci].nombre}"?`)) return;
  pushHistory(); clientes.splice(ci, 1); save(); renderVista();
}

function delProyecto(ci, pi) {
  if (!confirm(`¿Eliminar proyecto "${clientes[ci].proyectos[pi].nombre}"?`)) return;
  pushHistory(); clientes[ci].proyectos.splice(pi, 1);
  renumerarProyectos(clientes[ci].proyectos);
  save(); renderVista();
}

function addSubpunto(ci, pi) {
  pushHistory();
  const p = clientes[ci].proyectos[pi];
  if (!p.subpuntos) p.subpuntos = [];
  if (!p.subpuntos.length && p.tareas && p.tareas.length && confirm('¿Mover tareas actuales a subpunto "General"?')) {
    p.subpuntos.push({ id: newId(), nombre: 'General', desc: '', fechaEstimada: '', tareas: p.tareas });
    p.tareas = [];
  }
  p.subpuntos.push({ id: newId(), nombre: 'Nuevo Subproyecto', desc: '', fechaEstimada: '', tareas: [] });
  expandedKeys.add('p-' + ci + '-' + pi);
  expandedKeys.add('tareas-' + ci + '-' + pi);
  save(); renderVista();
}

function delSubpunto(ci, pi, si) {
  const p = clientes[ci].proyectos[pi];
  if (!confirm(`¿Eliminar subproyecto "${p.subpuntos[si].nombre}"?`)) return;
  pushHistory(); p.subpuntos.splice(si, 1);
  if (!p.subpuntos.length) p.subpuntos = [];
  save(); renderVista();
}

function addTarea(addPath) {
  pushHistory();
  const p   = addPath.split('|'), ci = +p[1], pi = +p[2];
  const arr = p[0] === 's' ? clientes[ci].proyectos[pi].subpuntos[+p[3]].tareas : clientes[ci].proyectos[pi].tareas;
  const nid = (arr.length + 1).toString().padStart(2, '0');
  arr.push({ id: nid, tarea: 'Nueva tarea', estado: 'Pendiente', prioridad: 'Media', fechaEstimada: '', horaEstimada: '', notas: '', adjuntos: [], subtareas: [] });
  expandedKeys.add(`p-${ci}-${pi}`);
  expandedKeys.add(`tareas-${ci}-${pi}`);
  save(); renderVista();
  setTimeout(() => {
    const txts = document.querySelectorAll('.tree .task textarea.txt');
    if (txts.length) { const last = txts[txts.length - 1]; last.focus(); last.select(); }
  }, 30);
}

function delTarea(path) {
  const p = path.split('|'), ci = +p[0];
  let arr;
  if (p[1] === 't') { arr = clientes[ci].proyectos[+p[2]].tareas; if (!confirm('¿Eliminar tarea?')) return; pushHistory(); arr.splice(+p[3], 1); }
  else if (p[1] === 's') { arr = clientes[ci].proyectos[+p[2]].subpuntos[+p[3]].tareas; if (!confirm('¿Eliminar tarea?')) return; pushHistory(); arr.splice(+p[4], 1); }
  renumerarTareas(arr);
  save(); renderVista();
}

function addSub(path) {
  pushHistory();
  const p = path.split('|'), ci = +p[0];
  let t;
  if (p[1] === 't') t = clientes[ci].proyectos[+p[2]].tareas[+p[3]];
  else if (p[1] === 's') t = clientes[ci].proyectos[+p[2]].subpuntos[+p[3]].tareas[+p[4]];
  if (!t) return;
  if (!t.subtareas) t.subtareas = [];
  t.subtareas.push({ id: String.fromCharCode(97 + t.subtareas.length), tarea: 'Nueva subtarea', estado: 'Pendiente', prioridad: 'Media', fechaEstimada: '', horaEstimada: '', adjuntos: [] });
  save(); renderVista();
}

function delSub(path) {
  const p = path.split('|'), ci = +p[0];
  let t;
  if (p[1] === 't') t = clientes[ci].proyectos[+p[2]].tareas[+p[3]];
  else if (p[1] === 's') t = clientes[ci].proyectos[+p[2]].subpuntos[+p[3]].tareas[+p[4]];
  if (t && confirm('¿Eliminar subtarea?')) { pushHistory(); t.subtareas.splice(+p[p.length - 1], 1); renumerarSubtareas(t.subtareas); }
  save(); renderVista();
}

// Renumera los id mostrados ("01","02",...) según la posición actual en el
// array, para que el número refleje siempre el orden/prioridad vigente.
function renumerarTareas(arr) {
  if (!arr) return;
  arr.forEach((t, i) => { t.id = String(i + 1).padStart(2, '0'); });
}
// Renumera subtareas con letras ("a","b","c"...) según su posición.
function renumerarSubtareas(arr) {
  if (!arr) return;
  arr.forEach((t, i) => { t.id = String.fromCharCode(97 + i); });
}

function moveTarea(path, dir) {
  const p = path.split('|'), ci = +p[0];
  let arr, idx;
  if (p[1] === 't') { arr = clientes[ci].proyectos[+p[2]].tareas; idx = +p[3]; }
  else if (p[1] === 's') { arr = clientes[ci].proyectos[+p[2]].subpuntos[+p[3]].tareas; idx = +p[4]; }
  if (!arr) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  pushHistory();
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
  renumerarTareas(arr);
  save(); renderVista();
}

function moveSub(path, dir) {
  const p = path.split('|'), ci = +p[0];
  let t, idx;
  if (p[1] === 't') { t = clientes[ci].proyectos[+p[2]].tareas[+p[3]]; idx = +p[4]; }
  else if (p[1] === 's') { t = clientes[ci].proyectos[+p[2]].subpuntos[+p[3]].tareas[+p[4]]; idx = +p[5]; }
  if (!t || !t.subtareas) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= t.subtareas.length) return;
  pushHistory();
  [t.subtareas[idx], t.subtareas[ni]] = [t.subtareas[ni], t.subtareas[idx]];
  renumerarSubtareas(t.subtareas);
  save(); renderVista();
}

function moveProyecto(ci, pi, dir) {
  const arr = clientes[ci].proyectos;
  const proyecto = arr[pi];
  if (!proyecto) return;
  renumerarProyectos(arr); // asegura prioridades 1..N consistentes antes de mover
  const sorted = [...arr].sort((a, b) => (+a.orden) - (+b.orden));
  const idx = sorted.indexOf(proyecto);
  const ni  = idx + dir;
  if (ni < 0 || ni >= sorted.length) return;
  pushHistory();
  [sorted[idx].orden, sorted[ni].orden] = [sorted[ni].orden, sorted[idx].orden];
  save(); renderVista();
}

// ============================================================
// BACKUP / IMPORTAR
// ============================================================
function exportJSON() {
  const blob = new Blob([JSON.stringify({ clientes }, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'ciaber_backup_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

// ============================================================
// CALENDARIO SEMANAL
// ============================================================
let _calVisible   = false;
let _calWeekOffset = 0;   // 0 = semana actual, -1 = anterior, +1 = siguiente

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function toggleCal() {
  _calVisible = !_calVisible;
  const panel = document.getElementById('cal-panel');
  const btn   = document.getElementById('btn-cal');
  panel.style.display = _calVisible ? 'block' : 'none';
  if (btn) btn.style.background = _calVisible ? 'rgba(255,255,255,.35)' : '';
  if (_calVisible) renderCal();
}

function getWeekDays(offset) {
  const now  = new Date();
  const dow  = now.getDay();                        // 0=Dom…6=Sáb
  const mon  = new Date(now);
  mon.setDate(now.getDate() - ((dow + 6) % 7) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function toYMD(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Prioridad numérica para ordenar (menor = más importante)
function priNum(p) { return p === 'Alta' ? 0 : p === 'Media' ? 1 : p === 'Baja' ? 2 : 3; }

function getItemsForDate(dateStr) {
  const items = [];
  clientes.forEach((c, ci) => {
    (c.proyectos || []).forEach((p, pi) => {
      // Proyecto con fecha estimada
      if (p.fechaEstimada === dateStr) {
        items.push({ tipo: 'proyecto', label: p.nombre, sub: c.nombre, estado: p.estadoTrabajo, pri: null, ci, pi });
      }
      // Tareas directas
      (p.tareas || []).forEach((t, ti) => {
        if (t.fechaEstimada === dateStr) {
          items.push({ tipo: 'tarea', label: t.tarea, sub: p.nombre + ' · ' + c.nombre, pri: t.prioridad || '', estado: t.estado, ci, pi });
        }
        (t.subtareas || []).forEach(st => {
          if (st.fechaEstimada === dateStr)
            items.push({ tipo: 'tarea', label: st.tarea, sub: p.nombre + ' · ' + c.nombre, pri: st.prioridad || '', estado: st.estado, ci, pi });
        });
      });
      // Tareas en fases
      (p.subpuntos || []).forEach(s => {
        (s.tareas || []).forEach(t => {
          if (t.fechaEstimada === dateStr)
            items.push({ tipo: 'tarea', label: t.tarea, sub: s.nombre + ' · ' + p.nombre, pri: t.prioridad || '', estado: t.estado, ci, pi });
          (t.subtareas || []).forEach(st => {
            if (st.fechaEstimada === dateStr)
              items.push({ tipo: 'tarea', label: st.tarea, sub: s.nombre + ' · ' + p.nombre, pri: st.prioridad || '', estado: st.estado, ci, pi });
          });
        });
      });
    });
  });
  // Ordenar: tareas Alta primero, luego proyectos, luego resto por prioridad
  items.sort((a, b) => {
    if (a.tipo === 'tarea' && b.tipo !== 'tarea') return -1;
    if (b.tipo === 'tarea' && a.tipo !== 'tarea') return 1;
    return priNum(a.pri) - priNum(b.pri);
  });
  return items;
}

function renderCal() {
  const panel = document.getElementById('cal-panel');
  if (!panel) return;
  const days   = getWeekDays(_calWeekOffset);
  const todayS = toYMD(new Date());
  const label  = DIAS[0] + ' ' + days[0].getDate() + ' ' + MESES[days[0].getMonth()] +
                 ' — ' + DIAS[6] + ' ' + days[6].getDate() + ' ' + MESES[days[6].getMonth()] +
                 ' ' + days[0].getFullYear();

  const colsHtml = days.map((d, i) => {
    const dStr   = toYMD(d);
    const isHoy  = dStr === todayS;
    const items  = getItemsForDate(dStr);
    const numStr = `<span class="cal-num">${d.getDate()}</span>`;
    const chipsHtml = items.length
      ? items.map(it => {
          const done = it.estado === 'Terminado' || it.estado === 'Cobrado' || it.estado === 'Terminado sin Presupuesto';
          const cls = (it.tipo === 'proyecto'
            ? 'cal-chip tipo-proyecto'
            : `cal-chip tipo-tarea pri-${it.pri}`) + (done ? ' terminado' : '');
          const onclick = `abrirCliente(${it.ci})`;
          return `<button class="${cls}" onclick="${onclick}" title="${ESC(it.sub)}">${ESC(it.label)}</button>`;
        }).join('')
      : `<span class="cal-chip cal-empty">—</span>`;
    return `<div class="cal-day${isHoy ? ' today' : ''}">
      <div class="cal-day-label">${DIAS[i]} ${numStr}</div>
      ${chipsHtml}
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" onclick="_calWeekOffset--;renderCal()">‹ Anterior</button>
      <h3>📅 ${label}</h3>
      <button class="cal-nav" onclick="_calWeekOffset=0;renderCal()">Hoy</button>
      <button class="cal-nav" onclick="_calWeekOffset++;renderCal()">Siguiente ›</button>
    </div>
    <div class="cal-grid">${colsHtml}</div>`;
}

function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (d.clientes) clientes = fixClientes(d.clientes);
      else if (Array.isArray(d)) clientes = migrarDesdeFormatoViejo(d);
      save(); renderVista();
      alert('Importado correctamente.');
    } catch(err) { alert('Archivo inválido: ' + err.message); }
  };
  r.readAsText(f);
}

// ============================================================
// GESTIÓN DE USUARIOS
// ============================================================
let _umUsers = [];
let _umEditing = null;
let _umRole = 'user';
let _umExpandedClientes = new Set();

function openUserMgmt() {
  document.getElementById('user-mgmt-overlay').style.display = 'flex';
  umLoad();
}
function closeUserMgmt() {
  document.getElementById('user-mgmt-overlay').style.display = 'none';
}
async function umLoad() {
  try {
    const snap = await fbDB.ref(DB_USERS).once('value');
    const ud   = snap.val() || {};
    _umUsers   = Object.values(ud);
    umRenderList();
    if (!_umEditing) {
      document.getElementById('um-content').innerHTML = '<div class="um-empty-state"><div class="um-empty-icon">👤</div><p>Seleccioná un usuario o creá uno nuevo</p></div>';
    }
  } catch(e) {
    document.getElementById('um-user-list').innerHTML = '<p style="padding:12px;color:#dc2626;font-size:12px">Error cargando usuarios</p>';
  }
}
function umRenderList() {
  const list = document.getElementById('um-user-list');
  if (!_umUsers.length) { list.innerHTML = '<p style="padding:12px;color:#94a3b8;font-size:12px;text-align:center">Sin usuarios</p>'; return; }
  list.innerHTML = _umUsers.map(u => {
    const ini = (u.nombre || u.email).substring(0,2).toUpperCase();
    const lbl = u.role === 'admin' ? 'Admin' : 'Usuario';
    return '<div class="um-user-item' + (_umEditing===u.email?' active':'') + '" onclick="umSelectUser(\'' + _escH(u.email) + '\')">' +
      '<div class="um-avatar role-' + u.role + '">' + ini + '</div>' +
      '<div class="um-user-info"><div class="um-user-name">' + _escH(u.nombre||u.email) + '</div>' +
      '<div class="um-user-email">' + _escH(u.email) + '</div></div>' +
      '<span class="um-role-badge role-' + u.role + '">' + lbl + '</span></div>';
  }).join('');
}
function umSelectUser(email) {
  _umEditing = email; _umExpandedClientes.clear();
  umRenderList();
  const u = _umUsers.find(x => x.email === email);
  if (u) { _umRole = u.role || 'user'; umRenderForm(u); }
}
function umNewUser() {
  _umEditing = null; _umExpandedClientes.clear(); _umRole = 'user';
  umRenderList(); umRenderForm(null);
}
function umRenderForm(u) {
  const isNew = !u;
  const perms = u ? (u.permissions || {}) : {};
  const aC = perms.clientes || [];
  const aP = perms.proyectos || {};
  const delBtn = (u && u.email !== currentUser.email)
    ? '<button class="um-btn-delete" onclick="umDelete(\'' + _escH(u.email) + '\')">🗑 Eliminar</button>' : '';
  document.getElementById('um-content').innerHTML =
    '<div style="max-width:580px">' +
    '<div class="um-form-section"><p class="um-form-title">Datos del usuario</p>' +
    '<div class="um-form-row">' +
    '<div><label class="um-label">Nombre</label><input class="um-input" id="um-nombre" placeholder="Nombre completo" value="' + _escH(u?u.nombre||'':'') + '"></div>' +
    '<div><label class="um-label">Email</label><input class="um-input" id="um-email" type="email" placeholder="usuario@empresa.com" value="' + _escH(u?u.email:'') + '"' + (!isNew?' readonly style="background:#f8fafc;color:#94a3b8"':'') + '></div>' +
    '</div><div class="um-form-row">' +
    '<div><label class="um-label">' + (isNew?'Contraseña':'Nueva contraseña (dejar vacío para no cambiar)') + '</label>' +
    '<input class="um-input" id="um-pass" type="password" placeholder="' + (isNew?'Contraseña':'Sin cambios') + '"></div><div></div>' +
    '</div></div>' +
    '<div class="um-form-section"><p class="um-form-title">Rol</p>' +
    '<div class="um-role-cards">' +
    '<div class="um-role-card admin' + (_umRole==='admin'?' selected':'') + '" onclick="umSelRole(\'admin\')">' +
    '<div class="um-role-card-check">' + (_umRole==='admin'?'✓':'') + '</div>' +
    '<div class="um-role-card-icon">🛡️</div><div class="um-role-card-name">Administrador</div>' +
    '<div class="um-role-card-desc">Acceso completo a todos los clientes, proyectos y tareas. Gestiona usuarios.</div></div>' +
    '<div class="um-role-card user' + (_umRole==='user'?' selected':'') + '" onclick="umSelRole(\'user\')">' +
    '<div class="um-role-card-check">' + (_umRole==='user'?'✓':'') + '</div>' +
    '<div class="um-role-card-icon">👤</div><div class="um-role-card-name">Usuario</div>' +
    '<div class="um-role-card-desc">Acceso limitado a los clientes y proyectos que el administrador defina.</div></div>' +
    '</div></div>' +
    '<div class="um-form-section" id="um-perms-section" style="display:' + (_umRole==='user'?'block':'none') + '">' +
    '<p class="um-form-title">Permisos de acceso</p>' +
    '<div class="um-perms-section"><p class="um-perms-hint">Seleccioná los clientes y proyectos a los que este usuario tendrá acceso.</p>' +
    '<div id="um-perm-tree">' + umBuildTree(aC, aP) + '</div></div></div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    delBtn +
    '<div style="display:flex;gap:10px;margin-left:auto;align-items:center">' +
    '<span id="um-msg" class="um-msg" style="display:none"></span>' +
    '<button class="um-btn-cancel" onclick="umCancel()">Cancelar</button>' +
    '<button class="um-btn-save" onclick="umSave()">💾 Guardar</button>' +
    '</div></div></div>';
}
function umBuildTree(aC, aP) {
  if (!clientes || !clientes.length) return '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:8px">Sin clientes cargados aún</p>';
  return clientes.map(function(c) {
    const chk = Array.isArray(aC) && aC.includes(c.id);
    const exp = _umExpandedClientes.has(c.id);
    const pp = aP[c.id];
    const allP = pp === 'all' || !Array.isArray(pp);
    const proys = (c.proyectos||[]).map(function(p) {
      const pc = allP ? chk : (Array.isArray(pp) && pp.includes(p.id));
      return '<div class="um-perm-proy-row">' +
        '<input type="checkbox" class="um-perm-cb" id="umpp_' + c.id + '_' + p.id + '" ' + (pc?'checked':'') +
        ' onchange="umTglProy(\'' + c.id + '\',\'' + p.id + '\',this.checked)">' +
        '<span class="um-perm-proy-name">' + _escH(p.nombre||'Sin nombre') + '</span></div>';
    }).join('');
    const proyBlock = c.proyectos && c.proyectos.length ?
      '<div class="um-perm-proyectos' + (exp?' show':'') + '" id="umpg_' + c.id + '">' +
      '<div class="um-perm-all-row"><input type="checkbox" class="um-perm-cb" id="umall_' + c.id + '" ' + ((chk&&allP)?'checked':'') +
      ' onchange="umTglAllP(\'' + c.id + '\',this.checked)"><span class="um-perm-all-label">Todos los proyectos</span></div>' +
      proys + '</div>' : '';
    return '<div class="um-perm-cliente" id="umpc_' + c.id + '">' +
      '<div class="um-perm-cliente-row" onclick="umTglExp(\'' + c.id + '\')">' +
      '<input type="checkbox" class="um-perm-cb" id="umcb_' + c.id + '" ' + (chk?'checked':'') +
      ' onclick="event.stopPropagation();umTglCliente(\'' + c.id + '\',this.checked)">' +
      '<span class="um-perm-cliente-name">🏢 ' + _escH(c.nombre||'Sin nombre') + '</span>' +
      '<span class="um-perm-toggle' + (exp?' open':'') + '">▶</span></div>' +
      proyBlock + '</div>';
  }).join('');
}
function umTglExp(cId) {
  _umExpandedClientes.has(cId) ? _umExpandedClientes.delete(cId) : _umExpandedClientes.add(cId);
  var g = document.getElementById('umpg_'+cId), t = document.querySelector('#umpc_'+cId+' .um-perm-toggle');
  if (g) g.classList.toggle('show', _umExpandedClientes.has(cId));
  if (t) t.classList.toggle('open', _umExpandedClientes.has(cId));
}
function umTglCliente(cId, chk) {
  if (!chk) {
    var c = clientes.find(function(x){return x.id===cId;});
    (c&&c.proyectos||[]).forEach(function(p){var el=document.getElementById('umpp_'+cId+'_'+p.id);if(el)el.checked=false;});
    var a=document.getElementById('umall_'+cId); if(a)a.checked=false;
  }
}
function umTglAllP(cId, chk) {
  var c = clientes.find(function(x){return x.id===cId;});
  (c&&c.proyectos||[]).forEach(function(p){var el=document.getElementById('umpp_'+cId+'_'+p.id);if(el)el.checked=chk;});
  if (chk){var cb=document.getElementById('umcb_'+cId);if(cb)cb.checked=true;}
}
function umTglProy(cId, pId, chk) {
  if(chk){var cb=document.getElementById('umcb_'+cId);if(cb)cb.checked=true;}
  var c=clientes.find(function(x){return x.id===cId;});
  if(c){var all=(c.proyectos||[]).every(function(p){var el=document.getElementById('umpp_'+cId+'_'+p.id);return el&&el.checked;});var acb=document.getElementById('umall_'+cId);if(acb)acb.checked=all;}
}
function umSelRole(role) {
  _umRole = role;
  document.querySelectorAll('.um-role-card').forEach(function(el){el.classList.remove('selected');el.querySelector('.um-role-card-check').textContent='';});
  var sel=document.querySelector('.um-role-card.'+role);if(sel){sel.classList.add('selected');sel.querySelector('.um-role-card-check').textContent='✓';}
  var ps=document.getElementById('um-perms-section');if(ps)ps.style.display=role==='user'?'block':'none';
}
function umReadPerms() {
  if (_umRole==='admin') return null;
  var aC=[], aP={};
  (clientes||[]).forEach(function(c){
    var cb=document.getElementById('umcb_'+c.id);if(!cb||!cb.checked)return;
    aC.push(c.id);
    var acb=document.getElementById('umall_'+c.id);
    if(acb&&acb.checked){aP[c.id]='all';}
    else{var ids=(c.proyectos||[]).filter(function(p){var el=document.getElementById('umpp_'+c.id+'_'+p.id);return el&&el.checked;}).map(function(p){return p.id;});if(ids.length)aP[c.id]=ids;}
  });
  return {clientes:aC,proyectos:aP};
}
function umMsg(txt, type) {
  var el=document.getElementById('um-msg');if(!el)return;
  el.textContent=txt;el.className='um-msg '+type;el.style.display='inline-block';
  setTimeout(function(){el.style.display='none';},3000);
}
async function umSave() {
  var nombre=(document.getElementById('um-nombre')&&document.getElementById('um-nombre').value||'').trim();
  var email=(document.getElementById('um-email')&&document.getElementById('um-email').value||'').trim().toLowerCase();
  var pass=document.getElementById('um-pass')&&document.getElementById('um-pass').value||'';
  var isNew=!_umEditing;
  if(!email){umMsg('El email es requerido','err');return;}
  if(isNew&&!pass){umMsg('La contraseña es requerida','err');return;}
  try {
    if (isNew) {
      var secondary = firebase.initializeApp(FIREBASE_CONFIG, 'sec_' + Date.now());
      try {
        await secondary.auth().createUserWithEmailAndPassword(email, pass);
        await secondary.auth().signOut();
      } catch(e) {
        await secondary.delete();
        umMsg(e.code==='auth/email-already-in-use'?'El email ya existe':(e.message||'Error al crear usuario'),'err');
        return;
      }
      await secondary.delete();
    }
    var key = emailToKey(email);
    var userData = { email, nombre: nombre||email.split('@')[0], role: _umRole, permissions: umReadPerms() };
    await fbDB.ref(DB_USERS + '/' + key).update(userData);
    umMsg(isNew?'Usuario creado ✓':'Guardado ✓','ok');
    if(isNew) _umEditing = email;
    await umLoad();
  } catch(e) { umMsg('Error: '+(e.message||e),'err'); }
}
async function umDelete(email) {
  if(!confirm('¿Eliminar al usuario '+email+'? Perderá acceso al sistema.'))return;
  try {
    await fbDB.ref(DB_USERS + '/' + emailToKey(email)).remove();
    _umEditing = null;
    await umLoad();
    document.getElementById('um-content').innerHTML = '<div class="um-empty-state"><div class="um-empty-icon">👤</div><p>Usuario eliminado</p></div>';
  } catch(e) { umMsg('Error: '+(e.message||e),'err'); }
}
function umCancel() {
  _umEditing=null;umRenderList();
  document.getElementById('um-content').innerHTML='<div class="um-empty-state"><div class="um-empty-icon">👤</div><p>Seleccioná un usuario o creá uno nuevo</p></div>';
}
function _escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
