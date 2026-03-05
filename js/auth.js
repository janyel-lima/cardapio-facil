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
═══════════════════════════════════════════════════════ */

const appAuth = {

  // ── Estado reativo ─────────────────────────────────────────────────────────
  cloudUser:         null,
  cloudSyncing:      false,
  cloudLoginEmail:   '',
  cloudLoginOtp:     '',
  cloudLoginStep:    'email',      // 'email' | 'otp' | 'done'
  cloudLoginError:   '',
  cloudOtpSent:      false,
  showAdminLogin:    false,
  showAdminPanel:    false,
  showUserProfile:   false,
  userProfileTab:    'profile',
  _pendingPanelOpen: false,
  _profileSaving:    false,

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

  // Inicial do avatar: displayName > email > '?'
  get userAvatarInitial() {
    const name  = this.userProfile.displayName || this.cloudUser?.name || '';
    const email = this.cloudUser?.email || '';
    const src   = name.trim() || email;
    return src ? src.trim().charAt(0).toUpperCase() : '?';
  },

  // Badge de role com cor e rótulo
  get userRoleLabel() {
    if (!this.isCloudAuthenticated) return null;
    if (this.isCloudAdmin)  return { text: '👑 Admin',      color: '#8b5cf6', bg: 'rgba(139,92,246,.12)' };
    if (this.isCloudWorker) return { text: '🧑‍🍳 Atendente', color: '#f59e0b', bg: 'rgba(245,158,11,.12)'  };
    return                         { text: '🛒 Cliente',    color: '#3b82f6', bg: 'rgba(59,130,246,.12)'  };
  },

  // Pedidos do usuário logado — filtra orderHistory pelo userId
  get myOrders() {
    if (!this.isCloudAuthenticated || !this.cloudUser?.userId) return [];
    return [...this.orderHistory]
      .filter(o => o.userId === this.cloudUser.userId)
      .reverse();
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
      this._pendingPanelOpen = true;

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
      // Sem isso, o listener do admin anterior fica ativo durante a troca de
      // usuário e o Firestore reavalia as rules com o token do novo usuário →
      // realtimeListenerError se o novo usuário não for worker/admin.
      this._ordersUnsubscribe?.();
      this._ordersUnsubscribe = null;

      if (!firebaseUser) {
        this.cloudUser         = null;
        this.userProfile       = { displayName: '', phone: '' };
        this.showAdminPanel    = false;
        this.showAdminLogin    = false;
        this.showClientLogin   = false;
        this.showUserProfile   = false;
        this._pendingPanelOpen = false;
        this.cloudLoginStep    = 'email';
        this.cloudOtpSent      = false;
        return;
      }

      // Lê role do Custom Claim — forceRefresh só no login recém-feito.
      let roles = [];
      try {
        const forceRefresh = this._pendingPanelOpen;
        const tokenResult  = await firebaseUser.getIdTokenResult(forceRefresh);
        const role         = tokenResult.claims.role;
        if (role) roles = [role];
        console.debug('[auth] uid:', firebaseUser.uid, '| role:', role ?? '(nenhuma)');
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

      // Carrega perfil do Firebase Auth + Firestore /users/{uid}
      await this._loadUserProfile();

      // Dados protegidos (orders para worker/admin, auditLog para admin)
      await this.loadProtectedData?.();

      if (this._pendingPanelOpen) {
        this._pendingPanelOpen = false;
        if (this.isCloudAdmin || this.isCloudWorker) {
          this.showAdminPanel = true;
        }
      }
    });
  },


  // ── Carrega perfil do Firebase Auth + Firestore ────────────────────────────
  //
  // Fonte de verdade:
  //   displayName → firebaseAuth.currentUser.displayName  (Firebase Auth)
  //   phone       → Firestore /users/{uid}.phone
  //
  // Chamado automaticamente no onAuthStateChanged.
  // Pode ser chamado manualmente para recarregar após edição externa.
  async _loadUserProfile() {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return;

    // 1. Firebase Auth: displayName já está no objeto local, sem roundtrip.
    this.userProfile.displayName = fbUser.displayName || '';

    // 2. Firestore: campos extras não suportados pelo Firebase Auth (phone etc.)
    try {
      const doc = await firestoreDb.collection('users').doc(fbUser.uid).get();
      if (doc.exists) {
        const data = doc.data();
        this.userProfile.phone = data.phone || '';
      }
    } catch (e) {
      // Permissão negada (ex: novo usuário sem doc ainda) → ignora silenciosamente.
      // O perfil funciona mesmo assim com os dados do Firebase Auth.
      console.warn('[auth] _loadUserProfile: Firestore read skipped:', e.message);
    }
  },


  // ── Salva perfil no Firebase Auth + Firestore ──────────────────────────────
  //
  // displayName → updateProfile() — propaga para tokens futuros e para
  //               cloudUser.name imediatamente, sem precisar de logout/login.
  // phone       → Firestore /users/{uid} com merge:true — preserva outros campos.
  async saveUserProfile() {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser || this._profileSaving) return;

    this._profileSaving = true;
    try {
      const displayName = this.userProfile.displayName.trim();
      const phone       = this.userProfile.phone.replace(/\D/g, '');

      // Firebase Auth: atualiza displayName
      await fbUser.updateProfile({ displayName: displayName || null });

      // Firestore: atualiza /users/{uid} — merge para não apagar outros campos
      await firestoreDb.collection('users').doc(fbUser.uid).set(
        { phone, updatedAt: new Date().toISOString() },
        { merge: true },
      );

      // Sincroniza cloudUser.name localmente (sem aguardar novo onAuthStateChanged)
      if (this.cloudUser) {
        this.cloudUser = {
          ...this.cloudUser,
          name: displayName || fbUser.email?.split('@')[0] || 'Usuário',
        };
      }

      // Normaliza valores locais (remove espaços extras, máscara do phone)
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
  async _devQuickLogin(email) {
    if (!window.APP_ENV?.isDev) return;

    const prefix   = email.split('@')[0];
    const password = `${prefix}123`;

    try {
      this.cloudSyncing      = true;
      this._pendingPanelOpen = true;

      await firebaseAuth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged → teardown listener → getIdTokenResult(true) → role ✅

    } catch (e) {
      this._pendingPanelOpen = false;
      const msg = e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password'
        ? 'Usuário não encontrado. Rode: node scripts/seed-emulator.js'
        : e.message;
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