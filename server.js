// ======== NMR School — Webinar RMN ========
const path = require('path');
const fs   = require('fs');
const nodemailer = require('nodemailer');

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

// SMTP (Gmail) — mismo esquema que ya usas con nodemailer y adjuntos .ics. :contentReference[oaicite:3]{index=3}
async function sendMailSmtp({ to, bcc, subject, html, icsBuffer }) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER;  // ej. contacto@nmrschool.com
  const pass = process.env.SMTP_PASS;  // APP PASSWORD de Gmail
  const from = process.env.MAIL_FROM || user;
  if (!host || !user || !pass) throw new Error('SMTP faltante');

  const attachments = icsBuffer ? [{
    filename: 'nmrschool-webinar.ics',
    content: icsBuffer,
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
  }] : [];

  const trySend = async (port, secure) => {
    const transporter = nodemailer.createTransport({
      host, port, secure, auth: { user, pass },
      requireTLS: !secure, tls: { servername: host }
    });
    return transporter.sendMail({ from, to, bcc, subject, html, attachments });
  };

  try {
    return await trySend(Number(process.env.SMTP_PORT || 465), true);
  } catch (e) {
    // fallback STARTTLS 587 (mismo patrón de retry que usas) :contentReference[oaicite:4]{index=4}
    return await trySend(587, false);
  }
}

// Renderiza plantilla muy simple: {{clave}}
function renderTemplate(tpl, vars) {
  return Object.entries(vars).reduce(
    (h,[k,v]) => h.replace(new RegExp(`{{\\s*${k}\\s*}}`,'g'), String(v ?? '')),
    tpl
  );
}

// Plantilla del correo de invitación (ajusta la ruta si la pones en otro lugar)
const NMR_TPL_PATH = process.env.NMR_TPL_PATH || path.join(__dirname, 'correo_ticket.html');

// Endpoint de registro
app.post('/nmrschool/register', async (req, res) => {
  try {
    const {
      firstName, lastName, orgType, orgName, role, email, phone, moreInfo
    } = req.body || {};

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ ok:false, error:'firstName, lastName y email son obligatorios.' });
    }

    // QR directo al Zoom (puedes cambiarlo a QR de VEvent si prefieres)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(NMR_EVENT.zoomUrl)}`;

    // Carga plantilla y reemplaza variables
    const tpl = fs.readFileSync(NMR_TPL_PATH, 'utf8');
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
      qrUrl
    });

    // ICS
    const ics = buildIcsWebinar();

    // Envía correo
    await sendMailSmtp({
      to: email,
      bcc: process.env.MAIL_BCC ? process.env.MAIL_BCC.split(',') : undefined,
      subject: process.env.MAIL_SUBJECT || 'Tu acceso — Webinar NMR School (Desacoplamiento en RMN)',
      html,
      icsBuffer: Buffer.from(ics,'utf8')
    });

    // (Opcional) guarda en memoria/DB como haces en tus otros endpoints. :contentReference[oaicite:5]{index=5}
    // memStore.unshift({ firstName, lastName, email, phone, createdAt: new Date(), orgType, orgName, role, moreInfo: !!moreInfo });

    res.json({ ok:true, message:'Registro exitoso. Te enviamos tu invitación y .ics por correo.' });
  } catch (err) {
    console.error('[ERROR] /nmrschool/register:', err);
    res.status(500).json({ ok:false, error:'Error en el servidor.' });
  }
});
