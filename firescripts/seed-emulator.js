#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   scripts/seed-emulator.js
   Cria usuários de teste com Custom Claims no emulador Firebase.

   Uso:
     node scripts/seed-emulator.js

   Pré-requisito:
     firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data

   O que faz:
     1. Aguarda o emulador de Auth estar pronto
     2. Cria 3 usuários com email+senha no Auth Emulator
     3. Seta Custom Claim { role } via endpoint REST do emulador
     4. Idempotente: re-rodar não duplica usuários
═══════════════════════════════════════════════════════ */

const PROJECT_ID    = 'REPLACE_WITH_YOUR_PROJECT_ID'; // mesmo do firebase-config.js
const AUTH_URL      = 'http://localhost:9099';
const FAKE_API_KEY  = 'fake-api-key'; // o emulador aceita qualquer valor

const TEST_USERS = [
  { email: 'admin@test.com',   password: 'admin123',   role: 'admin'  },
  { email: 'worker@test.com',  password: 'worker123',  role: 'worker' },
  { email: 'cliente@test.com', password: 'cliente123', role: 'client' },
];
// ⚠️  Senhas devem bater com _devQuickLogin() em auth.js:
//     prefixo do e-mail + "123"  (ex: "admin" → "admin123")

/* ── Helpers ──────────────────────────────────────────── */

async function waitForEmulator(retries = 20, intervalMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${AUTH_URL}/`);
      if (res.ok || res.status === 404) return;
    } catch { /* ainda não está pronto */ }
    console.log(`⏳ Aguardando emulador de Auth... (${i + 1}/${retries})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Emulador de Auth não respondeu. Rode: firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data');
}

async function createAuthUser(email, password) {
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = await res.json();

  if (data.error) {
    if (data.error.message === 'EMAIL_EXISTS') {
      // Usuário já existe — busca o localId
      const lookup = await fetch(
        `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FAKE_API_KEY}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email }),
        },
      );
      const lData = await lookup.json();
      return lData.users?.[0]?.localId ?? null;
    }
    throw new Error(`Auth signUp error for ${email}: ${data.error.message}`);
  }

  return data.localId;
}

// Seta Custom Claim via endpoint admin do emulador de Auth.
// Bearer owner + localId no body = equivalente ao Admin SDK no emulador.
async function setCustomClaim(localId, role) {
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:update`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify({
        localId,
        customAttributes: JSON.stringify({ role }),
      }),
    },
  );
  const data = await res.json();
  if (data.error) {
    throw new Error(`setCustomClaim error para ${localId}: ${data.error.message}`);
  }
}

/* ── Main ─────────────────────────────────────────────── */

async function seed() {
  console.log('🌱 Seeding emulator users com Custom Claims...\n');
  await waitForEmulator();

  for (const user of TEST_USERS) {
    try {
      const uid = await createAuthUser(user.email, user.password);
      await setCustomClaim(uid, user.role);
      console.log(`✅  ${user.role.padEnd(7)} → ${user.email}  (uid: ${uid})`);
    } catch (e) {
      console.error(`❌  ${user.email}: ${e.message}`);
    }
  }

  console.log('\n✨ Seed concluído.\n');
  console.log('📌 Credenciais de teste:');
  TEST_USERS.forEach(u =>
    console.log(`   ${u.role.padEnd(7)} → ${u.email} / ${u.password}`)
  );
  console.log('\n💡 Custom Claims prontos — Dev Toolbar → Login rápido funcionará imediatamente.\n');
}

seed().catch(console.error);