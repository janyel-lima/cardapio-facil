/* ═══════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/auth.js
   Autenticação via Dexie Cloud (OTP email)
═══════════════════════════════════════════════════ */

const appAuth = {

  // ── Estado reativo ─────────────────────────────
  cloudUser:        null,   // objeto DexieCloudUser corrente
  cloudSyncing:     false,
  cloudLoginEmail:  '',
  cloudLoginOtp:    '',
  cloudLoginStep:   'email',  // 'email' | 'otp' | 'done'
  cloudLoginError:  '',

  // ── Roles derivadas (getters) ──────────────────
  get isCloudAdmin() {
    return this.cloudUser?.roles?.includes('admin') ?? false;
  },

  get isCloudWorker() {
    return this.cloudUser?.roles?.includes('worker') ?? false;
  },

  get isCloudAuthenticated() {
    return !!this.cloudUser && !this.cloudUser.isLoggedIn === false;
  },

  // ── Inicializa subscriber ao currentUser ───────
  // Chamado dentro de init() do app.js, após loadAllData().
  _initCloudAuth() {
    // db.cloud.currentUser é um Observable (rxjs)
    // Subscribimos para manter cloudUser reativo no Alpine.
    db.cloud.currentUser.subscribe(user => {
      this.cloudUser = user ?? null;
    });

    db.cloud.syncState.subscribe(state => {
      this.cloudSyncing = state?.phase === 'pushing' || state?.phase === 'pulling';
    });
  },

  // ── Login: passo 1 — envia OTP para o email ────
  async cloudSendOtp() {
    if (!this.cloudLoginEmail.trim()) {
      this.cloudLoginError = 'Informe seu e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      await db.cloud.login({ email: this.cloudLoginEmail.trim() });
      this.cloudLoginStep = 'otp';
      this.logInfo('OTP enviado para login cloud', {
        source: 'cloudSendOtp', type: 'authOtpSent',
      }, 'auth');
    } catch (e) {
      this.cloudLoginError = 'Erro ao enviar código. Tente novamente.';
      await this.logError(e.message || String(e), {
        source: 'cloudSendOtp', type: 'authError', stack: e.stack || null,
      }, 'auth');
    }
  },

  // ── Login: passo 2 — confirma o OTP ───────────
  async cloudConfirmOtp() {
    if (!this.cloudLoginOtp.trim()) {
      this.cloudLoginError = 'Digite o código recebido por e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      await db.cloud.login({ otp: this.cloudLoginOtp.trim() });
      this.cloudLoginStep  = 'done';
      this.cloudLoginEmail = '';
      this.cloudLoginOtp   = '';
      this.showAdminLogin  = false;
      this.showAdminPanel  = this.isCloudAdmin || this.isCloudWorker;
      this.logInfo('Login cloud confirmado', {
        source: 'cloudConfirmOtp', type: 'authSuccess', userId: this.cloudUser?.userId,
      }, 'auth');
    } catch (e) {
      this.cloudLoginError = 'Código inválido ou expirado.';
      await this.logError(e.message || String(e), {
        source: 'cloudConfirmOtp', type: 'authOtpError', stack: e.stack || null,
      }, 'auth');
    }
  },

  // ── Logout ─────────────────────────────────────
  async cloudLogout() {
    try {
      this.logInfo('Logout cloud', {
        source: 'cloudLogout', type: 'authLogout', userId: this.cloudUser?.userId,
      }, 'auth');
      await db.cloud.logout();
      this.showAdminPanel = false;
      this.cloudLoginStep = 'email';
      this.showToast('Sessão encerrada', 'success', '🔒');
    } catch (e) {
      await this.logError(e.message || String(e), {
        source: 'cloudLogout', type: 'authError', stack: e.stack || null,
      }, 'auth');
    }
  },
};