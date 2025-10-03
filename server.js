// ======== NMR School — Webinar RMN ========

// --- bootstrap básico ---
require('dotenv').config();
const https = require('https');
const express = require('express');
const app = express();

const cors = require('cors');

app.use(cors({
  origin: [
    'https://nmrschool.github.io',
    'https://nmrschool.github.io/webinar',
    'https://nmrschool.github.io' // cubre rutas internas
  ],
  methods: ['POST','GET'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public')); // sirve tu /public (index.html)


const path = require('path');


const fs   = require('fs');
const nodemailer = require('nodemailer');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrants.json');

// Carga inicial de registros (si existe archivo)
let registrants = [];
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (fs.existsSync(DATA_FILE)) {
    registrants = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {
  console.error('No se pudo cargar registrants.json:', e);
}

// Guardado helper
function saveRegistrants() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(registrants, null, 2), 'utf8');
  } catch (e) {
    console.error('No se pudo guardar registrants.json:', e);
  }
}

// CSV helper
function toCSV(rows) {
  if (!rows.length) return 'firstName,lastName,orgType,orgName,role,email,phone,moreInfo,createdAt\n';
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replaceAll('"','""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(','));
  return lines.join('\n');
}


// URL pública (RAW) del ICS en GitHub
const ICS_PUBLIC_URL = process.env.ICS_PUBLIC_URL 
  || 'https://raw.githubusercontent.com/NMRschool/webinar/main/nmrschool_webinar.ics';

const NMR_EVENT = {
  title: 'WEBINAR — El Arte del Desacoplamiento en RMN (LatAm NMR School)',
  // 26 nov 2025 10:00 AM America/Mexico_City = 16:00Z (1 h)
  dtStartUTC: '20251126T160000Z',
  dtEndUTC:   '20251126T170000Z',
  zoomUrl: 'https://redanahuac.zoom.us/j/86761915216',
  meetingId: '867 6191 5216',
  pass1: 'LtG3#x',
  pass2: '643917'
};

// genera .ics (idéntico al del correo)
function buildIcsWebinar() {
  const now = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const desc = [
    'Ponente: Dr. Adolfo Botana (JEOL)',
    'Tema: El Arte del Desacoplamiento en Resonancia Magnética Nuclear',
    'Organiza: LatAm NMR School',
    '',
    'Unirse por Zoom: ' + NMR_EVENT.zoomUrl,
    'ID: ' + NMR_EVENT.meetingId,
    'Códigos: ' + NMR_EVENT.pass1 + ' / ' + NMR_EVENT.pass2,
    'Más info: www.nmrschool.com'
  ].join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'PRODID:-//LatAm NMR School//Webinar//ES',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:nmrschool-${now}@nmrschool.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${NMR_EVENT.dtStartUTC}`,
    `DTEND:${NMR_EVENT.dtEndUTC}`,
    `SUMMARY:${NMR_EVENT.title}`,
    'LOCATION:Zoom',
    `DESCRIPTION:${desc}`,
    `URL:${NMR_EVENT.zoomUrl}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}


async function sendMailBrevoHttp({ to, subject, html, icsBuffer, bcc }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('Falta BREVO_API_KEY');

  // Adjuntar .ics en base64
  const attachments = icsBuffer ? [{
    name: 'nmrschool-webinar.ics',
    content: Buffer.from(icsBuffer).toString('base64')
  }] : [];

  const payload = {
    sender: {
      email: process.env.MAIL_FROM || 'contacto@nmrschool.com',
      name:  process.env.MAIL_FROM_NAME || 'LatAm NMR School'
    },
    to: [{ email: to }],
    bcc: (bcc || []).filter(Boolean).map(e => ({ email: e })),
    subject,
    htmlContent: html,
    attachment: attachments
  };

  const data = JSON.stringify(payload);

  const options = {
    method: 'POST',
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    timeout: 20000,
  };

  await new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve();
        const err = new Error(`Brevo HTTP ${res.statusCode}: ${body}`);
        return reject(err);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Brevo HTTP timeout')));
    req.write(data);
    req.end();
  });
}
// SMTP (Gmail) — mismo esquema que ya usas con nodemailer y adjuntos .ics. :contentReference[oaicite:3]{index=3}
// Reemplaza tu bloque trySend + llamada por esta función única (más simple y robusta para Brevo)
//async function sendMailSmtp({ to, bcc, subject, html, icsBuffer }) {
  //const nodemailer = require('nodemailer');

  //const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  //const port = Number(process.env.SMTP_PORT || 587);
  //const user = process.env.SMTP_USER;  // ej. 987c96001@smtp-brevo.com
  //const pass = process.env.SMTP_PASS;  // tu API key de Brevo
  //const from = process.env.MAIL_FROM || user;

  //if (!host || !user || !pass) {
    //throw new Error('SMTP faltante: revisa SMTP_HOST, SMTP_USER, SMTP_PASS');
  //}

  // 587 => STARTTLS (secure=false). 465 => TLS directo (secure=true)
  //const secure = port === 465;

  //const transporter = nodemailer.createTransport({
    //host,
    //port,
    //secure,                 // Brevo recomienda 587 + STARTTLS => secure:false
    //auth: { user, pass },
    // STARTTLS cuando secure=false
    //requireTLS: !secure,
    // Fuerza IPv4 (evita rarezas IPv6 en algunos PaaS)
    //family: 4,
    // Timeouts un poco más generosos
    //connectionTimeout: 30000,
    //greetingTimeout: 30000,
    //socketTimeout: 30000,
    //tls: {
      //minVersion: 'TLSv1.2',
      //servername: host,
    //},
  //});

  //const attachments = icsBuffer ? [{
    //filename: 'nmrschool-webinar.ics',
    //content: icsBuffer,
    //contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
  //}] : [];

  //return transporter.sendMail({
    //from,
    //to,
    //bcc,
    //subject,
    //html,
    //attachments,
    // Buenas prácticas de entregabilidad
    headers: {
      //'X-Mailer': 'LatAm NMR School',
    //},
    // replyTo opcional si quieres que respondan a otro buzón
    // replyTo: 'contacto@nmrschool.com'
  //});
//}

// Renderiza plantilla muy simple: {{clave}}
function renderTemplate(tpl, vars) {
  return Object.entries(vars).reduce(
    (h,[k,v]) => h.replace(new RegExp(`{{\\s*${k}\\s*}}`,'g'), String(v ?? '')),
    tpl
  );
}


// Plantilla del correo de invitación (ajusta la ruta si la pones en otro lugar)
const NMR_TPL_PATH = process.env.NMR_TPL_PATH || path.join(__dirname, 'templates','correo_ticket.html');

// Endpoint de registro
app.post('/nmrschool/register', async (req, res) => {
  try {
    const {
      firstName, lastName, orgType, orgName, role, email, phone, moreInfo
    } = req.body || {};

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ ok:false, error:'firstName, lastName y email son obligatorios.' });
    }

     // Guarda en memoria y archivo
    registrants.unshift({
    firstName, lastName, orgType, orgName, role, email,
    phone: phone || '',
    moreInfo: !!moreInfo,
    createdAt: new Date().toISOString()
    });
    saveRegistrants();


    // QR directo al Zoom (puedes cambiarlo a QR de VEvent si prefieres)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(NMR_EVENT.zoomUrl)}`;

    // Carga plantilla y reemplaza variables
    //const tpl = fs.readFileSync(NMR_TPL_PATH, 'utf8');
    let tpl = '';
    try {
      tpl = fs.readFileSync(NMR_TPL_PATH, 'utf8');
    } catch (e) {
      console.error('No se pudo abrir la plantilla:', NMR_TPL_PATH, e.message);
    return res.status(500).json({ ok:false, error:'Plantilla no encontrada', detail:NMR_TPL_PATH });
    }
    const html = renderTemplate(tpl, {
      firstName,
      lastName,
      orgType: orgType || '',
      orgName: orgName || '',
      role: role || '',
      email,
      phone: phone || '',
      moreInfo: moreInfo ? 'Sí' : 'No',
      zoomUrl: NMR_EVENT.zoomUrl,
      meetingId: NMR_EVENT.meetingId,
      pass1: NMR_EVENT.pass1,
      pass2: NMR_EVENT.pass2,
      // fecha/hora para el cuerpo del correo
      dateText: 'Miércoles 26 de noviembre de 2025 · 10:00 AM (CDMX)',
      qrUrl,
      icsUrl: ICS_PUBLIC_URL
    });

    // ICS
    const ics = buildIcsWebinar();
    
    // === Bloque parcheado para envío de correo ===
  //const DRY_RUN = process.env.DRY_RUN === '1';
  //try {
    //if (!DRY_RUN) {
      //await sendMailSmtp({
        //to: email,
        //bcc: process.env.MAIL_BCC ? process.env.MAIL_BCC.split(',') : undefined,
        //subject: process.env.MAIL_SUBJECT || 'Tu acceso — Webinar NMR School (Desacoplamiento en RMN)',
        //html,
        //icsBuffer: Buffer.from(ics, 'utf8')
      //});
    //} else {
      //console.warn('[DRY_RUN] Correo NO enviado. Se simula éxito.');
    //}
  //} catch (e) {
    //const transient = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(e.code) || e.command === 'CONN';
    //if (transient) {
      //console.warn('[SMTP] Error transitorio, registro guardado pero sin correo:', e.code || e.message);
    //} else {
      //throw e; // deja que el catch externo capture errores graves (credenciales malas, etc.)
    //}
  //}
  // === Fin parche ===
  // --- ENVÍO POR API HTTP DE BREVO (sin SMTP) ---
  try {
   await sendMailBrevoHttp({
     to: email,
     bcc: process.env.MAIL_BCC ? process.env.MAIL_BCC.split(',') : undefined,
     subject: process.env.MAIL_SUBJECT || 'Tu acceso — Webinar NMR School (Desacoplamiento en RMN)',
     html,
     icsBuffer: Buffer.from(ics, 'utf8')
   });
  } catch (e) {
  console.error('[BREVO_HTTP] fallo:', e.message || e);
  // Decide: o no rompes (200) o avisas 202
  // Aquí, si prefieres NO romper la UX:
  // (no throw) -> sigue con res.json ok más abajo
   }
  
  // Envía correo
    //await sendMailSmtp({
      //to: email,
      //bcc: process.env.MAIL_BCC ? process.env.MAIL_BCC.split(',') : undefined,
      //subject: process.env.MAIL_SUBJECT || 'Tu acceso — Webinar NMR School (Desacoplamiento en RMN)',
      //html,
      //icsBuffer: Buffer.from(ics,'utf8')
    //});

    // (Opcional) guarda en memoria/DB como haces en tus otros endpoints. :contentReference[oaicite:5]{index=5}
    // memStore.unshift({ firstName, lastName, email, phone, createdAt: new Date(), orgType, orgName, role, moreInfo: !!moreInfo });

    res.json({ ok:true, message:'Registro exitoso. Te enviamos tu invitación y .ics por correo.' });
  } catch (err) {
    console.error('[ERROR] /nmrschool/register:', err);
    res.status(500).json({ ok:false, error:'Error en el servidor.', detail: String(err.message || err) });
  }
});

// JSON completo
app.get('/nmrschool/registrants', (_, res) => {
  res.json({ ok: true, count: registrants.length, data: registrants });
});

// CSV
app.get('/nmrschool/registrants.csv', (_, res) => {
  const csv = toCSV(registrants);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrants.csv"');
  res.send(csv);
});


app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/healthz', (_,res)=>res.send('ok'));

// antes de tus rutas:
app.get('/diag', (_req,res) => {
  const diag = {
    tplExists: false,
    nmrTplPath: NMR_TPL_PATH,
    hasSmtpUser: !!process.env.SMTP_USER,
    hasSmtpPass: !!process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM || null,
    icsPublicUrl: typeof ICS_PUBLIC_URL !== 'undefined'
  };
  try { diag.tplExists = require('fs').existsSync(NMR_TPL_PATH); } catch {}
  res.json(diag);
});


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`NMR School webinar server listening on ${PORT}`);
});
