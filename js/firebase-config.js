/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/firebase-config.js
   Inicialização do Firebase (App, Firestore, Auth, Storage)
═══════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            'AIzaSyDrBs79sEEkeOhz3JP63CacZFcWPUPHpg8',
  authDomain:        'cardapio-digital-pro-c1cd7.firebaseapp.com',
  projectId:         'cardapio-digital-pro-c1cd7',
  storageBucket:     'cardapio-digital-pro-c1cd7.firebasestorage.app',
  messagingSenderId: '439961529139',
  appId:             '1:439961529139:web:d52d77a168d7968dea2c46',
  measurementId:     'G-D1NR5RNED7',
};

firebase.initializeApp(firebaseConfig);

// Expõe instâncias globais — usadas por todos os módulos
const firestoreDb     = firebase.firestore();
const firebaseAuth    = firebase.auth();
const firebaseStorage = firebase.storage();

// ── Dev: conecta aos emuladores ANTES de qualquer operação ─────────────────
const USE_EMULATOR = true;

if (window.APP_ENV?.isDev && USE_EMULATOR) {
  try {
    firestoreDb.useEmulator('localhost', 8080);
    firebaseAuth.useEmulator('http://localhost:9099');
    firebaseStorage.useEmulator('localhost', 9199);
    console.info('[Firebase] 🛠 Emuladores ativados → Firestore:8080 | Auth:9099 | Storage:9199');
  } catch (e) {
    console.warn('[Firebase] Falha ao conectar emuladores:', e.message);
  }
}

// ── Persistência offline ──────────────────────────────────────────────────
firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firestore] Multi-tab: persistência ativa em outra aba.');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firestore] Persistência offline não suportada neste navegador.');
  } else {
    console.warn('[Firestore] Persistência offline falhou:', err.code);
  }
});