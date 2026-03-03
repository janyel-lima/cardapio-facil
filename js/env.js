/* ═══════════════════════════════════════════════════
   js/env.js — Configuração de ambiente
   Carregado ANTES de qualquer outro script
═══════════════════════════════════════════════════ */

const APP_ENV = {
  // Troque para 'production' antes de fazer deploy
  mode: 'development',

  get isDev()  { return this.mode === 'development'; },
  get isProd() { return this.mode === 'production';  },
};

// Expõe no window para acesso global
window.APP_ENV = APP_ENV;