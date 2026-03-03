/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/firebase-config.js
   Inicialização do Firebase (App, Firestore, Auth)

   ✅ AÇÃO NECESSÁRIA:
   Substitua os valores REPLACE_* pelos dados do seu projeto
   em: Firebase Console → Configurações do Projeto → Seus apps → SDK
═══════════════════════════════════════════════════════ */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDrBs79sEEkeOhz3JP63CacZFcWPUPHpg8",
  authDomain: "cardapio-digital-pro-c1cd7.firebaseapp.com",
  projectId: "cardapio-digital-pro-c1cd7",
  storageBucket: "cardapio-digital-pro-c1cd7.firebasestorage.app",
  messagingSenderId: "439961529139",
  appId: "1:439961529139:web:d52d77a168d7968dea2c46",
  measurementId: "G-D1NR5RNED7"
};

firebase.initializeApp(firebaseConfig);

// Expõe instâncias globais — usadas por todos os módulos
const firestoreDb  = firebase.firestore();
const firebaseAuth = firebase.auth();

// ── Dev: conecta aos emuladores ANTES de qualquer operação ─────────────────
// Para usar: instale Firebase CLI e rode `firebase emulators:start`
// Remova ou comente em produção.
if (window.APP_ENV?.isDev) {
  try {
    firestoreDb.useEmulator('localhost', 8080);
    firebaseAuth.useEmulator('http://localhost:9099');
    console.info('[Firebase] 🛠 Emuladores ativados → Firestore:8080 | Auth:9099');
  } catch (e) {
    // Emuladores não disponíveis — conecta ao projeto real em dev (aceitável)
    console.warn('[Firebase] Emuladores não disponíveis, conectando ao projeto real.', e.message);
  }
}

// ── Persistência offline ──────────────────────────────────────────────────
// Firebase 10 compat removeu enableMultiTabIndexedDbPersistence().
// Substituto: enablePersistence({ synchronizeTabs: true }) — mesmo comportamento
// multi-aba, com fallback gracioso para navegadores sem suporte.
firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    // Mais de uma aba aberta com o app — o SDK usa a primeira que iniciou.
    // Não é um erro crítico; as outras abas funcionam sem cache local.
    console.warn('[Firestore] Multi-tab: persistência ativa em outra aba.');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firestore] Persistência offline não suportada neste navegador.');
  } else {
    console.warn('[Firestore] Persistência offline falhou:', err.code);
  }
});