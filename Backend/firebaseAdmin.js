// Backend/firebaseAdmin.js
require("dotenv").config();
const admin = require("firebase-admin");

// Las credenciales salen del .env (nunca subir el JSON de la service account al repo)
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Firebase entrega la private key con \n escapados dentro del .env,
  // hay que reemplazarlos por saltos de línea reales:
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };