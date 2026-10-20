// Avisos por correo de las Tareas de turno y de Mantenimiento · Seguimiento HTP
// Lo ejecuta GitHub Actions cada 15 minutos (.github/workflows/avisos-tareas.yml).
// Lee la colección "tareas" de Firestore con una cuenta de servicio y envía los correos por Gmail (SMTP).
// Lo enviado queda anotado en cada tarea (campo "notif") para no repetir correos.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

const TZ = "America/Santiago";
const DIAS_RECORDATORIO = [3, 1, 0];   // días antes del término en que se recuerda (0 = el mismo día)
const HORA_DESDE = 8;                   // los recordatorios se envían desde las 08:00 (hora de Chile)
const REPETIR_VENCIDA_CADA = 3;         // días entre avisos de tarea vencida

const { FIREBASE_SERVICE_ACCOUNT, SMTP_USER, SMTP_PASS } = process.env;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "jvilla@htpchile.cl").trim();
const APP_URL = (process.env.APP_URL || "https://jvillapena123-cell.github.io/seguimiento-htp/").trim();

if (!FIREBASE_SERVICE_ACCOUNT || !SMTP_USER || !SMTP_PASS) {
  console.log("Faltan secretos (FIREBASE_SERVICE_ACCOUNT, SMTP_USER o SMTP_PASS). No se envía nada.");
  process.exit(0);
}

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const mailer = nodemailer.createTransport({ service: "gmail", auth: { user: SMTP_USER, pass: SMTP_PASS } });

// ---------- Fechas en hora de Chile ----------
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
const diasEntre = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const fmt = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = t => (t.num ? String(t.num).padStart(3, "0") : "");

