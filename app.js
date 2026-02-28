/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — app.js  v3.0
   Dexie.js persistence · Business audit only · No access log
═══════════════════════════════════════════════════════ */

/* ── DEXIE DATABASE SETUP ── */
const db = new Dexie('cardapioDigitalPro');
db.version(1).stores({
  config:       '++id',                       // single row
  categories:   'id, active',
  items:        'id, category, available',
  promotions:   'id, active, type',
  orders:       'uuid, date, timestamp',
  orderCounter: '++id',                       // single row
  auditLog:     'id, timestamp, action',
});

function menuApp() {
  return {

    /* ══════════════════════════════════════════
       CORE STATE
    ══════════════════════════════════════════ */
    darkMode: false,
    showSearch: false,
    searchQuery: '',
    activeTab: null,

    showCart: false,
    showProductModal: false,
    showThemePicker: false,
    showAdminLogin: false,
    showAdminPanel: false,
    showProductForm: false,
    showPixModal: false,
    showTutorial: false,
    tutorialStep: 0,

    dbReady: false,

    /* ── SECURITY ── */
    failedAttempts: 0,
    lockedUntil: null,
    sessionId: null,
    sessionExpiry: null,
    sessionCountdownLabel: '',
    _sessionTimer: null,
    SECURITY_MAX_ATTEMPTS: 5,
    SECURITY_LOCKOUT_MS:   15 * 60 * 1000,
    SECURITY_SESSION_MS:    4 * 60 * 60 * 1000,

    /* ── PIX ── */
    pixStatus: 'pending',
    pixCopied: false,
    pixCountdown: 300,
    _pixTimer: null,

    /* ── PRODUCT MODAL ── */
    selectedProduct: null,
    modalQty: 1,
    modalNote: '',
    modalSelectedComplements: {},

    /* ── CART & CHECKOUT ── */
    cart: [],
    checkout: {
      name: '', phone: '', address: '', complement: '',
      deliveryType: 'delivery', payment: 'pix',
    },
    couponInput: '',
    appliedCoupon: null,

    /* ── ADMIN ── */
    isAdmin: false,
    adminPassword: '',
    adminError: '',
    adminTab: 'store',
    adminTabs: [
      { id: 'store',      name: 'Loja',       icon: '🏪' },
      { id: 'categories', name: 'Categorias', icon: '🏷️' },
      { id: 'products',   name: 'Produtos',   icon: '🛍️' },
      { id: 'promos',     name: 'Promoções',  icon: '🔥' },
      { id: 'orders',     name: 'Pedidos',    icon: '📋' },
      { id: 'reports',    name: 'Relatórios', icon: '📊' },
    ],

    /* ── PRODUCT EDITING ── */
    editingProduct: {},
    newGroup: { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] },
    newGroupOption: { name: '', price: 0 },
    newCategory: { name: '', icon: '' },
    newPromo: { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' },

    /* ── ORDERS / AUDIT ── */
    orderHistory: [],
    orderCounter: 0,
    auditLog: [],        // business events only

    /* ── TOAST ── */
    toast: { visible: false, message: '', type: 'success', icon: '✓' },
    _toastTimer: null,

    /* ── THEME ── */
    currentTheme: { id: 'red', name: 'Vermelho', accent: '#ef4444' },
    customAccent: '#ef4444',

    themes: [
      { id: 'red',    name: 'Vermelho', accent: '#ef4444', hover: '#dc2626', rgb: '239,68,68'  },
      { id: 'orange', name: 'Laranja',  accent: '#f97316', hover: '#ea580c', rgb: '249,115,22' },
      { id: 'amber',  name: 'Âmbar',   accent: '#f59e0b', hover: '#d97706', rgb: '245,158,11' },
      { id: 'green',  name: 'Verde',   accent: '#22c55e', hover: '#16a34a', rgb: '34,197,94'  },
      { id: 'teal',   name: 'Teal',    accent: '#14b8a6', hover: '#0d9488', rgb: '20,184,166' },
      { id: 'blue',   name: 'Azul',    accent: '#3b82f6', hover: '#2563eb', rgb: '59,130,246' },
      { id: 'violet', name: 'Violeta', accent: '#8b5cf6', hover: '#7c3aed', rgb: '139,92,246' },
      { id: 'pink',   name: 'Rosa',    accent: '#ec4899', hover: '#db2777', rgb: '236,72,153' },
    ],

    paymentMethods: [
      { id: 'pix',  name: 'PIX',      icon: '🔑' },
      { id: 'card', name: 'Cartão',   icon: '💳' },
      { id: 'cash', name: 'Dinheiro', icon: '💵' },
    ],

    tutorialSteps: [
      { icon:'🏪', title:'Bem-vindo ao Painel Admin!', content:'Este tutorial vai te guiar pelas principais funcionalidades do seu cardápio digital. São apenas 6 passos rápidos.', tip:'Dica: Você pode voltar aqui a qualquer momento clicando no ícone ❓ no menu admin.' },
      { icon:'⚙️', title:'Configurações da Loja', content:'Na aba "Loja" você configura: nome do restaurante, número do WhatsApp, chave PIX, taxa de entrega, pedido mínimo, horário e senha de admin.', tip:'Importante: O botão "Loja Aberta/Fechada" controla se novos pedidos podem ser feitos.' },
      { icon:'🏷️', title:'Categorias do Cardápio', content:'Crie categorias como Burgers, Bebidas, Combos. Cada categoria tem um emoji. Você pode ativar/desativar sem excluir.', tip:'Use emojis relacionados para deixar o cardápio mais visual e atrativo.' },
      { icon:'🛍️', title:'Cadastro de Produtos + Complementos', content:'Adicione produtos com nome, preço, imagem e categoria. Cada produto pode ter grupos de complementos (Adicionais, Ponto da carne etc.) com preços por opção.', tip:'Complementos pagos aumentam o ticket médio automaticamente!' },
      { icon:'🔥', title:'Promoções e Cupons', content:'Crie promoções automáticas (% ou R$ de desconto, frete grátis) ou cupons de desconto com código. Defina valor mínimo do pedido.', tip:'Crie o cupom "BEMVINDO10" com 10% de desconto para novos clientes!' },
      { icon:'📊', title:'Relatórios & Exportação', content:'Exporte fechamentos contábeis em Excel, CSV, JSON ou PDF. Cada pedido possui UUID único e hash de integridade para rastreabilidade total.', tip:'Use o Excel para enviar ao contador — ele inclui 5 planilhas com todos os dados do dia.' },
    ],

    /* ── STORE CONFIG ── */
    config: {
      restaurantName: 'Hamburgueria do Vale',
      city: 'Arapiraca, AL',
      whatsapp: '5582999999999',
      pixKey: 'contato@hamburgeriavale.com.br',
      deliveryFee: 6.00,
      minOrder: 25.00,
      deliveryTime: '30-45 min',
      isOpen: true,
      adminPass: 'admin123',
    },

    /* ── CATEGORIES (seed) ── */
    categories: [
      { id: 'burgers',         name: 'Burgers',         icon: '🍔', active: true },
      { id: 'bebidas',         name: 'Bebidas',          icon: '🥤', active: true },
      { id: 'combos',          name: 'Combos',           icon: '🎁', active: true },
      { id: 'sobremesas',      name: 'Sobremesas',       icon: '🍩', active: true },
      { id: 'acompanhamentos', name: 'Acompanhamentos',  icon: '🍟', active: true },
    ],

    /* ── ITEMS (seed) ── */
    items: [
      {
        id: 1, name: 'X-Arapiraca Master', category: 'burgers',
        price: 28.50, promoPrice: null,
        desc: 'Pão brioche artesanal, carne de sol desfiada 180g, queijo coalho grelhado, mel de engenho e cebola crispy.',
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
        available: true, featured: true,
        complements: [
          { id: 'grp-point', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'pt-mal', name: 'Mal passado', price: 0 },
              { id: 'pt-med', name: 'Ao ponto',    price: 0 },
              { id: 'pt-bem', name: 'Bem passado', price: 0 },
            ]},
          { id: 'grp-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 4,
            options: [
              { id: 'ad-bacon',  name: 'Bacon artesanal', price: 4.00 },
              { id: 'ad-ovo',    name: 'Ovo frito',       price: 2.50 },
              { id: 'ad-queijo', name: 'Queijo extra',    price: 2.50 },
              { id: 'ad-catup',  name: 'Cheddar cremoso', price: 3.00 },
            ]},
        ]
      },
      {
        id: 2, name: 'Classic Smash Burger', category: 'burgers',
        price: 24.00, promoPrice: 19.90,
        desc: 'Dois smash patties 80g, queijo americano, picles, molho especial da casa e alface americana.',
        image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-smash-pt', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'sp-mal', name: 'Mal passado', price: 0 },
              { id: 'sp-med', name: 'Ao ponto',    price: 0 },
              { id: 'sp-bem', name: 'Bem passado', price: 0 },
            ]},
          { id: 'grp-smash-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
            options: [
              { id: 'sa-bacon', name: 'Bacon extra', price: 4.00 },
              { id: 'sa-ovo',   name: 'Ovo frito',   price: 2.50 },
              { id: 'sa-jal',   name: 'Jalapeño',    price: 1.50 },
            ]},
        ]
      },
      {
        id: 3, name: 'BBQ Bacon Supremo', category: 'burgers',
        price: 32.00, promoPrice: null,
        desc: 'Pão brioche preto, blend 200g, bacon crocante artesanal, queijo cheddar, molho bbq defumado e jalapeños.',
        image: 'https://images.unsplash.com/photo-1596956470007-2bf6095e7e16?w=500',
        available: true, featured: true,
        complements: [
          { id: 'grp-bbq-pt', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'bp-mal', name: 'Mal passado', price: 0 },
              { id: 'bp-med', name: 'Ao ponto',    price: 0 },
              { id: 'bp-bem', name: 'Bem passado', price: 0 },
            ]},
          { id: 'grp-bbq-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
            options: [
              { id: 'ba-ovo',   name: 'Ovo caipira',    price: 3.00 },
              { id: 'ba-bacon', name: 'Bacon extra',     price: 4.00 },
              { id: 'ba-pica',  name: 'Molho extra BBQ', price: 1.50 },
            ]},
        ]
      },
      {
        id: 4, name: 'Veggie Especial', category: 'burgers',
        price: 22.00, promoPrice: null,
        desc: 'Hambúrguer de grão-de-bico e beterraba, queijo prato derretido, rúcula, tomate confit e maionese de ervas.',
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-veg-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
            options: [
              { id: 'va-abac', name: 'Abacate',          price: 3.00 },
              { id: 'va-houm', name: 'Homus extra',       price: 2.00 },
              { id: 'va-tom',  name: 'Tomate seco extra', price: 1.50 },
            ]},
        ]
      },
      {
        id: 5, name: 'Refrigerante Lata', category: 'bebidas',
        price: 5.50, promoPrice: null,
        desc: 'Coca-Cola, Guaraná Antártica, Sprite ou Fanta. 350ml gelado.',
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-ref-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'rs-coca', name: 'Coca-Cola',         price: 0 },
              { id: 'rs-gua',  name: 'Guaraná Antártica', price: 0 },
              { id: 'rs-spr',  name: 'Sprite',            price: 0 },
              { id: 'rs-fan',  name: 'Fanta Laranja',     price: 0 },
            ]},
        ]
      },
      {
        id: 6, name: 'Suco Natural 500ml', category: 'bebidas',
        price: 9.00, promoPrice: null,
        desc: 'Caju, acerola, maracujá ou laranja. Fresquinho e sem conservantes.',
        image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-suco-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'ss-caju',  name: 'Caju',     price: 0 },
              { id: 'ss-acer',  name: 'Acerola',  price: 0 },
              { id: 'ss-mara',  name: 'Maracujá', price: 0 },
              { id: 'ss-laran', name: 'Laranja',  price: 0 },
            ]},
          { id: 'grp-suco-add', name: 'Opções', type: 'multiple', required: false, min: 0, max: 2,
            options: [
              { id: 'soac-mel',  name: 'Com mel',      price: 1.00 },
              { id: 'soac-gen',  name: 'Com gengibre', price: 1.00 },
              { id: 'soac-chia', name: 'Com chia',     price: 2.00 },
            ]},
        ]
      },
      {
        id: 7, name: 'Milkshake Premium', category: 'bebidas',
        price: 16.00, promoPrice: null,
        desc: 'Morango, Oreo, Nutella ou Doce de leite. Feito na hora com sorvete artesanal.',
        image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500',
        available: true, featured: true,
        complements: [
          { id: 'grp-milk-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'ms-mor',  name: 'Morango',       price: 0 },
              { id: 'ms-oreo', name: 'Oreo',          price: 0 },
              { id: 'ms-nut',  name: 'Nutella',       price: 2.00 },
              { id: 'ms-ddl',  name: 'Doce de leite', price: 0 },
            ]},
          { id: 'grp-milk-add', name: 'Cobertura extra', type: 'multiple', required: false, min: 0, max: 2,
            options: [
              { id: 'ma-choc', name: 'Calda de chocolate', price: 2.00 },
              { id: 'ma-gran', name: 'Granulado colorido',  price: 1.00 },
              { id: 'ma-cho2', name: 'Chantilly',           price: 2.00 },
            ]},
        ]
      },
      {
        id: 8, name: 'Combo Casal', category: 'combos',
        price: 55.00, promoPrice: 49.90,
        desc: '2 Burgers à escolha + Batata GG crocante + Refri 1L. Serve 2 pessoas.',
        image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500',
        available: true, featured: true,
        complements: [
          { id: 'grp-cc-burger1', name: '1º Burger', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'cb1-x',    name: 'X-Arapiraca Master', price: 0 },
              { id: 'cb1-smash',name: 'Classic Smash',       price: 0 },
              { id: 'cb1-bbq',  name: 'BBQ Bacon Supremo',   price: 0 },
            ]},
          { id: 'grp-cc-burger2', name: '2º Burger', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'cb2-x',    name: 'X-Arapiraca Master', price: 0 },
              { id: 'cb2-smash',name: 'Classic Smash',       price: 0 },
              { id: 'cb2-bbq',  name: 'BBQ Bacon Supremo',   price: 0 },
            ]},
          { id: 'grp-cc-refri', name: 'Refrigerante 1L', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'cr-coca', name: 'Coca-Cola 1L',         price: 0 },
              { id: 'cr-gua',  name: 'Guaraná Antártica 1L', price: 0 },
            ]},
        ]
      },
      {
        id: 9, name: 'Combo Individual', category: 'combos',
        price: 35.00, promoPrice: null,
        desc: '1 Burger à escolha + Batata M crocante + Refri 350ml.',
        image: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-ci-burger', name: 'Escolha o Burger', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'cib-x',    name: 'X-Arapiraca Master', price: 0 },
              { id: 'cib-smash',name: 'Classic Smash',       price: 0 },
              { id: 'cib-bbq',  name: 'BBQ Bacon Supremo',   price: 4.00 },
              { id: 'cib-veg',  name: 'Veggie Especial',     price: 0 },
            ]},
          { id: 'grp-ci-refri', name: 'Refrigerante', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'cir-coca', name: 'Coca-Cola',         price: 0 },
              { id: 'cir-gua',  name: 'Guaraná Antártica', price: 0 },
              { id: 'cir-spr',  name: 'Sprite',            price: 0 },
            ]},
        ]
      },
      {
        id: 10, name: 'Batata Frita G', category: 'acompanhamentos',
        price: 14.00, promoPrice: null,
        desc: 'Batata corte palito frita na hora. Temperada com sal defumado e alecrim. Serve 1-2 pessoas.',
        image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-bat-molho', name: 'Molho para mergulhar', type: 'multiple', required: false, min: 0, max: 2,
            options: [
              { id: 'bm-mayo',  name: 'Maionese da casa',  price: 1.50 },
              { id: 'bm-ranch', name: 'Ranch especial',    price: 2.00 },
              { id: 'bm-bbq',   name: 'Molho BBQ',         price: 2.00 },
              { id: 'bm-ketch', name: 'Ketchup artesanal', price: 1.50 },
            ]},
        ]
      },
      {
        id: 11, name: 'Onion Rings', category: 'acompanhamentos',
        price: 16.00, promoPrice: null,
        desc: 'Anéis de cebola empanados no panko com molho ranch especial da casa.',
        image: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500',
        available: true, featured: false,
        complements: []
      },
      {
        id: 12, name: 'Brownie com Sorvete', category: 'sobremesas',
        price: 18.00, promoPrice: null,
        desc: 'Brownie de chocolate belga quentinho, sorvete de creme, calda de chocolate e granulado.',
        image: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=500',
        available: true, featured: false,
        complements: [
          { id: 'grp-brow-sorvete', name: 'Sabor do Sorvete', type: 'single', required: true, min: 1, max: 1,
            options: [
              { id: 'bs-creme',  name: 'Creme',     price: 0 },
              { id: 'bs-choc',   name: 'Chocolate', price: 0 },
              { id: 'bs-morango',name: 'Morango',   price: 0 },
            ]},
          { id: 'grp-brow-add', name: 'Coberturas extras', type: 'multiple', required: false, min: 0, max: 2,
            options: [
              { id: 'ba-choc2', name: 'Calda extra',   price: 2.00 },
              { id: 'ba-cho3',  name: 'Chantilly',     price: 2.00 },
              { id: 'ba-nozes', name: 'Nozes picadas', price: 3.00 },
            ]},
        ]
      },
    ],

    /* ── PROMOTIONS (seed) ── */
    promotions: [
      { id: 1, name: 'Happy Hour',               type: 'percentage', value: 15,  minOrder: 0,  expiresAt: '', active: true  },
      { id: 2, name: 'Primeira Compra',           type: 'coupon',     value: 10,  code: 'PRIMEIRACOMPRA', minOrder: 30, expiresAt: '', active: true },
      { id: 3, name: 'Frete Grátis Fim de Semana',type: 'freeDelivery',value: 0,  minOrder: 40, expiresAt: '', active: false },
    ],


    /* ══════════════════════════════════════════
       UTILITIES
    ══════════════════════════════════════════ */

    uuid() {
      if (crypto?.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    },

    // djb2 hash — fast, deterministic, tamper-evident for order records
    djb2Hash(str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h |= 0;
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    },

    nextOrderNumber() {
      this.orderCounter++;
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
      return `${date}-${String(this.orderCounter).padStart(4,'0')}`;
    },

    formatMoney(val) {
      if (val == null || isNaN(val)) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(val);
    },

    formatDatetime(iso) {
      if (!iso) return '-';
      return new Intl.DateTimeFormat('pt-BR', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
      }).format(new Date(iso));
    },

    showToast(message, type = 'success', icon = '✓') {
      clearTimeout(this._toastTimer);
      this.toast = { visible: true, message, type, icon };
      this._toastTimer = setTimeout(() => { this.toast.visible = false; }, 2800);
    },


    /* ══════════════════════════════════════════
       DEXIE PERSISTENCE
    ══════════════════════════════════════════ */

    async saveConfig() {
      await db.config.clear();
      await db.config.add({ ...this.config, _row: 1 });
      await this.addAudit('CONFIG_SAVED', { restaurantName: this.config.restaurantName, isOpen: this.config.isOpen });
      this.showToast('Configurações salvas!', 'success', '💾');
    },

    async saveCategories() {
      await db.categories.clear();
      await db.categories.bulkPut(this.categories);
    },

    async saveItems() {
      await db.items.clear();
      await db.items.bulkPut(this.items);
    },

    async savePromotions() {
      await db.promotions.clear();
      await db.promotions.bulkPut(this.promotions);
    },

    async saveOrderCounter() {
      await db.orderCounter.clear();
      await db.orderCounter.add({ counter: this.orderCounter });
    },

    // Save a single finished order
    async persistOrder(order) {
      await db.orders.put(order);
    },

    async loadAllData() {
      try {
        const [cfgRows, cats, its, promos, orders, counterRow] = await Promise.all([
          db.config.toArray(),
          db.categories.toArray(),
          db.items.toArray(),
          db.promotions.toArray(),
          db.orders.orderBy('timestamp').toArray(),
          db.orderCounter.toArray(),
        ]);

        if (cfgRows.length)   this.config       = { ...this.config, ...cfgRows[0] };
        if (cats.length)      this.categories   = cats;
        if (its.length)       this.items        = its;
        if (promos.length)    this.promotions   = promos;
        if (orders.length)    this.orderHistory = orders;
        if (counterRow.length)this.orderCounter = counterRow[0].counter || 0;

        // Load business audit log
        const auditRows = await db.auditLog.orderBy('timestamp').toArray();
        if (auditRows.length) this.auditLog = auditRows;

        this.dbReady = true;
      } catch(e) {
        console.error('Dexie load error:', e);
        this.dbReady = true; // still proceed with seed data
      }
    },

    // UI preferences stay in localStorage (browser-level, not business data)
    saveSetting(key, value) {
      try { localStorage.setItem('menuSetting_' + key, JSON.stringify(value)); } catch(e) {}
    },
    loadSetting(key, fallback) {
      try {
        const val = localStorage.getItem('menuSetting_' + key);
        return val !== null ? JSON.parse(val) : fallback;
      } catch(e) { return fallback; }
    },


    /* ══════════════════════════════════════════
       BUSINESS AUDIT LOG
       Only: orders, product/category/promo CRUD,
       config saves, exports, day closes.
       NO login/logout/session/page_load events.
    ══════════════════════════════════════════ */

    async addAudit(action, data = {}) {
      // Only persist business-relevant events
      const BUSINESS_EVENTS = new Set([
        'ORDER_PLACED',
        'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED',
        'CATEGORY_CREATED', 'CATEGORY_DELETED',
        'PROMO_CREATED', 'PROMO_DELETED',
        'CONFIG_SAVED',
        'COUPON_APPLIED',
        'EXPORT_EXCEL', 'EXPORT_CSV', 'EXPORT_JSON', 'EXPORT_PRINT',
        'DAY_CLOSED',
        'HISTORY_CLEARED',
      ]);

      if (!BUSINESS_EVENTS.has(action)) return;

      const lastEntry = this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1] : null;
      const prevHash  = lastEntry ? lastEntry.hash : '00000000';

      const entry = {
        id:        this.uuid(),
        timestamp: new Date().toISOString(),
        action,
        data,
      };

      // Chain hash — tamper evident: changing any past entry breaks all subsequent hashes
      entry.hash = this.djb2Hash(prevHash + JSON.stringify({ id: entry.id, timestamp: entry.timestamp, action, data }));

      this.auditLog.push(entry);
      try { await db.auditLog.put(entry); } catch(e) {}
    },

    // Verify the entire audit chain hasn't been tampered with
    verifyAuditIntegrity() {
      for (let i = 0; i < this.auditLog.length; i++) {
        const entry   = this.auditLog[i];
        const prevHash = i === 0 ? '00000000' : this.auditLog[i-1].hash;
        const expected = this.djb2Hash(prevHash + JSON.stringify({
          id: entry.id, timestamp: entry.timestamp, action: entry.action, data: entry.data,
        }));
        if (expected !== entry.hash) return false;
      }
      return true;
    },

    verifyOrderHash(order) {
      if (!order.hash) return null;
      const expected = this.djb2Hash(order.uuid + String(order.total) + order.name);
      return expected === order.hash;
    },

    get auditActionMeta() {
      return {
        ORDER_PLACED:      { label: 'Pedido registrado',    icon: '🛒', color: 'green'  },
        PRODUCT_CREATED:   { label: 'Produto criado',       icon: '➕', color: 'green'  },
        PRODUCT_UPDATED:   { label: 'Produto editado',      icon: '✏️', color: 'blue'   },
        PRODUCT_DELETED:   { label: 'Produto excluído',     icon: '🗑️', color: 'red'    },
        CATEGORY_CREATED:  { label: 'Categoria criada',     icon: '🏷️', color: 'green'  },
        CATEGORY_DELETED:  { label: 'Categoria excluída',   icon: '🗑️', color: 'red'    },
        PROMO_CREATED:     { label: 'Promoção criada',      icon: '🔥', color: 'orange' },
        PROMO_DELETED:     { label: 'Promoção excluída',    icon: '🗑️', color: 'red'    },
        CONFIG_SAVED:      { label: 'Configuração salva',   icon: '💾', color: 'blue'   },
        COUPON_APPLIED:    { label: 'Cupom aplicado',       icon: '🎟️', color: 'purple' },
        EXPORT_EXCEL:      { label: 'Exportação Excel',     icon: '📊', color: 'green'  },
        EXPORT_CSV:        { label: 'Exportação CSV',       icon: '📄', color: 'blue'   },
        EXPORT_JSON:       { label: 'Exportação JSON',      icon: '💾', color: 'yellow' },
        EXPORT_PRINT:      { label: 'Impressão/PDF',        icon: '🖨️', color: 'gray'   },
        DAY_CLOSED:        { label: 'Fechamento do dia',    icon: '🔒', color: 'purple' },
        HISTORY_CLEARED:   { label: 'Histórico apagado',   icon: '🗑️', color: 'red'    },
      };
    },

    auditActionLabel(action) { return (this.auditActionMeta[action] || {}).label || action; },
    auditActionIcon(action)  { return (this.auditActionMeta[action] || {}).icon  || '•';    },
    auditActionColor(action) { return (this.auditActionMeta[action] || {}).color || 'gray'; },


    /* ══════════════════════════════════════════
       SECURITY — ADMIN LOGIN
    ══════════════════════════════════════════ */

    get isLockedOut() {
      if (!this.lockedUntil) return false;
      if (Date.now() >= this.lockedUntil) {
        this.lockedUntil = null;
        this.failedAttempts = 0;
        this._saveSecurityState();
        return false;
      }
      return true;
    },
    get lockoutRemaining() {
      return !this.lockedUntil ? 0 : Math.max(0, Math.ceil((this.lockedUntil - Date.now()) / 1000));
    },
    get lockoutRemainingFormatted() {
      const s = this.lockoutRemaining;
      return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    },

    loginAdmin() {
      if (this.isLockedOut) { this.adminError = `Conta bloqueada. Aguarde ${this.lockoutRemainingFormatted}.`; return; }
      if (this.adminPassword === this.config.adminPass) {
        this.isAdmin = true;
        this.adminError = '';
        this.failedAttempts = 0;
        this.sessionId     = this.uuid();
        this.sessionExpiry = Date.now() + this.SECURITY_SESSION_MS;
        this._saveSecurityState();
        this._saveSession();
        this._startSessionTimer();
        this.adminPassword   = '';
        this.showAdminLogin  = false;
        this.showAdminPanel  = true;
      } else {
        this.failedAttempts++;
        if (this.failedAttempts >= this.SECURITY_MAX_ATTEMPTS) {
          this.lockedUntil = Date.now() + this.SECURITY_LOCKOUT_MS;
          this._saveSecurityState();
          this.adminError = `Muitas tentativas. Conta bloqueada por 15 minutos.`;
        } else {
          this.adminError = `Senha incorreta. ${this.SECURITY_MAX_ATTEMPTS - this.failedAttempts} tentativa(s) restante(s).`;
        }
      }
    },

    logoutAdmin() {
      this._clearSession();
      this.isAdmin = false;
      this.showAdminPanel = false;
      this.showToast('Sessão encerrada com segurança', 'success', '🔒');
    },

    _saveSession() {
      try { sessionStorage.setItem('adminSession', JSON.stringify({ sessionId: this.sessionId, expiry: this.sessionExpiry })); } catch(e) {}
    },
    _clearSession() {
      this.sessionId = null; this.sessionExpiry = null;
      clearInterval(this._sessionTimer); this.sessionCountdownLabel = '';
      try { sessionStorage.removeItem('adminSession'); } catch(e) {}
    },
    _loadSession() {
      try {
        const raw = sessionStorage.getItem('adminSession');
        if (!raw) return false;
        const { sessionId, expiry } = JSON.parse(raw);
        if (Date.now() < expiry) {
          this.sessionId = sessionId; this.sessionExpiry = expiry;
          this.isAdmin = true; this._startSessionTimer(); return true;
        }
        sessionStorage.removeItem('adminSession');
      } catch(e) {}
      return false;
    },
    _startSessionTimer() {
      clearInterval(this._sessionTimer);
      this._sessionTimer = setInterval(() => {
        if (!this.sessionExpiry) return;
        const remaining = Math.max(0, this.sessionExpiry - Date.now());
        if (remaining === 0) {
          this._clearSession(); this.isAdmin = false; this.showAdminPanel = false;
          this.showToast('Sessão expirada. Faça login novamente.', 'error', '⏰'); return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        this.sessionCountdownLabel = `${h > 0 ? h+'h ' : ''}${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      }, 1000);
    },
    _saveSecurityState() {
      try { localStorage.setItem('security_state', JSON.stringify({ failedAttempts: this.failedAttempts, lockedUntil: this.lockedUntil })); } catch(e) {}
    },
    _loadSecurityState() {
      try {
        const raw = localStorage.getItem('security_state');
        if (!raw) return;
        const { failedAttempts, lockedUntil } = JSON.parse(raw);
        this.failedAttempts = failedAttempts || 0;
        this.lockedUntil    = lockedUntil    || null;
      } catch(e) {}
    },


    /* ══════════════════════════════════════════
       COMPUTED — CATALOG
    ══════════════════════════════════════════ */

    get activeCategories() {
      return this.categories.filter(c => c.active);
    },

    get filteredItems() {
      let list = this.items;
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        list = list.filter(i =>
          i.name.toLowerCase().includes(q) ||
          i.desc.toLowerCase().includes(q) ||
          this.getCategoryName(i.category).toLowerCase().includes(q)
        );
      } else if (this.activeTab) {
        list = list.filter(i => i.category === this.activeTab);
      }
      return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    },


    /* ══════════════════════════════════════════
       COMPLEMENTS
    ══════════════════════════════════════════ */

    get modalComplementsTotal() {
      if (!this.selectedProduct?.complements?.length) return 0;
      let total = 0;
      for (const group of this.selectedProduct.complements) {
        for (const optId of (this.modalSelectedComplements[group.id] || [])) {
          const opt = group.options.find(o => o.id === optId);
          if (opt) total += opt.price;
        }
      }
      return total;
    },

    isComplementSelected(groupId, optionId) {
      return (this.modalSelectedComplements[groupId] || []).includes(optionId);
    },

    toggleComplement(group, option) {
      if (!this.modalSelectedComplements[group.id]) this.modalSelectedComplements[group.id] = [];
      const arr = this.modalSelectedComplements[group.id];
      const idx = arr.indexOf(option.id);
      if (idx > -1) {
        arr.splice(idx, 1);
      } else {
        if (group.type === 'single') {
          this.modalSelectedComplements[group.id] = [option.id];
        } else {
          if (arr.length >= (group.max || 99)) {
            this.showToast(`Máximo de ${group.max} opção(ões) para "${group.name}"`, 'error', '⚠️'); return;
          }
          arr.push(option.id);
        }
      }
      this.modalSelectedComplements = { ...this.modalSelectedComplements };
    },

    validateComplements() {
      if (!this.selectedProduct?.complements?.length) return true;
      for (const group of this.selectedProduct.complements) {
        if (!group.required) continue;
        if ((this.modalSelectedComplements[group.id] || []).length < (group.min || 1)) {
          this.showToast(`Escolha uma opção em "${group.name}"`, 'error', '⚠️'); return false;
        }
      }
      return true;
    },

    buildSelectedComplements() {
      if (!this.selectedProduct?.complements?.length) return [];
      const result = [];
      for (const group of this.selectedProduct.complements) {
        for (const optId of (this.modalSelectedComplements[group.id] || [])) {
          const opt = group.options.find(o => o.id === optId);
          if (opt) result.push({ groupId: group.id, groupName: group.name, optionId: opt.id, optionName: opt.name, price: opt.price });
        }
      }
      return result;
    },

    // Admin complement management
    addComplementGroup() {
      if (!this.newGroup.name.trim()) { this.showToast('Informe o nome do grupo', 'error', '⚠️'); return; }
      if (!this.editingProduct.complements) this.editingProduct.complements = [];
      this.editingProduct.complements.push({
        id: this.uuid(), name: this.newGroup.name.trim(),
        type: this.newGroup.type, required: this.newGroup.required,
        min: this.newGroup.min || 0, max: this.newGroup.max || 3, options: [],
      });
      this.editingProduct = { ...this.editingProduct };
      this.newGroup = { name:'', type:'multiple', required:false, min:0, max:3, options:[] };
      this.showToast('Grupo adicionado!', 'success', '➕');
    },
    addComplementOption(groupIdx) {
      if (!this.newGroupOption.name.trim()) { this.showToast('Informe o nome da opção', 'error', '⚠️'); return; }
      this.editingProduct.complements[groupIdx].options.push({ id: this.uuid(), name: this.newGroupOption.name.trim(), price: parseFloat(this.newGroupOption.price) || 0 });
      this.editingProduct = { ...this.editingProduct };
      this.newGroupOption = { name:'', price:0 };
    },
    removeComplementOption(groupIdx, optIdx) {
      this.editingProduct.complements[groupIdx].options.splice(optIdx, 1);
      this.editingProduct = { ...this.editingProduct };
    },
    removeComplementGroup(groupIdx) {
      this.editingProduct.complements.splice(groupIdx, 1);
      this.editingProduct = { ...this.editingProduct };
    },


    /* ══════════════════════════════════════════
       COMPUTED — CART & PRICING
    ══════════════════════════════════════════ */

    get cartTotalItems() {
      return this.cart.reduce((s, i) => s + i.qty, 0);
    },

    get cartSubtotal() {
      return this.cart.reduce((s, i) => {
        const base  = (i.promoPrice || i.price);
        const comps = (i.complements || []).reduce((sc, c) => sc + c.price, 0);
        return s + (base + comps) * i.qty;
      }, 0);
    },

    get activePromos() {
      return this.promotions.filter(p => p.active && p.type !== 'coupon');
    },

    get deliveryFee() {
      if (this.checkout.deliveryType === 'pickup') return 0;
      const free = this.promotions.find(p => p.active && p.type === 'freeDelivery' && this.cartSubtotal >= (p.minOrder || 0));
      return free ? 0 : this.config.deliveryFee;
    },

    get discountValue() {
      let discount = 0;
      for (const p of this.promotions.filter(p => p.active && p.type !== 'coupon' && p.type !== 'freeDelivery' && this.cartSubtotal >= (p.minOrder || 0))) {
        if (p.type === 'percentage') discount += this.cartSubtotal * (p.value / 100);
        else if (p.type === 'fixed') discount += p.value;
      }
      if (this.appliedCoupon) {
        if (this.appliedCoupon.type === 'percentage') discount += this.cartSubtotal * (this.appliedCoupon.value / 100);
        else if (this.appliedCoupon.type === 'fixed')  discount += this.appliedCoupon.value;
      }
      return Math.min(discount, this.cartSubtotal);
    },

    get orderTotal() {
      return Math.max(0, this.cartSubtotal - this.discountValue + this.deliveryFee);
    },


    /* ══════════════════════════════════════════
       CART METHODS
    ══════════════════════════════════════════ */

    _cartKey(itemId, note, complements) {
      return `${itemId}::${note||''}::${(complements||[]).map(c=>c.optionId).sort().join('|')}`;
    },

    addToCart(item) {
      if (!item.available) return;
      if (item.complements?.some(g => g.required)) { this.openProductModal(item); return; }
      this.addToCartWithDetails(item, 1, '', []);
    },

    addToCartWithDetails(item, qty, note, complements) {
      if (!item.available) return;
      const key = this._cartKey(item.id, note, complements);
      const existing = this.cart.find(c => c._key === key);
      if (existing) { existing.qty += qty; }
      else {
        this.cart.push({ _key: key, id: item.id, name: item.name, price: item.price, promoPrice: item.promoPrice, image: item.image, qty: qty||1, note: note||'', complements: complements||[] });
      }
      this.showToast(`${item.name} adicionado! 🎉`, 'success', '🛒');
    },

    incrementCart(index) { this.cart[index].qty++; },
    decrementCart(index) {
      if (this.cart[index].qty > 1) this.cart[index].qty--;
      else this.cart.splice(index, 1);
    },


    /* ══════════════════════════════════════════
       PRODUCT MODAL
    ══════════════════════════════════════════ */

    openProductModal(item) {
      this.selectedProduct = item;
      this.modalQty = 1;
      this.modalNote = '';
      this.modalSelectedComplements = {};
      if (item.complements) {
        for (const g of item.complements) {
          if (g.type === 'single' && g.required && g.options.length > 0) {
            this.modalSelectedComplements[g.id] = [g.options[0].id];
          }
        }
      }
      this.showProductModal = true;
    },

    confirmAddToCart() {
      if (!this.validateComplements()) return;
      this.addToCartWithDetails(this.selectedProduct, this.modalQty, this.modalNote, this.buildSelectedComplements());
      this.showProductModal = false;
    },


    /* ══════════════════════════════════════════
       COUPON
    ══════════════════════════════════════════ */

    async applyCoupon() {
      const code = this.couponInput.trim().toUpperCase();
      if (!code) return;
      const coupon = this.promotions.find(p => p.active && p.type === 'coupon' && p.code?.toUpperCase() === code);
      if (!coupon) { this.showToast('Cupom inválido ou expirado', 'error', '❌'); return; }
      if (coupon.minOrder > 0 && this.cartSubtotal < coupon.minOrder) {
        this.showToast(`Pedido mínimo de ${this.formatMoney(coupon.minOrder)} para este cupom`, 'error', '⚠️'); return;
      }
      this.appliedCoupon = coupon;
      this.couponInput = '';
      await this.addAudit('COUPON_APPLIED', { code, discount: coupon.value, type: coupon.type });
      this.showToast(`Cupom "${code}" aplicado! 🎟️`, 'success', '🎟️');
    },


    /* ══════════════════════════════════════════
       CHECKOUT & WHATSAPP
    ══════════════════════════════════════════ */

    sendToWhatsApp() {
      if (!this.config.isOpen) { this.showToast('Loja fechada no momento!', 'error', '🚫'); return; }
      if (!this.checkout.name.trim())  { this.showToast('Informe seu nome', 'error', '⚠️'); return; }
      if (!this.checkout.phone.trim()) { this.showToast('Informe seu WhatsApp', 'error', '⚠️'); return; }
      if (this.checkout.deliveryType === 'delivery' && !this.checkout.address.trim()) { this.showToast('Informe o endereço', 'error', '⚠️'); return; }
      if (this.cartSubtotal < this.config.minOrder && this.checkout.deliveryType === 'delivery') { this.showToast(`Pedido mínimo: ${this.formatMoney(this.config.minOrder)}`, 'error', '⚠️'); return; }
      if (this.checkout.payment === 'pix') { this.openPixModal(); return; }
      this._finishOrder();
    },

    openPixModal() {
      this.pixStatus = 'pending'; this.pixCopied = false; this.pixCountdown = 300;
      this.showCart = false; this.showPixModal = true;
      clearInterval(this._pixTimer);
      this._pixTimer = setInterval(() => { this.pixCountdown--; if (this.pixCountdown <= 0) { clearInterval(this._pixTimer); this.pixStatus = 'expired'; } }, 1000);
    },

    confirmPixPayment() {
      clearInterval(this._pixTimer);
      this.pixStatus = 'confirmed';
      setTimeout(() => { this.showPixModal = false; this._finishOrder(); }, 1500);
    },

    copyPixKey() {
      navigator.clipboard.writeText(this.config.pixKey)
        .then(() => { this.pixCopied = true; setTimeout(() => this.pixCopied = false, 3000); })
        .catch(() => {
          const ta = document.createElement('textarea'); ta.value = this.config.pixKey;
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          this.pixCopied = true; setTimeout(() => this.pixCopied = false, 3000);
        });
    },

    get pixCountdownFormatted() {
      return `${Math.floor(this.pixCountdown/60).toString().padStart(2,'0')}:${(this.pixCountdown%60).toString().padStart(2,'0')}`;
    },

    get pixQrUrl() {
      const data = `PIX|${this.config.pixKey}|${this.orderTotal.toFixed(2)}`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}&margin=10&bgcolor=ffffff`;
    },

    async _finishOrder() {
      const paymentNames = { pix:'PIX', card:'Cartão', cash:'Dinheiro' };
      const orderNum = this.nextOrderNumber();
      const now = new Date().toLocaleString('pt-BR');

      let msg = `🍔 *PEDIDO #${orderNum} — ${this.config.restaurantName.toUpperCase()}*\n`;
      msg += `📅 ${now}\n\n`;
      msg += `👤 *Cliente:* ${this.checkout.name}\n`;
      msg += `📱 *WhatsApp:* ${this.checkout.phone}\n`;
      if (this.checkout.deliveryType === 'delivery') {
        msg += `📍 *Endereço:* ${this.checkout.address}${this.checkout.complement ? ', '+this.checkout.complement : ''}\n`;
      } else {
        msg += `🏃 *Retirada no local*\n`;
      }
      msg += '\n📦 *ITENS:*\n';
      this.cart.forEach(item => {
        const base  = (item.promoPrice || item.price);
        const comps = (item.complements||[]).reduce((s,c)=>s+c.price,0);
        msg += `• ${item.qty}x ${item.name} — ${this.formatMoney((base+comps)*item.qty)}\n`;
        if (item.complements?.length) msg += `  ➜ _${item.complements.map(c=>`${c.optionName}${c.price>0?' +'+this.formatMoney(c.price):''}`).join(', ')}_\n`;
        if (item.note) msg += `  📝 _${item.note}_\n`;
      });
      msg += `\n💰 *RESUMO:*\n`;
      msg += `Subtotal: ${this.formatMoney(this.cartSubtotal)}\n`;
      if (this.discountValue > 0) msg += `Desconto: -${this.formatMoney(this.discountValue)}\n`;
      if (this.checkout.deliveryType === 'delivery') msg += `Taxa entrega: ${this.deliveryFee === 0 ? 'Grátis 🎉' : this.formatMoney(this.deliveryFee)}\n`;
      msg += `*TOTAL: ${this.formatMoney(this.orderTotal)}*\n`;
      msg += `\n💳 *Pagamento:* ${paymentNames[this.checkout.payment]}\n`;
      if (this.checkout.payment === 'pix') msg += `\n✅ *PIX informado via QR Code*\n_(Aguardando comprovante)_`;

      await this.saveOrderToHistory(orderNum);
      window.open(`https://wa.me/${this.config.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    async saveOrderToHistory(orderNum) {
      const orderId = this.uuid();
      const order = {
        uuid:         orderId,
        orderNumber:  orderNum || this.nextOrderNumber(),
        name:         this.checkout.name,
        phone:        this.checkout.phone,
        address:      this.checkout.deliveryType === 'delivery' ? this.checkout.address : 'Retirada',
        complement:   this.checkout.complement || '',
        deliveryType: this.checkout.deliveryType,
        payment:      this.checkout.payment,
        subtotal:     this.cartSubtotal,
        discount:     this.discountValue,
        deliveryFee:  this.deliveryFee,
        total:        this.orderTotal,
        items: this.cart.map(i => {
          const base  = (i.promoPrice || i.price);
          const comps = (i.complements||[]).reduce((s,c)=>s+c.price,0);
          return { name:i.name, qty:i.qty, unitPrice:base, complementsTotal:comps, totalUnit:base+comps, total:(base+comps)*i.qty, note:i.note||'', complements:i.complements||[] };
        }),
        coupon:    this.appliedCoupon?.code || '',
        date:      new Date().toLocaleDateString('pt-BR'),
        time:      new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
        timestamp: new Date().toISOString(),
        hash:      this.djb2Hash(orderId + String(this.orderTotal) + this.checkout.name),
      };

      this.orderHistory.push(order);

      // Persist to Dexie
      await this.persistOrder(order);
      await this.saveOrderCounter();
      await this.addAudit('ORDER_PLACED', {
        orderNumber: order.orderNumber,
        uuid: orderId,
        total: order.total,
        payment: order.payment,
        itemCount: this.cart.length,
        customer: order.name,
      });

      // Reset cart
      this.cart = [];
      this.checkout = { name:'', phone:'', address:'', complement:'', deliveryType:'delivery', payment:'pix' };
      this.appliedCoupon = null;
      this.showCart = false;
      this.showToast('Pedido enviado! 🎉', 'success', '✅');
    },


    /* ══════════════════════════════════════════
       REPORTS / STATS
       Pure calculation from this.orderHistory
       No audit log data mixed in
    ══════════════════════════════════════════ */

    getTopProducts(orders) {
      const map = {};
      orders.forEach(o => {
        (o.items||[]).forEach(item => {
          if (!map[item.name]) map[item.name] = { name:item.name, qty:0, total:0 };
          map[item.name].qty   += item.qty;
          map[item.name].total += item.total;
        });
      });
      return Object.values(map).sort((a,b) => b.qty - a.qty).slice(0, 10);
    },

    get todayStats() {
      const today = new Date().toLocaleDateString('pt-BR');
      const orders = this.orderHistory.filter(o => o.date === today);
      const revenue = orders.reduce((s,o)=>s+o.total,0);
      return {
        date:      today,
        orders:    orders.length,
        revenue,
        avgTicket: orders.length > 0 ? revenue / orders.length : 0,
        byPayment: {
          pix:  orders.filter(o=>o.payment==='pix').reduce((s,o)=>s+o.total,0),
          card: orders.filter(o=>o.payment==='card').reduce((s,o)=>s+o.total,0),
          cash: orders.filter(o=>o.payment==='cash').reduce((s,o)=>s+o.total,0),
        },
        topProducts: this.getTopProducts(orders),
        rawOrders:   orders,
      };
    },

    get allTimeStats() {
      const revenue = this.orderHistory.reduce((s,o)=>s+o.total,0);
      const count   = this.orderHistory.length;
      const byDate  = {};
      this.orderHistory.forEach(o => {
        if (!byDate[o.date]) byDate[o.date] = { date:o.date, orders:0, revenue:0 };
        byDate[o.date].orders++;
        byDate[o.date].revenue += o.total;
      });
      return {
        totalRevenue: revenue,
        totalOrders:  count,
        avgTicket:    count > 0 ? revenue/count : 0,
        byDate:       Object.values(byDate).sort((a,b) => {
          const toMs = d => new Date(d.split('/').reverse().join('-')).getTime();
          return toMs(a.date) - toMs(b.date);
        }),
        topProducts: this.getTopProducts(this.orderHistory),
      };
    },


    /* ══════════════════════════════════════════
       EXPORTS — Financial data only, no access log
    ══════════════════════════════════════════ */

    async exportExcel() {
      if (typeof XLSX === 'undefined') { this.showToast('Biblioteca não carregada', 'error', '❌'); return; }
      const today = this.todayStats;
      const wb    = XLSX.utils.book_new();

      // ── Sheet 1: Resumo Contábil ──
      const resumoData = [
        ['RELATÓRIO DE FECHAMENTO DO DIA', '', '', ''],
        ['Restaurante:', this.config.restaurantName, '', ''],
        ['Data:', today.date, '', ''],
        ['Hora geração:', new Date().toLocaleString('pt-BR'), '', ''],
        ['', '', '', ''],
        ['DEMONSTRATIVO FINANCEIRO', '', '', ''],
        ['(+) Subtotal bruto', today.rawOrders.reduce((s,o)=>s+o.subtotal,0), '', ''],
        ['(-) Descontos/Cupons', -today.rawOrders.reduce((s,o)=>s+o.discount,0), '', ''],
        ['(+) Taxa de entrega', today.rawOrders.reduce((s,o)=>s+o.deliveryFee,0), '', ''],
        ['(=) RECEITA LÍQUIDA', today.revenue, '', ''],
        ['', '', '', ''],
        ['FORMAS DE RECEBIMENTO', '', '', ''],
        ['PIX',      today.byPayment.pix,  today.revenue>0?((today.byPayment.pix/today.revenue)*100).toFixed(2)+'%':'0%', ''],
        ['Cartão',   today.byPayment.card, today.revenue>0?((today.byPayment.card/today.revenue)*100).toFixed(2)+'%':'0%', ''],
        ['Dinheiro', today.byPayment.cash, today.revenue>0?((today.byPayment.cash/today.revenue)*100).toFixed(2)+'%':'0%', ''],
        ['TOTAL',    today.revenue, '100%', ''],
        ['', '', '', ''],
        ['Pedidos:', today.orders, '', ''],
        ['Ticket médio:', today.avgTicket, '', ''],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumoData);
      ws1['!cols'] = [{wch:30},{wch:22},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumo Contábil');

      // ── Sheet 2: Pedidos com UUID e hash ──
      const hdrs2 = ['UUID','Nº Pedido','Data','Hora','Cliente','Telefone','Tipo','Endereço','Pagamento','Subtotal','Desconto','Entrega','Total','Cupom','Hash Integridade'];
      const rows2 = today.rawOrders.map(o => [
        o.uuid||'-', o.orderNumber||'-', o.date, o.time,
        o.name, o.phone,
        o.deliveryType==='delivery'?'Delivery':'Retirada',
        o.address+(o.complement?', '+o.complement:''),
        {pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment]||o.payment,
        o.subtotal, o.discount, o.deliveryFee, o.total,
        o.coupon||'-', o.hash||'-',
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([hdrs2, ...rows2]);
      ws2['!cols'] = [{wch:38},{wch:16},{wch:10},{wch:8},{wch:20},{wch:16},{wch:10},{wch:35},{wch:10},{wch:12},{wch:10},{wch:10},{wch:12},{wch:16},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos do Dia');

      // ── Sheet 3: Itens com complementos ──
      const hdrs3 = ['Nº Pedido','Hora','Cliente','Produto','Qtd','Preço Base','Complementos R$','Total Unit.','Total Linha','Observação','Complementos Detalhados'];
      const rows3 = [];
      today.rawOrders.forEach(o => {
        (o.items||[]).forEach(item => {
          const compDetail = (item.complements||[]).map(c=>`${c.optionName}${c.price>0?' (+R$'+c.price.toFixed(2)+')':''}`).join(' | ');
          rows3.push([o.orderNumber||o.uuid?.slice(0,8)||'-', o.time, o.name, item.name, item.qty, item.unitPrice, item.complementsTotal||0, item.totalUnit||item.unitPrice, item.total, item.note||'', compDetail||'-']);
        });
      });
      const ws3 = XLSX.utils.aoa_to_sheet([hdrs3, ...rows3]);
      ws3['!cols'] = [{wch:16},{wch:8},{wch:18},{wch:28},{wch:5},{wch:12},{wch:16},{wch:13},{wch:12},{wch:25},{wch:50}];
      XLSX.utils.book_append_sheet(wb, ws3, 'Itens Vendidos');

      // ── Sheet 4: Ranking Produtos ──
      const hdrs4 = ['Pos.','Produto','Qtd Vendida','Faturamento','% do Total'];
      const rows4 = today.topProducts.map((p,i) => [i+1, p.name, p.qty, p.total, today.revenue>0?((p.total/today.revenue)*100).toFixed(1)+'%':'0%']);
      const ws4 = XLSX.utils.aoa_to_sheet([hdrs4, ...rows4]);
      ws4['!cols'] = [{wch:5},{wch:30},{wch:14},{wch:14},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws4, 'Ranking Produtos');

      // ── Sheet 5: Histórico Geral ──
      const hdrs5 = ['Data','Pedidos','Faturamento','Ticket Médio'];
      const rows5 = this.allTimeStats.byDate.map(d => [d.date, d.orders, d.revenue, d.orders>0?d.revenue/d.orders:0]);
      rows5.push(['', '', '', '']);
      rows5.push(['TOTAL GERAL', this.allTimeStats.totalOrders, this.allTimeStats.totalRevenue, this.allTimeStats.avgTicket]);
      const ws5 = XLSX.utils.aoa_to_sheet([hdrs5, ...rows5]);
      ws5['!cols'] = [{wch:12},{wch:10},{wch:16},{wch:14}];
      XLSX.utils.book_append_sheet(wb, ws5, 'Histórico Geral');

      const filename = `fechamento_${today.date.replace(/\//g,'-')}_${this.config.restaurantName.replace(/\s+/g,'_')}.xlsx`;
      XLSX.writeFile(wb, filename);
      await this.addAudit('EXPORT_EXCEL', { date: today.date, orders: today.orders, revenue: today.revenue });
      this.showToast('Excel exportado!', 'success', '📊');
    },

    async exportCSV() {
      const today = this.todayStats;
      const hdrs  = ['UUID','Nº Pedido','Data','Hora','Cliente','Telefone','Tipo','Endereço','Pagamento','Subtotal','Desconto','Entrega','Total','Cupom','Hash'];
      const rows  = today.rawOrders.map(o => [
        o.uuid||'', o.orderNumber||'', o.date, o.time, o.name, o.phone,
        o.deliveryType==='delivery'?'Delivery':'Retirada', o.address,
        {pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment],
        o.subtotal.toFixed(2), o.discount.toFixed(2), o.deliveryFee.toFixed(2), o.total.toFixed(2),
        o.coupon||'', o.hash||'',
      ]);
      const csv = [hdrs, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = `pedidos_${today.date.replace(/\//g,'-')}.csv`; a.click();
      URL.revokeObjectURL(url);
      await this.addAudit('EXPORT_CSV', { date: today.date, orders: today.orders });
      this.showToast('CSV exportado!', 'success', '📄');
    },

    async exportJSON() {
      const data = {
        exportedAt:    new Date().toISOString(),
        restaurant:    this.config.restaurantName,
        exportVersion: '3.0',
        date:          this.todayStats.date,
        summary:       { orders: this.todayStats.orders, revenue: this.todayStats.revenue, avgTicket: this.todayStats.avgTicket, byPayment: this.todayStats.byPayment },
        topProducts:   this.todayStats.topProducts,
        orders:        this.todayStats.rawOrders,
        allTimeStats:  this.allTimeStats,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = `backup_${this.todayStats.date.replace(/\//g,'-')}.json`; a.click();
      URL.revokeObjectURL(url);
      await this.addAudit('EXPORT_JSON', { date: this.todayStats.date });
      this.showToast('JSON exportado!', 'success', '💾');
    },

    async printReport() {
      const today  = this.todayStats;
      const rows   = today.rawOrders.map((o,i) => {
        const pay   = {pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment]||o.payment;
        const intOk = this.verifyOrderHash(o);
        const badge = intOk===null ? '' : intOk ? '<span style="color:#22c55e">✓ OK</span>' : '<span style="color:#ef4444">⚠ ERRO</span>';
        return `<tr><td>${i+1}</td><td>${o.orderNumber||'-'}</td><td>${o.time}</td><td>${o.name}</td><td>${o.deliveryType==='delivery'?'Delivery':'Retirada'}</td><td>${pay}</td><td style="text-align:right">R$ ${o.total.toFixed(2)}</td><td>${badge}</td></tr>`;
      }).join('');
      const topRows = today.topProducts.map((p,i) => `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.qty}</td><td>R$ ${p.total.toFixed(2)}</td></tr>`).join('');

      const html = `<!DOCTYPE html><html lang="pt-br"><head>
        <meta charset="UTF-8"><title>Fechamento ${today.date}</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:20px}
          h1{font-size:18px;margin-bottom:4px}h2{font-size:13px;margin:14px 0 6px;padding-bottom:4px;border-bottom:2px solid #ef4444;color:#ef4444}
          .header{display:flex;justify-content:space-between;margin-bottom:18px}.header-right{text-align:right;color:#666;font-size:10px}
          .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}
          .kpi{background:#f8f8f8;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
          .kpi-value{font-size:17px;font-weight:bold;color:#ef4444}.kpi-label{font-size:9px;color:#666;margin-top:2px}
          table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#ef4444;color:white;padding:5px 7px;text-align:left;font-size:10px}
          td{padding:4px 7px;border-bottom:1px solid #f0f0f0;font-size:10px}tr:nth-child(even) td{background:#fafafa}
          .pay-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0}
          .footer{margin-top:20px;text-align:center;font-size:9px;color:#999;border-top:1px solid #e5e7eb;padding-top:10px}
          @media print{body{padding:0}}
        </style>
      </head><body>
        <div class="header">
          <div><h1>${this.config.restaurantName}</h1><div style="color:#666;font-size:10px">${this.config.city} • ${this.config.whatsapp}</div></div>
          <div class="header-right"><div style="font-size:15px;font-weight:bold">FECHAMENTO DO DIA</div><div>${today.date}</div><div>Gerado: ${new Date().toLocaleString('pt-BR')}</div></div>
        </div>
        <h2>📊 Indicadores</h2>
        <div class="kpis">
          <div class="kpi"><div class="kpi-value">${today.orders}</div><div class="kpi-label">Pedidos</div></div>
          <div class="kpi"><div class="kpi-value">R$ ${today.revenue.toFixed(2)}</div><div class="kpi-label">Faturamento</div></div>
          <div class="kpi"><div class="kpi-value">R$ ${today.avgTicket.toFixed(2)}</div><div class="kpi-label">Ticket Médio</div></div>
        </div>
        <h2>💳 Por Forma de Pagamento</h2>
        <div class="pay-row"><span>🔑 PIX</span><span><strong>R$ ${today.byPayment.pix.toFixed(2)}</strong></span></div>
        <div class="pay-row"><span>💳 Cartão</span><span><strong>R$ ${today.byPayment.card.toFixed(2)}</strong></span></div>
        <div class="pay-row"><span>💵 Dinheiro</span><span><strong>R$ ${today.byPayment.cash.toFixed(2)}</strong></span></div>
        <h2>🧾 Pedidos do Dia</h2>
        <table><thead><tr><th>#</th><th>Nº Pedido</th><th>Hora</th><th>Cliente</th><th>Tipo</th><th>Pgto</th><th>Total</th><th>Integridade</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="8" style="text-align:center;color:#999">Nenhum pedido hoje</td></tr>'}</tbody></table>
        <h2>🏆 Top Produtos</h2>
        <table><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Faturamento</th></tr></thead>
        <tbody>${topRows||'<tr><td colspan="4" style="text-align:center;color:#999">Sem dados</td></tr>'}</tbody></table>
        <div class="footer">Cardápio Digital Pro v3.0 • ${new Date().toLocaleString('pt-BR')}</div>
      </body></html>`;
      const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.onload = () => w.print();
      await this.addAudit('EXPORT_PRINT', { date: today.date });
      this.showToast('Abrindo para impressão!', 'success', '🖨️');
    },

    async closeDayReport() {
      if (this.todayStats.orders === 0) { this.showToast('Nenhum pedido hoje para fechar', 'error', '⚠️'); return; }
      await this.addAudit('DAY_CLOSED', { date: this.todayStats.date, orders: this.todayStats.orders, revenue: this.todayStats.revenue });
      this.showToast(`Dia ${this.todayStats.date} fechado! ${this.todayStats.orders} pedido(s) · ${this.formatMoney(this.todayStats.revenue)}`, 'success', '🎊');
    },


    /* ══════════════════════════════════════════
       ADMIN — CATALOG CRUD
    ══════════════════════════════════════════ */

    // Categories
    async addCategory() {
      if (!this.newCategory.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
      const cat = { id: this.newCategory.name.toLowerCase().replace(/\s+/g,'-')+'-'+Date.now(), name: this.newCategory.name.trim(), icon: this.newCategory.icon||'📦', active: true };
      this.categories.push(cat);
      this.newCategory = { name:'', icon:'' };
      await this.saveCategories();
      await this.addAudit('CATEGORY_CREATED', { name: cat.name, id: cat.id });
      this.showToast('Categoria adicionada!', 'success', '🏷️');
    },

    async deleteCategory(index) {
      if (!confirm('Excluir esta categoria?')) return;
      const cat = this.categories[index];
      this.categories.splice(index, 1);
      await this.saveCategories();
      await this.addAudit('CATEGORY_DELETED', { name: cat.name, id: cat.id });
    },

    getCategoryName(catId) {
      const cat = this.categories.find(c => c.id === catId);
      return cat ? `${cat.icon} ${cat.name}` : catId;
    },

    // Products
    openProductForm(item) {
      if (item) {
        this.editingProduct = { ...item, complements: JSON.parse(JSON.stringify(item.complements||[])) };
      } else {
        this.editingProduct = { name:'', desc:'', price:0, promoPrice:null, category:this.categories[0]?.id||'', image:'', available:true, featured:false, complements:[] };
      }
      this.newGroup = { name:'', type:'multiple', required:false, min:0, max:3, options:[] };
      this.newGroupOption = { name:'', price:0 };
      this.showProductForm = true;
    },

    async saveProduct() {
      if (!this.editingProduct.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
      if (!this.editingProduct.price || this.editingProduct.price <= 0) { this.showToast('Preço inválido', 'error', '⚠️'); return; }
      if (!this.editingProduct.promoPrice || this.editingProduct.promoPrice <= 0) this.editingProduct.promoPrice = null;
      const isNew = !this.editingProduct.id;
      if (isNew) {
        this.editingProduct.id = Date.now();
        if (!this.editingProduct.complements) this.editingProduct.complements = [];
        this.items.push({ ...this.editingProduct });
        await this.addAudit('PRODUCT_CREATED', { name: this.editingProduct.name, price: this.editingProduct.price });
        this.showToast('Produto adicionado!', 'success', '➕');
      } else {
        const idx = this.items.findIndex(i => i.id === this.editingProduct.id);
        if (idx !== -1) this.items.splice(idx, 1, { ...this.editingProduct });
        await this.addAudit('PRODUCT_UPDATED', { name: this.editingProduct.name, id: this.editingProduct.id });
        this.showToast('Produto atualizado!', 'success', '✏️');
      }
      await this.saveItems();
      this.showProductForm = false;
    },

    async deleteProduct(index) {
      if (!confirm('Excluir este produto?')) return;
      const item = this.items[index];
      this.items.splice(index, 1);
      await this.saveItems();
      await this.addAudit('PRODUCT_DELETED', { name: item.name, id: item.id });
      this.showToast('Produto removido', 'success', '🗑️');
    },

    // Promotions
    async addPromo() {
      if (!this.newPromo.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
      if (this.newPromo.type === 'coupon' && !this.newPromo.code.trim()) { this.showToast('Informe o código', 'error', '⚠️'); return; }
      const promo = { id: Date.now(), name: this.newPromo.name.trim(), type: this.newPromo.type, value: this.newPromo.value||0, code: this.newPromo.code.trim().toUpperCase(), minOrder: this.newPromo.minOrder||0, expiresAt: this.newPromo.expiresAt, active: true };
      this.promotions.push(promo);
      this.newPromo = { name:'', type:'percentage', value:0, code:'', minOrder:0, expiresAt:'' };
      await this.savePromotions();
      await this.addAudit('PROMO_CREATED', { name: promo.name, type: promo.type, value: promo.value, code: promo.code });
      this.showToast('Promoção criada!', 'success', '🔥');
    },

    async deletePromo(index) {
      const promo = this.promotions[index];
      this.promotions.splice(index, 1);
      await this.savePromotions();
      await this.addAudit('PROMO_DELETED', { name: promo.name, id: promo.id });
    },

    // Order history clear
    async clearOrderHistory() {
      this.orderHistory = [];
      await db.orders.clear();
      await this.addAudit('HISTORY_CLEARED', {});
      this.showToast('Histórico apagado', 'success', '🗑️');
    },


    /* ══════════════════════════════════════════
       THEME
    ══════════════════════════════════════════ */

    setTheme(theme) {
      this.currentTheme = theme;
      this.customAccent = theme.accent;
      document.documentElement.style.setProperty('--accent', theme.accent);
      document.documentElement.style.setProperty('--accent-hover', theme.hover);
      document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
      document.documentElement.style.setProperty('--accent-light', `rgba(${theme.rgb}, 0.12)`);
      this.saveSetting('theme', theme.id);
      this.saveSetting('customAccent', theme.accent);
    },

    applyCustomColor(hex) {
      const rgb    = this.hexToRgb(hex);
      const darker = this.darkenHex(hex, 0.15);
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-hover', darker);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.documentElement.style.setProperty('--accent-light', `rgba(${rgb}, 0.12)`);
      this.currentTheme = { id:'custom', name:'Custom', accent:hex };
      this.saveSetting('theme', 'custom');
      this.saveSetting('customAccent', hex);
    },

    hexToRgb(hex) {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `${r},${g},${b}`;
    },

    darkenHex(hex, amount) {
      let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      r = Math.max(0, Math.round(r*(1-amount)));
      g = Math.max(0, Math.round(g*(1-amount)));
      b = Math.max(0, Math.round(b*(1-amount)));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    },


    /* ══════════════════════════════════════════
       INIT
    ══════════════════════════════════════════ */

    async init() {
      // Load UI prefs first (localStorage — fast, synchronous)
      this._loadSecurityState();
      this.darkMode = this.loadSetting('darkMode', false);
      document.documentElement.classList.toggle('dark', this.darkMode);

      // Apply saved theme immediately
      const savedThemeId = this.loadSetting('theme', 'red');
      const savedAccent  = this.loadSetting('customAccent', '#ef4444');
      if (savedThemeId === 'custom') {
        this.customAccent = savedAccent;
        this.applyCustomColor(savedAccent);
      } else {
        const theme = this.themes.find(t => t.id === savedThemeId);
        if (theme) this.setTheme(theme);
      }

      // Load business data from Dexie (async)
      await this.loadAllData();

      // Restore admin session if still valid
      this._loadSession();

      // Alpine watchers
      this.$watch('darkMode', val => {
        document.documentElement.classList.toggle('dark', val);
        this.saveSetting('darkMode', val);
      });
      this.$watch('activeTab', () => {
        if (this.searchQuery) { this.searchQuery = ''; this.showSearch = false; }
      });

      // Save catalog changes reactively
      this.$watch('categories', async () => { if (this.dbReady) await this.saveCategories(); });
      this.$watch('promotions', async () => { if (this.dbReady) await this.savePromotions(); });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          this.showCart = this.showProductModal = this.showThemePicker = this.showProductForm = false;
        }
      });
    },

  };
}