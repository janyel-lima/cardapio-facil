/* ═══════════════════════════════════════════════════
   js/mock-cloud.js
   Simula db.cloud para desenvolvimento local.
   Nunca carregado em produção.
═══════════════════════════════════════════════════ */

const MOCK_USERS = {
  'admin@test.com': {
    userId:    'mock-admin-001',
    name:      'Admin Dev',
    email:     'admin@test.com',
    roles:     ['admin'],
    isLoggedIn: true,
  },
  'worker@test.com': {
    userId:    'mock-worker-001',
    name:      'Atendente Dev',
    email:     'worker@test.com',
    roles:     ['worker'],
    isLoggedIn: true,
  },
  'cliente@test.com': {
    userId:    'mock-client-001',
    name:      'Cliente Dev',
    email:     'cliente@test.com',
    roles:     ['client'],
    isLoggedIn: true,
  },
};

// OTP fixo em dev — qualquer email aceita "123456"
const MOCK_OTP      = '123456';
const MOCK_DELAY_MS = 600; // simula latência de rede

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Estado interno do mock
let _currentUser    = { isLoggedIn: false };
let _pendingEmail   = null;
let _subscribers    = [];

function _notify(user) {
  _currentUser = user;
  _subscribers.forEach(fn => fn(user));
}

window.mockCloud = {

  // ── Replica db.cloud.currentUser.subscribe ──────────
  currentUser: {
    subscribe(fn) {
      _subscribers.push(fn);
      // Emite o estado atual imediatamente (igual ao Dexie)
      fn(_currentUser);
      return () => {
        _subscribers = _subscribers.filter(s => s !== fn);
      };
    }
  },

  // ── Replica db.cloud.login ──────────────────────────
  async login({ email, otp } = {}) {
    await delay(MOCK_DELAY_MS);

    // Passo 1 — recebe o email, guarda e "envia o OTP"
    if (email) {
      const known = Object.keys(MOCK_USERS);
      if (!known.includes(email)) {
        throw new Error(`Email não cadastrado no mock. Use: ${known.join(', ')}`);
      }
      _pendingEmail = email;
      console.info(`[MockCloud] OTP enviado para ${email} → use "${MOCK_OTP}"`);
      return; // sucesso silencioso, igual ao Dexie
    }

    // Passo 2 — recebe o OTP e autentica
    if (otp !== undefined) {
      if (String(otp) !== MOCK_OTP) {
        throw new Error('Código inválido. Use: ' + MOCK_OTP);
      }
      if (!_pendingEmail) {
        throw new Error('Nenhum email pendente. Recomece o fluxo.');
      }
      const user = MOCK_USERS[_pendingEmail];
      _pendingEmail = null;
      _notify({ ...user });
      console.info('[MockCloud] Login OK →', user);
      return;
    }

    throw new Error('Parâmetro inválido: passe { email } ou { otp }');
  },

  // ── Replica db.cloud.logout ─────────────────────────
  async logout() {
    await delay(MOCK_DELAY_MS / 2);
    _pendingEmail = null;
    _notify({ isLoggedIn: false });
    console.info('[MockCloud] Logout OK');
  },
};