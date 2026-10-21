// Publica firestore.rules del repositorio en Firebase · Seguimiento HTP
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const fuente = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const rs = await admin.securityRules().releaseFirestoreRulesetFromSource(fuente);
console.log(`Reglas publicadas en ${sa.project_id}: ${rs.name} (${rs.createTime})`);
