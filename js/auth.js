/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/auth.js
   Autenticação via Firebase Authentication (Email Link)

   Migrado de: Dexie Cloud OTP
   Estratégia: Email Link (passwordless) — Firebase nativo
   Melhoria: sem código numérico frágil; link criptograficamente
             assinado pelo Firebase, expiração automática.

   Roles: armazenadas em Firestore /users/{uid}.role
          ('admin' | 'worker' | 'client')
═══════════════════════════════════════════════════════ */

const appAuth = {

  // ── Estado reativo ─────────────────────────────────────────────────────────
  cloudUser:         null,
  cloudSyncing:      false,
  cloudLoginEmail:   '',
  cloudLoginOtp:     '',           // mantido para compatibilidade com HTML (não usado no Firebase)
  cloudLoginStep:    'email',      // 'email' | 'otp' (= link enviado) | 'done'
  cloudLoginError:   '',
  cloudOtpSent:      false,        // mantido para compatibilidade com HTML
  showAdminLogin:    false,
  showAdminPanel:    false,
  _pendingPanelOpen: false,


  // ── Roles derivadas — sempre com guarda de null ────────────────────────────
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


  // ── Passo 1 — envia o Email Link ───────────────────────────────────────────
  // Substitui cloudSendOtp() do Dexie Cloud.
  // Mesmo nome → sem alteração nos templates HTML.
  async cloudSendOtp() {
    if (!this.cloudLoginEmail.trim()) {
      this.cloudLoginError = 'Digite seu e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      this.cloudSyncing    = true;

      const actionCodeSettings = {
        // URL para onde o Firebase redireciona após o clique.
        // Em produção, deve ser o domínio do seu app (ex: https://meurestaurante.web.app).
        url:             window.location.origin + window.location.pathname,
        handleCodeInApp: true,
      };

      await firebaseAuth.sendSignInLinkToEmail(
        this.cloudLoginEmail.trim(),
        actionCodeSettings,
      );

      // Persiste o e-mail para completar o sign-in quando o link for clicado
      // (mesmo dispositivo → sem precisar digitar o e-mail novamente).
      localStorage.setItem('cardapio_signInEmail', this.cloudLoginEmail.trim());

      this.cloudLoginStep = 'otp';    // reutiliza estado → HTML mostra tela "verifique e-mail"
      this.cloudOtpSent   = true;

    } catch (e) {
      this.cloudLoginError = _mapFirebaseAuthError(e.code) || e.message || 'Falha ao enviar link. Tente novamente.';
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Passo 2 — não é mais necessário ───────────────────────────────────────
  // Com Firebase Email Link, o sign-in é completado automaticamente quando
  // o usuário clica no link. Este método existe apenas para não quebrar
  // templates HTML que chamam cloudConfirmOtp().
  async cloudConfirmOtp() {
    this.cloudLoginError = '📧 Clique no link enviado para ' + (this.cloudLoginEmail || 'seu e-mail') + ' para entrar.';
  },


  // ── Logout ─────────────────────────────────────────────────────────────────
  async cloudLogout() {
    try {
      await firebaseAuth.signOut();
      // onAuthStateChanged cuida do reset da UI
    } catch (e) {
      await this.logError?.(e.message || String(e), {
        source: 'cloudLogout', type: 'authError', stack: e.stack || null,
      }, 'auth');
    }
  },


  // ── Processa Email Link na URL (chamado em init()) ─────────────────────────
  // Detecta se a URL atual contém um link de sign-in do Firebase e o processa.
  // Cuida do caso "link aberto em outro dispositivo" pedindo o e-mail via prompt.
  async _checkEmailLink() {
    try {
      if (!firebaseAuth.isSignInWithEmailLink(window.location.href)) return;

      let email = localStorage.getItem('cardapio_signInEmail');

      if (!email) {
        // Usuário abriu o link em outro dispositivo — solicita confirmação do e-mail
        email = window.prompt(
          'Para continuar, confirme o endereço de e-mail que você usou para entrar:',
        );
        if (!email) return;
      }

      this.cloudSyncing      = true;
      this._pendingPanelOpen = true;

      await firebaseAuth.signInWithEmailLink(email.trim(), window.location.href);

      localStorage.removeItem('cardapio_signInEmail');

      // Remove o link de sign-in da URL (segurança + UX limpo)
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (e) {
      console.error('[auth] Erro ao processar email link:', e);
      this.cloudLoginError   = _mapFirebaseAuthError(e.code) || 'Link inválido ou expirado. Solicite um novo.';
      this._pendingPanelOpen = false;
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Subscriber: onAuthStateChanged ────────────────────────────────────────
  // Única fonte de verdade para estado de autenticação.
  // Busca a role do usuário no Firestore /users/{uid} após cada login.
  _initCloudAuth() {
    // Verifica link de e-mail na URL antes de registrar o subscriber
    this._checkEmailLink();

    firebaseAuth.onAuthStateChanged(async firebaseUser => {
      if (!firebaseUser) {
        // Sessão encerrada ou expirada — reseta tudo
        this.cloudUser         = null;
        this.showAdminPanel    = false;
        this.showAdminLogin    = false;
        this.showClientLogin   = false;
        this._pendingPanelOpen = false;
        this.cloudLoginStep    = 'email';
        this.cloudOtpSent      = false;
        return;
      }

      // Busca role no Firestore (/users/{uid})
      // roles são definidas pelo admin diretamente no Firestore Console
      // ou via função auxiliar _setUserRole() abaixo.
      let roles = [];
      try {
        const userDoc = await firestoreDb.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists) {
          const role = userDoc.data()?.role;
          if (role) roles = [role];
        }
      } catch (e) {
        // Falha não-crítica: usuário autenticado mas sem role definida = cliente
        console.warn('[auth] Não foi possível carregar role:', e.message);
      }

      this.cloudUser = {
        userId:     firebaseUser.uid,
        name:       firebaseUser.displayName
                      || firebaseUser.email?.split('@')[0]
                      || 'Usuário',
        email:      firebaseUser.email,
        roles,
        isLoggedIn: true,
      };

      // Fecha modais de login sempre que autenticado
      this.showAdminLogin    = false;
      this.showClientLogin   = false;
      this.cloudLoginStep    = 'done';
      this._loadUserProfile?.();
      this.showLoginNudge    = false;

      // Carrega dados protegidos agora que roles estão definidas
      // (orders para worker/admin, auditLog para admin)
      await this.loadProtectedData?.();

      // Abre painel se havia intenção pendente E o usuário tem a role
      if (this._pendingPanelOpen) {
        this._pendingPanelOpen = false;
        if (this.isCloudAdmin || this.isCloudWorker) {
          this.showAdminPanel = true;
        }
      }

      // Se o painel está aberto mas o usuário perdeu a role (rebaixado remotamente)
      if (this.showAdminPanel && !this.isCloudAdmin && !this.isCloudWorker) {
        this.showAdminPanel = false;
      }
    });
  },


  // ── Dev: Login rápido via Firebase Auth Emulator ──────────────────────────
  // Usado EXCLUSIVAMENTE pelo Dev Toolbar (APP_ENV.isDev).
  //
  // Usa signInWithEmailAndPassword (muito mais simples que Email Link)
  // porque o seed-emulator.js cria os usuários com senha determinística.
  //
  // Senhas dos usuários de teste (definidas em scripts/seed-emulator.js):
  //   admin@test.com   → admin123
  //   worker@test.com  → worker123
  //   cliente@test.com → cliente123
  async _devQuickLogin(email) {
    if (!window.APP_ENV?.isDev) return;

    // Deriva a senha a partir do prefixo do e-mail (ex: "admin" → "admin123")
    const prefix   = email.split('@')[0];
    const password = `${prefix}123`;

    try {
      this.cloudSyncing      = true;
      this._pendingPanelOpen = true;
      await firebaseAuth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged → loadProtectedData() → abre painel se admin/worker
    } catch (e) {
      this._pendingPanelOpen = false;
      const msg = e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password'
        ? `Usuário não encontrado no emulador. Rode: node scripts/seed-emulator.js`
        : e.message;
      this.showToast?.('Dev login falhou: ' + msg, 'error', '🔴');
      console.error('[dev] _devQuickLogin falhou:', e.code, msg);
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Utilitário: define role de um usuário (uso admin) ─────────────────────
  // Chame no console do browser ou em um script de setup:
  //   await this._setUserRole('uid-do-usuario', 'admin')
  async _setUserRole(uid, role) {
    const validRoles = ['admin', 'worker', 'client'];
    if (!validRoles.includes(role)) {
      throw new Error(`Role inválida: "${role}". Use: ${validRoles.join(', ')}`);
    }
    await firestoreDb.collection('users').doc(uid).set({ role }, { merge: true });
    console.info(`[auth] Role "${role}" atribuída ao usuário ${uid}`);
  },
};


// ── Mapeamento de códigos Firebase → mensagens PT-BR ──────────────────────────
function _mapFirebaseAuthError(code) {
  const map = {
    'auth/invalid-email':           'E-mail inválido.',
    'auth/user-not-found':          'Usuário não encontrado.',
    'auth/invalid-action-code':     'Link inválido ou já utilizado.',
    'auth/expired-action-code':     'Link expirado. Solicite um novo.',
    'auth/too-many-requests':       'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed':  'Erro de conexão. Verifique sua internet.',
    'auth/email-already-in-use':    'E-mail já cadastrado.',
    'auth/operation-not-allowed':   'Método de autenticação não habilitado. Ative "Email Link" no Firebase Console → Authentication → Sign-in methods.',
    'auth/missing-email':           'E-mail não informado.',
  };
  return map[code] || null;
}