/* ═══════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/auth.js
   Autenticação via Dexie Cloud (OTP email)
═══════════════════════════════════════════════════ */

function _resolveCloud() {
  if (window.APP_ENV?.isDev && window.mockCloud) return window.mockCloud;
  return db.cloud;
}

const appAuth = {

  // ── Estado reativo ─────────────────────────────
  cloudUser:        null,
  cloudSyncing:     false,
  cloudLoginEmail:  '',
  cloudLoginOtp:    '',
  cloudLoginStep:   'email',  // 'email' | 'otp' | 'done'
  cloudLoginError:  '',
  cloudOtpSent:     false,
  showAdminLogin:   false,
  showAdminPanel:   false,

  // Flag interna: sinaliza ao subscriber para abrir o painel
  // caso o usuário logado seja admin ou worker.
  // Evita race condition onde cloudConfirmOtp() checa roles
  // antes do subscriber atualizar cloudUser.
  _pendingPanelOpen: false,


  // ── Roles derivadas — SEMPRE com guarda ────────
  get isCloudAuthenticated() {
    return !!this.cloudUser && this.cloudUser.isLoggedIn === true;
  },

  get isCloudAdmin() {
    if (!this.isCloudAuthenticated) return false;
    return this.cloudUser?.roles?.includes('admin') ?? false;
  },

  get isCloudWorker() {
    if (!this.isCloudAuthenticated) return false;
    return this.cloudUser?.roles?.includes('worker') ?? false;
  },

  get isCloudClient() {
    if (!this.isCloudAuthenticated) return false;
    return this.cloudUser?.roles?.includes('client') ?? false;
  },


  // ── Subscriber ─────────────────────────────────
  // Única fonte de verdade para abrir/fechar o painel.
  // cloudConfirmOtp() apenas levanta a flag _pendingPanelOpen;
  // a decisão real acontece aqui, com cloudUser já atualizado.
  _initCloudAuth() {
    const cloud = _resolveCloud();

    cloud.currentUser.subscribe(user => {
      this.cloudUser = user ?? null;

      if (!this.isCloudAuthenticated) {
        // Sessão encerrada ou expirada — fecha tudo
        this.showAdminPanel    = false;
        this.showAdminLogin    = false;
        this.showClientLogin   = false;
        this._pendingPanelOpen = false;

      } else {
        // Autenticado — fecha modais de login sempre
        this.showAdminLogin  = false;
        this.showClientLogin = false;
        this._loadUserProfile();
        this.showLoginNudge = false;

        // Abre o painel somente se:
        //   (a) havia uma intenção pendente de abrir (login recém-feito), E
        //   (b) o usuário realmente tem a role adequada
        if (this._pendingPanelOpen) {
          this._pendingPanelOpen = false;
         
          // Clientes: não abre o painel — apenas logou normalmente
        }

        // Se o painel está aberto mas o usuário perdeu a role
        // (ex: rebaixado remotamente), fecha o painel.
        if (this.showAdminPanel && !this.isCloudAdmin && !this.isCloudWorker) {
          this.showAdminPanel = false;
        }
      }
    });
  },


  // ── Login Passo 1 — envia o OTP ────────────────
  async cloudSendOtp() {
    if (!this.cloudLoginEmail.trim()) {
      this.cloudLoginError = 'Digite seu e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      this.cloudSyncing    = true;

      await _resolveCloud().login({ email: this.cloudLoginEmail.trim() });

      this.cloudLoginStep = 'otp';
      this.cloudOtpSent   = true;

    } catch (e) {
      this.cloudLoginError = e.message || 'Falha ao enviar código. Tente novamente.';
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Login Passo 2 — confirma o OTP ────────────
  async cloudConfirmOtp() {
    if (!this.cloudLoginOtp.trim()) {
      this.cloudLoginError = 'Digite o código recebido por e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      this.cloudSyncing    = true;

      // Sinaliza ANTES do await: o subscriber pode disparar
      // de forma síncrona durante login() em alguns ambientes (ex: mock).
      // Colocar a flag antes garante que ela esteja levantada
      // quando o subscriber rodar, independentemente do timing.
      this._pendingPanelOpen = true;

      await _resolveCloud().login({ otp: this.cloudLoginOtp.trim() });

      this.cloudLoginStep  = 'done';
      this.cloudLoginEmail = '';
      this.cloudLoginOtp   = '';

      // Nota: NÃO verificamos isCloudAdmin/isCloudWorker aqui.
      // O subscriber (_initCloudAuth) é responsável por abrir o painel
      // com cloudUser já atualizado. Se o subscriber já disparou
      // de forma síncrona durante login(), a flag já foi consumida
      // e _pendingPanelOpen já é false aqui — sem duplicidade.

    } catch (e) {
      this._pendingPanelOpen = false; // limpa flag se login falhou
      this.cloudLoginError = e.message || 'Código inválido ou expirado.';
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Logout ─────────────────────────────────────
  async cloudLogout() {
    try {
      await _resolveCloud().logout();
      // Subscriber cuida do reset da UI
    } catch (e) {
      await this.logError?.(e.message || String(e), {
        source: 'cloudLogout', type: 'authError', stack: e.stack || null,
      }, 'auth');
    }
  },
};