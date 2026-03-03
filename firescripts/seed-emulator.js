#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   scripts/seed-emulator.js
   Cria usuários de teste com roles no emulador Firebase.

   Uso:
     node scripts/seed-emulator.js

   Pré-requisito:
     firebase emulators:start   (Firestore :8080 + Auth :9099)

   O que faz:
     1. Cria 3 usuários no Auth Emulator (admin, worker, cliente)
     2. Grava o doc /users/{uid} no Firestore Emulator com a role
     3. Idempotente: re-rodar não duplica usuários
═══════════════════════════════════════════════════════ */

const PROJECT_ID   = 'REPLACE_WITH_YOUR_PROJECT_ID'; // mesmo do firebase-config.js
const AUTH_URL     = `http://localhost:9099`;
const FIRESTORE_URL= `http://localhost:8080`;

const TEST_USERS = [
  { email: 'admin@test.com',   password: 'admin123',   role: 'admin'  },
  { email: 'worker@test.com',  password: 'worker123',  role: 'worker' },
  { email: 'cliente@test.com', password: 'cliente123', role: 'client' },
];
// ⚠️  As senhas acima devem bater com a função _devQuickLogin() em auth.js,
//     que deriva: prefixo do e-mail + "123" (ex: "admin" → "admin123")

/* ── Helpers ─────────────────────────────────────────── */

async function createAuthUser(email, password) {
  // REST API do emulador de Auth
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = await res.json();

  if (data.error) {
    // EMAIL_EXISTS → busca o uid existente
    if (data.error.message === 'EMAIL_EXISTS') {
      const lookup = await fetch(
        `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        },
      );
      const lData = await lookup.json();
      return lData.users?.[0]?.localId ?? null;
    }
    throw new Error(`Auth error for ${email}: ${data.error.message}`);
  }

  return data.localId; // uid
}

async function setUserRole(uid, role) {
  // REST API do emulador de Firestore
  const url = `${FIRESTORE_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        role: { stringValue: role },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore error for uid ${uid}: ${err}`);
  }
}

/* ── Main ─────────────────────────────────────────────── */

async function seed() {
  console.log('🌱 Seeding emulator users...\n');

  for (const user of TEST_USERS) {
    try {
      const uid = await createAuthUser(user.email, user.password);
      await setUserRole(uid, user.role);
      console.log(`✅  ${user.role.padEnd(7)} → ${user.email}  (uid: ${uid})`);
    } catch (e) {
      console.error(`❌  ${user.email}: ${e.message}`);
    }
  }

  console.log('\n✨ Seed concluído. Dev Toolbar → Login rápido está pronto.\n');
  console.log('📌 Credenciais de teste:');
  TEST_USERS.forEach(u =>
    console.log(`   ${u.role.padEnd(7)} → ${u.email} / ${u.password}`)
  );
}

seed().catch(console.error);