// ============================================================
//  CIABER — server.js
//  Endpoints: auth, data, uploads, users, excel export
// ============================================================

const express        = require('express');
const session        = require('express-session');
const multer         = require('multer');
const path           = require('path');
const fs             = require('fs');

const app        = express();
const CONFIG_FILE = path.resolve(__dirname, 'config.json');
const DATA_FILE   = path.resolve(__dirname, 'data.json');
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

// Crear carpeta de uploads si no existe
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Config y datos ────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch(e) { return { users: [], port: 8080, sessionSecret: 'ciaber-secret-2024' }; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return { clientes: [], updated_at: null }; }
}
function saveData(clientes) {
  const payload = { clientes, updated_at: new Date().toISOString() };
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  // Backup automático
  fs.writeFileSync(DATA_FILE.replace('data.json','data.bak.json'), JSON.stringify(payload, null, 2));
  return payload;
}

const config = loadConfig();
const PORT   = process.env.PORT || config.port || 8080;
const SECRET = process.env.SESSION_SECRET || config.sessionSecret || 'ciaber-secret-2024';

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

// ── File upload ───────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uid = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, uid + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Guards ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'No autorizado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  next();
}

// ── AUTH ──────────────────────────────────────────────────────
app.get('/api/session', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sin sesión activa' });
  res.json({ user: req.session.user });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos.' });

  const cfg  = loadConfig();
  const user = cfg.users.find(u =>
    u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
  );
  if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });

  req.session.user = {
    email:       user.email,
    nombre:      user.nombre || '',
    role:        user.role   || 'user',
    permissions: user.permissions || null
  };
  res.json(req.session.user);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── DATA ──────────────────────────────────────────────────────
app.get('/api/data', requireAuth, (req, res) => {
  const data  = loadData();
  const user  = req.session.user;

  // Admins ven todo
  if (user.role === 'admin') return res.json(data);

  // Usuarios con permisos limitados
  const perms = user.permissions;
  if (perms?.clientes?.length) {
    const visibleIds = perms.clientes;
    data.clientes = (data.clientes || []).filter(c => visibleIds.includes(c.id)).map(c => {
      const proyPerms = perms.proyectos?.[c.id];
      if (!proyPerms || proyPerms === 'all') return c;
      if (Array.isArray(proyPerms)) {
        return { ...c, proyectos: (c.proyectos || []).filter(p => proyPerms.includes(p.id)) };
      }
      return c;
    });
  } else {
    data.clientes = [];
  }

  res.json(data);
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    const { clientes } = req.body || {};
    if (!Array.isArray(clientes)) return res.status(400).json({ error: 'Formato de datos inválido' });

    const user = req.session.user;

    if (user.role === 'admin') {
      // Admin guarda todo
      saveData(clientes);
    } else {
      // Usuario limitado: solo sobreescribe sus clientes asignados
      const perms        = user.permissions;
      const existing     = loadData();
      const assignedIds  = perms?.clientes || [];
      const kept         = (existing.clientes || []).filter(c => !assignedIds.includes(c.id));
      const updated      = clientes.filter(c => assignedIds.includes(c.id));
      saveData([...kept, ...updated]);
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('Error al guardar datos:', e);
    res.status(500).json({ error: 'Error interno al guardar' });
  }
});

// ── UPLOADS ───────────────────────────────────────────────────
app.post('/api/upload/:tipo/:id', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  res.json({
    ok:           true,
    nombre:       req.file.originalname,
    storage_path: req.file.filename,
    tipo_mime:    req.file.mimetype
  });
});

app.delete('/api/upload', requireAuth, (req, res) => {
  const { storage_path } = req.body || {};
  if (!storage_path) return res.status(400).json({ error: 'Falta el path del archivo' });

  // Prevenir path traversal
  const safe = path.basename(storage_path);
  const full = path.join(UPLOADS_DIR, safe);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true, warn: 'No se pudo eliminar del disco' });
  }
});

// Servir archivos subidos (solo usuarios autenticados)
app.use('/uploads', requireAuth, express.static(UPLOADS_DIR));