// ---------- Plantilla del correo ----------
function plantilla({ titulo, color = "#1F3A6E", intro, t, nota }) {
  const fila = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#5A6478;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:14px;color:#1A2233">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#F6F6F8;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F8;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #D9DBE3">
    <tr><td style="background:#1F3A6E;padding:16px 22px;color:#fff">
      <div style="font-size:12px;opacity:.85">Huachipato Terminal Portuario · Tareas de turno</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px">${esc(titulo)}</div></td></tr>
    <tr><td style="height:5px;background:${color}"></td></tr>
    <tr><td style="padding:20px 22px">
      <p style="margin:0 0 16px;font-size:14.5px;color:#1A2233;line-height:1.5">${intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #E8E8EC;border-bottom:1px solid #E8E8EC;margin-bottom:16px">
        ${fila("Tarea", `<b>N° ${num(t)} · ${esc(t.titulo)}</b>`)}
        ${t.descripcion ? fila("Detalle", esc(t.descripcion).replace(/\n/g, "<br>")) : ""}
        ${fila("Responsable", esc(t.responsable))}
        ${fila("Inicio", fmt(t.fechaInicio))}
        ${fila("Término", `<b>${fmt(t.fechaTermino)}</b>`)}
        ${fila("Prioridad", esc(t.prioridad || "Media"))}
        ${t.creadoPor ? fila("Asignada por", esc(t.creadoPor)) : ""}
      </table>
      ${nota ? `<p style="margin:0 0 16px;font-size:13.5px;color:#5A6478;line-height:1.5">${nota}</p>` : ""}
      <a href="${APP_URL}#tareas" style="display:inline-block;background:#E8804A;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:7px;font-size:14px">Abrir Tareas de turno</a>
    </td></tr>
    <tr><td style="padding:12px 22px;background:#F6F6F8;font-size:11.5px;color:#8A93A6">Correo automático del sistema de seguimiento HTP. La tarea solo puede cerrarse en la aplicación, con comentario y evidencia objetiva.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function enviar({ to, cc, subject, html }) {
  await mailer.sendMail({ from: `"Seguimiento HTP" <${SMTP_USER}>`, to, cc: cc && cc !== to ? cc : undefined, subject, html });
  console.log(`Enviado: "${subject}" → ${to}${cc && cc !== to ? " (cc " + cc + ")" : ""}`);
}

// ---------- Revisión de tareas ----------
const snap = await db.collection("tareas").get();
let enviados = 0, errores = 0;

for (const d of snap.docs) {
  const t = d.data();
  const n = t.notif || {};
  const upd = {};
  const para = String(t.responsableCorreo || "").toLowerCase();
  const asignadoA = `${t.responsableId || ""}|${para}`;
  try {
    // Tarea cerrada: avisar al administrador una vez
    if (t.estado === "Cerrada") {
      if (!n.cierre && t.cierre && t.cierre.fecha) {
        await enviar({
          to: ADMIN_EMAIL,
          subject: `✅ Tarea N° ${num(t)} cerrada por ${t.cierre.por || t.responsable}`,
          html: plantilla({
            titulo: "Tarea cerrada con evidencia", color: "#1E6B3A", t,
            intro: `<b>${esc(t.cierre.por || t.responsable)}</b> cerró la tarea el ${fmt(t.fechaCierre)}${t.fechaCierre && t.fechaTermino && t.fechaCierre > t.fechaTermino ? ` (<b style="color:#A3261B">${diasEntre(t.fechaTermino, t.fechaCierre)} día(s) después del plazo</b>)` : " dentro del plazo"}.`,
            nota: `<b>Comentario de cierre:</b> ${esc(t.cierre.comentario)}<br>Evidencia: ${esc(t.cierre.archivo && t.cierre.archivo.nombre || "adjunta en la aplicación")}`
          })
        });
        upd["notif.cierre"] = new Date().toISOString(); enviados++;
      }
      if (Object.keys(upd).length) await d.ref.update(upd);
      continue;
    }
    if (!para || !t.fechaTermino) continue;

    // 1) Asignación o reasignación
    if (n.asignadoA !== asignadoA) {
      await enviar({
        to: para,
        subject: `Nueva tarea asignada: N° ${num(t)} · ${t.titulo} (vence ${fmt(t.fechaTermino)})`,
        html: plantilla({
          titulo: n.asignadoA ? "Se le reasignó una tarea" : "Se le asignó una nueva tarea", t,
          intro: `Hola ${esc(t.responsable)}, se le asignó la siguiente tarea. Debe quedar cerrada a más tardar el <b>${fmt(t.fechaTermino)}</b>.`,
          nota: "Para cerrarla, ingrese a la aplicación, abra la tarea y use <b>Cerrar con evidencia</b>: escriba qué se hizo y adjunte una foto o un PDF. Recibirá recordatorios antes del vencimiento."
        })
      });
      upd["notif.asignadoA"] = asignadoA;
      upd["notif.asignacion"] = new Date().toISOString();
      upd["notif.recFecha"] = t.fechaTermino;
      // Los recordatorios cuyo día ya llegó se dan por cubiertos con este correo
      upd["notif.rec"] = DIAS_RECORDATORIO.filter(x => x >= diasEntre(hoy, t.fechaTermino)).map(String);
      enviados++;
      await d.ref.update(upd);
      continue;   // los recordatorios, en la próxima revisión
    }

    if (hora < HORA_DESDE) continue;
    const faltan = diasEntre(hoy, t.fechaTermino);
    const rec = n.recFecha === t.fechaTermino && Array.isArray(n.rec) ? n.rec : [];   // si cambió la fecha, se reinician

    // 2) Recordatorios antes del vencimiento
    if (faltan >= 0) {
      const umbral = DIAS_RECORDATORIO.filter(x => faltan <= x && !rec.includes(String(x))).sort((a, b) => a - b)[0];
      if (umbral != null) {
        const cuando = faltan === 0 ? "vence HOY" : faltan === 1 ? "vence mañana" : `vence en ${faltan} días`;
        await enviar({
          to: para,
          subject: `${faltan === 0 ? "⚠️ " : "⏰ "}Recordatorio: la tarea N° ${num(t)} ${cuando} (${fmt(t.fechaTermino)})`,
          html: plantilla({
            titulo: `Recordatorio: la tarea ${cuando}`, color: faltan <= 1 ? "#A3261B" : "#E8804A", t,
            intro: `Hola ${esc(t.responsable)}, le recordamos que esta tarea <b>${cuando}</b> y aún está ${t.estado === "En proceso" ? "en proceso" : "pendiente"}.`,
            nota: "Recuerde que solo se puede cerrar con comentario y evidencia objetiva (foto o PDF)."
          })
        });
        const nuevos = DIAS_RECORDATORIO.filter(x => x >= faltan).map(String);
        upd["notif.rec"] = [...new Set([...rec, ...nuevos])];
        upd["notif.recFecha"] = t.fechaTermino;
        enviados++;
      }
    } else {
      // 3) Tarea vencida: aviso con copia al administrador, cada REPETIR_VENCIDA_CADA días
      const ult = n.vencFecha === t.fechaTermino ? n.ultVenc : null;
      if (!ult || diasEntre(ult, hoy) >= REPETIR_VENCIDA_CADA) {
        await enviar({
          to: para, cc: ADMIN_EMAIL,
          subject: `🔴 Tarea vencida: N° ${num(t)} · ${t.titulo} (${-faltan} día${faltan === -1 ? "" : "s"} de atraso)`,
          html: plantilla({
            titulo: "Tarea vencida", color: "#A3261B", t,
            intro: `Hola ${esc(t.responsable)}, esta tarea venció el <b>${fmt(t.fechaTermino)}</b> y sigue abierta (<b>${-faltan} día${faltan === -1 ? "" : "s"} de atraso</b>).`,
            nota: "Ciérrela lo antes posible con su evidencia, o coordine con el administrador una nueva fecha."
          })
        });
        upd["notif.ultVenc"] = hoy; upd["notif.vencFecha"] = t.fechaTermino; enviados++;
      }
    }
    if (Object.keys(upd).length) await d.ref.update(upd);
  } catch (e) {
    errores++;
    console.error(`Error con la tarea ${d.id}:`, e.message);
  }
}

// ---------- Solicitudes de mantenimiento ----------
// Correo al responsable y al jefe de turno que hace el seguimiento cuando se asignan (o cambian),
// con la primera foto del problema. Al cerrarse, aviso al jefe de turno y a quien la solicitó.
function plantillaMant({ titulo, color = "#1F3A6E", intro, m, nota, conFoto }) {
  const fila = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#5A6478;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:14px;color:#1A2233">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#F6F6F8;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F8;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #D9DBE3">
    <tr><td style="background:#1F3A6E;padding:16px 22px;color:#fff">
      <div style="font-size:12px;opacity:.85">Huachipato Terminal Portuario · Mantenimiento de equipos</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px">${esc(titulo)}</div></td></tr>
    <tr><td style="height:5px;background:${color}"></td></tr>
    <tr><td style="padding:20px 22px">
      <p style="margin:0 0 16px;font-size:14.5px;color:#1A2233;line-height:1.5">${intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #E8E8EC;border-bottom:1px solid #E8E8EC;margin-bottom:16px">
        ${fila("Solicitud", `<b>N° ${num(m)} · ${esc(m.equipo)}</b> (${esc(m.area)})`)}
        ${fila("Problema", esc(m.descripcion).replace(/\n/g, "<br>"))}
        ${fila("Aviso SAP", m.avisoSap ? `<b>${esc(m.avisoSap)}</b>` : '<span style="color:#A0450F">Sin aviso SAP</span>')}
        ${fila("Prioridad", esc(m.prioridad || "Media"))}
        ${fila("Responsable", esc(m.responsable))}
        ${fila("Seguimiento", esc(m.seguidor) + " (jefe de turno)")}
        ${m.fechaCompromiso ? fila("Fecha comprometida", `<b>${fmt(m.fechaCompromiso)}</b>`) : ""}
        ${m.creadoPor ? fila("Solicitada por", esc(m.creadoPor)) : ""}
      </table>
      ${conFoto ? `<img src="cid:foto-problema" alt="Foto del problema" style="display:block;max-width:100%;border-radius:8px;border:1px solid #D9DBE3;margin:0 0 16px">` : ""}
      ${nota ? `<p style="margin:0 0 16px;font-size:13.5px;color:#5A6478;line-height:1.5">${nota}</p>` : ""}
      <a href="${APP_URL}#mant" style="display:inline-block;background:#E8804A;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:7px;font-size:14px">Abrir Mantenimiento</a>
    </td></tr>
    <tr><td style="padding:12px 22px;background:#F6F6F8;font-size:11.5px;color:#8A93A6">Correo automático del sistema de seguimiento HTP. La solicitud solo puede cerrarse en la aplicación, con comentario y evidencia objetiva.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function fotoDe(m) {
  const id = m.fotos && m.fotos[0] && m.fotos[0].evidId;
  if (!id) return null;
  try {
    const s = await db.collection("evidencias").doc(id).get();
    const data = s.exists ? s.data().data : null;
    return typeof data === "string" && data.startsWith("data:image/") ? data : null;
  } catch (e) { console.error("No se pudo leer la foto", id, e.message); return null; }
}

const snapM = await db.collection("mantenimiento").get();
for (const d of snapM.docs) {
  const m = d.data();
  const n = m.notif || {};
  const upd = {};
  try {
    if (m.estado === "Cerrada") {
      if (!n.cierre && m.cierre && m.cierre.fecha) {
        const seg = String(m.seguidorCorreo || "").toLowerCase();
        const cre = String(m.creadoPorCorreo || "").toLowerCase();
        const to = seg || cre || ADMIN_EMAIL;
        await enviar({
          to, cc: cre && cre !== to ? cre : undefined,
          subject: `✅ Mantenimiento N° ${num(m)} · ${m.equipo} cerrado por ${m.cierre.por || ""}`,
          html: plantillaMant({
            titulo: "Solicitud cerrada con evidencia", color: "#1E6B3A", m,
            intro: `<b>${esc(m.cierre.por || "")}</b> cerró la solicitud de <b>${esc(m.equipo)}</b> el ${fmt(m.fechaCierre)}.`,
            nota: `<b>Comentario de cierre:</b> ${esc(m.cierre.comentario)}<br>Evidencia: ${esc(m.cierre.archivo && m.cierre.archivo.nombre || "adjunta en la aplicación")}`
          })
        });
        upd["notif.cierre"] = new Date().toISOString(); enviados++;
      }
      if (Object.keys(upd).length) await d.ref.update(upd);
      continue;
    }

    const resp = String(m.responsableCorreo || "").toLowerCase();
    const seg = String(m.seguidorCorreo || "").toLowerCase();
    const kResp = `${m.responsableId || ""}|${resp}`;
    const kSeg = `${m.seguidorId || ""}|${seg}`;
    const avisarResp = resp && n.respA !== kResp;
    const avisarSeg = seg && n.segA !== kSeg;
    if (!avisarResp && !avisarSeg) continue;

    const foto = await fotoDe(m);
    const attachments = foto ? [{ filename: "foto-problema.jpg", path: foto, cid: "foto-problema" }] : undefined;
    const enviarM = async (opts) => {
      await mailer.sendMail({ from: `"Seguimiento HTP" <${SMTP_USER}>`, attachments, ...opts });
      console.log(`Enviado: "${opts.subject}" → ${opts.to}`);
      enviados++;
    };
    const asunto = `Mantenimiento N° ${num(m)} · ${m.equipo}${m.avisoSap ? ` · aviso SAP ${m.avisoSap}` : ""}`;
    const notaResp = "Ingrese a la aplicación para cambiar el estado (En proceso, Esperando repuesto). Para cerrarla use <b>Cerrar con evidencia</b>: describa la reparación y adjunte una foto o un PDF.";
    const notaSeg = "Usted hace el seguimiento de esta solicitud. Puede actualizar el aviso SAP, la fecha comprometida y el estado, y cerrarla con evidencia cuando el trabajo esté terminado.";

    if (avisarResp && avisarSeg && resp === seg) {
      await enviarM({
        to: resp, subject: `Se le asignó: ${asunto}`,
        html: plantillaMant({ titulo: "Nueva solicitud de mantenimiento", m, conFoto: !!foto,
          intro: `Hola ${esc(m.responsable)}, quedó como <b>responsable</b> y a cargo del <b>seguimiento</b> de esta solicitud de mantenimiento.`, nota: notaResp })
      });
    } else {
      if (avisarResp) await enviarM({
        to: resp, subject: `${n.respA ? "Se le reasignó" : "Se le asignó"}: ${asunto}`,
        html: plantillaMant({ titulo: n.respA ? "Se le reasignó una solicitud de mantenimiento" : "Nueva solicitud de mantenimiento", m, conFoto: !!foto,
          intro: `Hola ${esc(m.responsable)}, quedó como <b>responsable</b> de la siguiente solicitud de mantenimiento. ${esc(m.seguidor)} hará el seguimiento.`, nota: notaResp })
      });
      if (avisarSeg) await enviarM({
        to: seg, subject: `Seguimiento asignado: ${asunto}`,
        html: plantillaMant({ titulo: "Debe hacer el seguimiento de una solicitud", color: "#2A8FA8", m, conFoto: !!foto,
          intro: `Hola ${esc(m.seguidor)}, se le asignó el <b>seguimiento</b> de esta solicitud de mantenimiento. El responsable es <b>${esc(m.responsable)}</b>.`, nota: notaSeg })
      });
    }
    if (avisarResp) upd["notif.respA"] = kResp;
    if (avisarSeg) upd["notif.segA"] = kSeg;
    upd["notif.asignacion"] = new Date().toISOString();
    await d.ref.update(upd);
  } catch (e) {
    errores++;
    console.error(`Error con la solicitud de mantenimiento ${d.id}:`, e.message);
  }
}

console.log(`Revisión ${hoy} ${hora}h · ${snap.size} tareas · ${snapM.size} solicitudes de mantenimiento · ${enviados} correos enviados · ${errores} errores`);
if (errores) process.exit(1);
