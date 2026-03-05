/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/auth.js
   Autenticação via Firebase Authentication (Email Link)

   Roles: Custom Claims no JWT do usuário → { role: "admin" | "worker" | "client" }

   Perfil integrado com Firebase Auth:
     displayName → firebaseAuth.currentUser.updateProfile()
     phone       → Firestore /users/{uid} (Auth não expõe phone sem phoneAuth)
     email       → read-only, vem de firebaseAuth.currentUser.email

   Como definir roles:
     Dev  → node scripts/seed-emulator.js  (seta via REST do emulador)
     Prod → node scripts/manage-roles.js set email role  (Admin SDK)

   Flags de boot:
     _pendingPanelOpen  → abre o painel admin após login via Email Link
     _forceTokenRefresh → força getIdTokenResult(true) sem abrir painel
                          usado pelo _devQuickLogin para garantir claims
                          atualizados sem efeito colateral de UI
═══════════════════════════════════════════════════════ */

const appAuth = {

  // ── Estado reativo ─────────────────────────────────────────────────────────
  cloudUser:          null,
  cloudSyncing:       false,
  cloudLoginEmail:    '',
  cloudLoginOtp:      '',
  cloudLoginStep:     'email',      // 'email' | 'otp' | 'done'
  cloudLoginError:    '',
  cloudOtpSent:       false,
  showAdminLogin:     false,
  showAdminPanel:     false,
  showUserProfile:    false,
  userProfileTab:     'profile',
  _pendingPanelOpen:  false,   // abre painel admin após Email Link login
  _forceTokenRefresh: false,   // força refresh do token sem abrir painel (dev login)
  _profileSaving:     false,

  // userProfile espelha os campos editáveis do Firebase Auth + Firestore /users/{uid}.
  // Populado por _loadUserProfile() após cada onAuthStateChanged.
  userProfile: {
    displayName: '',
    phone:       '',
  },


  // ── Roles derivadas ────────────────────────────────────────────────────────
  get isCloudAuthenticated() {
    return !!this.cloudUser && this.cloudUser.isLoggedIn === true;
  },

  get isCloudAdmin() {
    return this.isCloudAuthenticated && (this.cloudUser?.roles?.includes('admin') ?? false);
  },

  get isCloudWorker() {
    return this.isCloudAuthenticated && (this.cloudUser?.roles?.includes('worker') ?? false);
  },

  get isCloudClient() {
    return this.isCloudAuthenticated && (this.cloudUser?.roles?.includes('client') ?? false);
  },


  // ── Computed de UI ─────────────────────────────────────────────────────────

  get userAvatarInitial() {
    const name  = this.userProfile.displayName || this.cloudUser?.name || '';
    const email = this.cloudUser?.email || '';
    const src   = name.trim() || email;
    return src ? src.trim().charAt(0).toUpperCase() : '?';
  },

  get userRoleLabel() {
    if (!this.isCloudAuthenticated) return null;
    if (this.isCloudAdmin)  return { text: '👑 Admin',      color: '#8b5cf6', bg: 'rgba(139,92,246,.12)' };
    if (this.isCloudWorker) return { text: '🧑‍🍳 Atendente', color: '#f59e0b', bg: 'rgba(245,158,11,.12)'  };
    return                         { text: '🛒 Cliente',    color: '#3b82f6', bg: 'rgba(59,130,246,.12)'  };
  },

  get myOrders() {
    if (!this.isCloudAuthenticated || !this.cloudUser?.userId) return [];
    return [...this.orderHistory]
      .filter(o => o.userId === this.cloudUser.userId)
      .reverse();
  },


  // ── Dev: credenciais do seed-emulator.js ──────────────────────────────────
  //
  // Fonte única de verdade — espelha exatamente os usuários criados em
  // seed-emulator.js. Se alterar lá, atualize aqui também.
  get devUsers() {
    return [
      { email: 'admin@demo.com',   password: 'admin123',   role: 'admin',  icon: '👑', label: 'Admin'     },
      { email: 'worker@demo.com',  password: 'worker123',  role: 'worker', icon: '🧑‍🍳', label: 'Atendente' },
      { email: 'cliente@demo.com', password: 'cliente123', role: 'client', icon: '🛒', label: 'Cliente'    },
    ];
  },


  // ── Passo 1 — envia o Email Link ───────────────────────────────────────────
  async cloudSendOtp() {
    if (!this.cloudLoginEmail.trim()) {
      this.cloudLoginError = 'Digite seu e-mail.';
      return;
    }
    try {
      this.cloudLoginError = '';
      this.cloudSyncing    = true;

      await firebaseAuth.sendSignInLinkToEmail(this.cloudLoginEmail.trim(), {
        url:             window.location.origin + window.location.pathname,
        handleCodeInApp: true,
      });

      localStorage.setItem('cardapio_signInEmail', this.cloudLoginEmail.trim());
      this.cloudLoginStep = 'otp';
      this.cloudOtpSent   = true;

    } catch (e) {
      this.cloudLoginError = _mapFirebaseAuthError(e.code) || e.message || 'Falha ao enviar link. Tente novamente.';
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── Passo 2 — stub (Email Link não usa OTP numérico) ──────────────────────
  async cloudConfirmOtp() {
    this.cloudLoginError = '📧 Clique no link enviado para ' + (this.cloudLoginEmail || 'seu e-mail') + ' para entrar.';
  },


  // ── Logout ─────────────────────────────────────────────────────────────────
  async cloudLogout() {
    try {
      await firebaseAuth.signOut();
    } catch (e) {
      await this.logError?.(e.message || String(e), {
        source: 'cloudLogout', type: 'authError', stack: e.stack || null,
      }, 'auth');
    }
  },


  // ── Processa Email Link na URL ─────────────────────────────────────────────
  async _checkEmailLink() {
    try {
      if (!firebaseAuth.isSignInWithEmailLink(window.location.href)) return;

      let email = localStorage.getItem('cardapio_signInEmail');
      if (!email) {
        email = window.prompt('Confirme o e-mail usado para entrar:');
        if (!email) return;
      }

      this.cloudSyncing      = true;
      this._pendingPanelOpen = true;   // Email Link → abre painel admin

      await firebaseAuth.signInWithEmailLink(email.trim(), window.location.href);

      localStorage.removeItem('cardapio_signInEmail');
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (e) {
      console.error('[auth] Erro ao processar email link:', e);
      this.cloudLoginError   = _mapFirebaseAuthError(e.code) || 'Link inválido ou expirado. Solicite um novo.';
      this._pendingPanelOpen = false;
    } finally {
      this.cloudSyncing = false;
    }
  },


  // ── onAuthStateChanged ─────────────────────────────────────────────────────
  _initCloudAuth() {
    this._checkEmailLink();

    firebaseAuth.onAuthStateChanged(async firebaseUser => {
      // Teardown imediato: destrói listener de pedidos antes de qualquer await.
      this._ordersUnsubscribe?.();
      this._ordersUnsubscribe = null;

      if (!firebaseUser) {
        this.cloudUser          = null;
        this.userProfile        = { displayName: '', phone: '' };
        this.showAdminPanel     = false;
        this.showAdminLogin     = false;
        this.showClientLogin    = false;
        this.showUserProfile    = false;
        this._pendingPanelOpen  = false;
        this._forceTokenRefresh = false;
        this.cloudLoginStep     = 'email';
        this.cloudOtpSent       = false;
        return;
      }

      // Lê role do Custom Claim.
      //
      // forceRefresh=true quando:
      //   a) Email Link login (_pendingPanelOpen=true) — claims recém-atribuídos
      //   b) Dev quick login  (_forceTokenRefresh=true) — idem, sem abrir painel
      //
      // _forceTokenRefresh é consumido e zerado aqui para que re-renders
      // subsequentes do onAuthStateChanged não forcem refresh desnecessário.
      const forceRefresh      = this._pendingPanelOpen || this._forceTokenRefresh;
      this._forceTokenRefresh = false;  // consumido — não propaga

      let roles = [];
      try {
        const tokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
        const role        = tokenResult.claims.role;
        if (role) roles = [role];
        console.debug('[auth] uid:', firebaseUser.uid, '| role:', role ?? '(nenhuma)', '| forceRefresh:', forceRefresh);
      } catch (e) {
        console.warn('[auth] Não foi possível ler claims:', e.message);
      }

      this.cloudUser = {
        userId:     firebaseUser.uid,
        name:       firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
        email:      firebaseUser.email,
        roles,
        isLoggedIn: true,
      };

      this.showAdminLogin  = false;
      this.showClientLogin = false;
      this.cloudLoginStep  = 'done';
      this.showLoginNudge  = false;

      await this._loadUserProfile();
      await this.loadProtectedData?.();

      // Abre painel admin SOMENTE no fluxo de Email Link.
      // Dev quick login nunca abre o painel automaticamente.
      if (this._pendingPanelOpen) {
        this._pendingPanelOpen = false;
        if (this.isCloudAdmin || this.isCloudWorker) {
          this.showAdminPanel = true;
        }
      }
    });
  },


  // ── Carrega perfil do Firebase Auth + Firestore ────────────────────────────
  async _loadUserProfile() {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return;

    this.userProfile.displayName = fbUser.displayName || '';

    try {
      const doc = await firestoreDb.collection('users').doc(fbUser.uid).get();
      if (doc.exists) {
        this.userProfile.phone = doc.data().phone || '';
      }
    } catch (e) {
      console.warn('[auth] _loadUserProfile: Firestore read skipped:', e.message);
    }
  },


  // ── Salva perfil no Firebase Auth + Firestore ──────────────────────────────
  async saveUserProfile() {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser || this._profileSaving) return;

    this._profileSaving = true;
    try {
      const displayName = this.userProfile.displayName.trim();
      const phone       = this.userProfile.phone.replace(/\D/g, '');

      await fbUser.updateProfile({ displayName: displayName || null });
      await firestoreDb.collection('users').doc(fbUser.uid).set(
        { phone, updatedAt: new Date().toISOString() },
        { merge: true },
      );

      if (this.cloudUser) {
        this.cloudUser = {
          ...this.cloudUser,
          name: displayName || fbUser.email?.split('@')[0] || 'Usuário',
        };
      }

      this.userProfile.displayName = displayName;
      this.userProfile.phone       = phone;
      this.showToast?.('Perfil salvo!', 'success', '✅');

    } catch (e) {
      await this.logError?.(e.message || String(e), {
        source: 'saveUserProfile', type: 'authError', stack: e.stack || null,
        uid: firebaseAuth.currentUser?.uid || null,
      }, 'auth');
      this.showToast?.('Erro ao salvar perfil.', 'error', '❌');
    } finally {
      this._profileSaving = false;
    }
  },


  // ── Dev: Login rápido via Firebase Auth Emulator ──────────────────────────
  //
  // Diferença crítica em relação ao Email Link login:
  //
  //   _pendingPanelOpen  → NÃO setado → painel admin NÃO abre automaticamente
  //   _forceTokenRefresh → setado     → token é refreshado em onAuthStateChanged
  //
  // Por que _forceTokenRefresh é necessário:
  //   O emulador seta o custom claim de role no momento do seed. Sem forceRefresh,
  //   o SDK pode retornar um token em cache que ainda não carrega o claim →
  //   isCloudAdmin/Worker fica false → loadProtectedData não carrega os pedidos →
  //   _initRealtimeOrders não monta o listener → "false for 'list'" nas Rules.
  async _devQuickLogin(email) {
    if (!window.APP_ENV?.isDev) return;

    const cred = this.devUsers.find(u => u.email === email);
    if (!cred) {
      this.showToast?.(`Dev login: "${email}" não está em devUsers.`, 'error', '🔴');
      console.error('[dev] _devQuickLogin: e-mail não encontrado em devUsers:', email);
      return;
    }

    try {
      this.cloudSyncing       = true;
      this._forceTokenRefresh = true;   // garante claim atualizado, sem abrir painel
      // _pendingPanelOpen permanece false intencionalmente

      await firebaseAuth.signInWithEmailAndPassword(cred.email, cred.password);

    } catch (e) {
      this._forceTokenRefresh = false;

      const notFound = e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password';
      const msg = notFound
        ? `"${cred.email}" não encontrado no emulador. Rode: node scripts/seed-emulator.js`
        : (_mapFirebaseAuthError(e.code) || e.message);

      this.showToast?.('Dev login falhou: ' + msg, 'error', '🔴');
      console.error('[dev] _devQuickLogin falhou:', e.code, msg);
    } finally {
      this.cloudSyncing = false;
    }
  },
};


// ── Mapeamento de códigos Firebase → mensagens PT-BR ──────────────────────────
function _mapFirebaseAuthError(code) {
  const map = {
    'auth/invalid-email':          'E-mail inválido.',
    'auth/user-not-found':         'Usuário não encontrado.',
    'auth/wrong-password':         'Senha incorreta.',
    'auth/invalid-action-code':    'Link inválido ou já utilizado.',
    'auth/expired-action-code':    'Link expirado. Solicite um novo.',
    'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    'auth/email-already-in-use':   'E-mail já cadastrado.',
    'auth/operation-not-allowed':  'Método de autenticação não habilitado. Ative "Email Link" no Firebase Console → Authentication → Sign-in methods.',
    'auth/missing-email':          'E-mail não informado.',
  };
  return map[code] || null;
}