// ── EXPORT EXCEL ──────────────────────────────────────────────
app.get('/api/export/cliente/:ci', requireAuth, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const ci      = parseInt(req.params.ci, 10);
    const data    = loadData();
    const c       = data.clientes?.[ci];
    if (!c) return res.status(404).send('Cliente no encontrado');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(c.nombre.slice(0, 31));

    ws.columns = [
      { header: 'Proyecto',     key: 'proy',   width: 30 },
      { header: 'Estado',       key: 'estado',  width: 24 },
      { header: 'Abono',        key: 'abono',   width: 12 },
      { header: 'Ticket',       key: 'ticket',  width: 10 },
      { header: 'Tarea',        key: 'tarea',   width: 36 },
      { header: 'Est. Tarea',   key: 'etarea',  width: 14 },
      { header: 'Prioridad',    key: 'prio',    width: 12 },
      { header: 'Vencimiento',  key: 'venc',    width: 14 },
      { header: 'Notas',        key: 'notas',   width: 40 }
    ];

    ws.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A6E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    (c.proyectos || []).forEach(p => {
      const tareas = p.tareas || [];
      if (!tareas.length) {
        ws.addRow({ proy: p.nombre, estado: p.estadoTrabajo, abono: p.abono || '', ticket: p.nroTicket || '', tarea: '', etarea: '', prio: '', venc: '', notas: p.nota || '' });
      } else {
        tareas.forEach((t, ti) => {
          ws.addRow({
            proy:   ti === 0 ? p.nombre : '',
            estado: ti === 0 ? p.estadoTrabajo : '',
            abono:  ti === 0 ? (p.abono || '') : '',
            ticket: ti === 0 ? (p.nroTicket || '') : '',
            tarea:   t.tarea || '',
            etarea:  t.estado || '',
            prio:    t.prioridad || '',
            venc:    t.fechaEstimada || '',
            notas:   ti === 0 ? (p.nota || '') : ''
          });
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(c.nombre)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch(e) {
    console.error('Error exportando Excel:', e);
    res.status(500).send('Error al generar el Excel');
  }
});

// ── USERS ─────────────────────────────────────────────────────
app.get('/api/users', requireAdmin, (_req, res) => {
  const cfg = loadConfig();
  res.json({
    users: cfg.users.map(u => ({
      email:       u.email,
      nombre:      u.nombre || '',
      role:        u.role   || 'user',
      permissions: u.permissions || null
    }))
  });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { email, password, nombre, role, permissions } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

  const cfg = loadConfig();
  if (cfg.users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

  cfg.users.push({
    email:       email.toLowerCase().trim(),
    password,
    nombre:      nombre || email.split('@')[0],
    role:        role  || 'user',
    permissions: permissions || null
  });
  saveConfig(cfg);
  res.json({ ok: true });
});

app.put('/api/users/:email', requireAdmin, (req, res) => {
  const target = decodeURIComponent(req.params.email).toLowerCase();
  const { password, nombre, role, permissions } = req.body || {};

  const cfg = loadConfig();
  const idx = cfg.users.findIndex(u => u.email.toLowerCase() === target);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (nombre      !== undefined) cfg.users[idx].nombre      = nombre;
  if (role        !== undefined) cfg.users[idx].role        = role;
  if (permissions !== undefined) cfg.users[idx].permissions = permissions;
  if (password)                  cfg.users[idx].password    = password;

  saveConfig(cfg);

  // Actualizar sesión si es el usuario actual
  if (req.session.user?.email.toLowerCase() === target) {
    req.session.user.nombre = cfg.users[idx].nombre;
    req.session.user.role   = cfg.users[idx].role;
  }
  res.json({ ok: true });
});

app.delete('/api/users/:email', requireAdmin, (req, res) => {
  const target = decodeURIComponent(req.params.email).toLowerCase();
  if (target === req.session.user?.email.toLowerCase())
    return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });

  const cfg = loadConfig();
  const idx = cfg.users.findIndex(u => u.email.toLowerCase() === target);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  cfg.users.splice(idx, 1);
  saveConfig(cfg);
  res.json({ ok: true });
});

// ── ARCHIVOS ESTÁTICOS + CATCH-ALL ────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Si index.html está en la raíz (no en /public):
app.use(express.static(__dirname));

app.get('*', (_req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅  Ciaber corriendo en http://0.0.0.0:${PORT}`);
});
