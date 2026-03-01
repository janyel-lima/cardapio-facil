const appState = {
  darkMode: false, showSearch: false, searchQuery: '', activeTab: null,
  showCart: false, showProductModal: false, showThemePicker: false,
  showAdminLogin: false, showAdminPanel: false, showProductForm: false,
  showPixModal: false, showTutorial: false, tutorialStep: 0, dbReady: false,

  failedAttempts: 0, lockedUntil: null, sessionId: null, sessionExpiry: null,
  sessionCountdownLabel: '', _sessionTimer: null,
  SECURITY_MAX_ATTEMPTS: 5, SECURITY_LOCKOUT_MS: 15 * 60 * 1000, SECURITY_SESSION_MS: 4 * 60 * 60 * 1000,

  pixStatus: 'pending', pixCopied: false, pixCountdown: 300, _pixTimer: null,
  selectedProduct: null, modalQty: 1, modalNote: '', modalSelectedComplements: {},

  cart: [],
  checkout: { name: '', phone: '', address: '', complement: '', deliveryType: 'delivery', payment: 'pix' },
  couponInput: '', appliedCoupon: null,

  isAdmin: false, adminPassword: '', adminError: '', adminTab: 'store',
  adminTabs: [
    { id: 'store', name: 'Loja', icon: '🏪' }, { id: 'categories', name: 'Categorias', icon: '🏷️' },
    { id: 'products', name: 'Produtos', icon: '🛍️' }, { id: 'promos', name: 'Promoções', icon: '🔥' },
     { id: 'order-manager', name: 'Gestor de Pedidos', icon: '⚙️' },{ id: 'orders', name: 'Histórico de Pedidos', icon: '📋' }, { id: 'reports', name: 'Relatórios', icon: '📊' },
  ],

  editingProduct: {},
  newGroup: { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] },
  newGroupOption: { name: '', price: 0 },
  newCategory: { name: '', icon: '' },
  newPromo: { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' },

  orderHistory: [], orderCounter: 0, auditLog: [],
  toast: { visible: false, message: '', type: 'success', icon: '✓' }, _toastTimer: null,

  currentTheme: { id: 'red', name: 'Vermelho', accent: '#ef4444' }, customAccent: '#ef4444',
  themes: [
    { id: 'red', name: 'Vermelho', accent: '#ef4444', hover: '#dc2626', rgb: '239,68,68' },
    { id: 'orange', name: 'Laranja', accent: '#f97316', hover: '#ea580c', rgb: '249,115,22' },
    { id: 'amber', name: 'Âmbar', accent: '#f59e0b', hover: '#d97706', rgb: '245,158,11' },
    { id: 'green', name: 'Verde', accent: '#22c55e', hover: '#16a34a', rgb: '34,197,94' },
    { id: 'teal', name: 'Teal', accent: '#14b8a6', hover: '#0d9488', rgb: '20,184,166' },
    { id: 'blue', name: 'Azul', accent: '#3b82f6', hover: '#2563eb', rgb: '59,130,246' },
    { id: 'violet', name: 'Violeta', accent: '#8b5cf6', hover: '#7c3aed', rgb: '139,92,246' },
    { id: 'pink', name: 'Rosa', accent: '#ec4899', hover: '#db2777', rgb: '236,72,153' },
  ],
  paymentMethods: [
    { id: 'pix', name: 'PIX', icon: '🔑' }, { id: 'card', name: 'Cartão', icon: '💳' }, { id: 'cash', name: 'Dinheiro', icon: '💵' },
  ],

  tutorialSteps: [
    { icon:'🏪', title:'Bem-vindo ao Painel Admin!', content:'Este tutorial vai te guiar pelas principais funcionalidades do seu cardápio digital.', tip:'Você pode voltar aqui a qualquer momento.' },
    { icon:'⚙️', title:'Configurações da Loja', content:'Na aba "Loja" você configura o essencial.', tip:'O botão "Loja Aberta" controla novos pedidos.' },
    { icon:'🏷️', title:'Categorias', content:'Crie categorias com emojis. Ative/desative livremente.', tip:'Emojis deixam o cardápio atrativo.' },
    { icon:'🛍️', title:'Produtos + Complementos', content:'Adicione produtos e grupos de complementos.', tip:'Complementos aumentam o ticket médio!' },
    { icon:'🔥', title:'Promoções', content:'Crie promoções automáticas ou cupons.', tip:'Crie cupons para fidelizar clientes.' },
    { icon:'📊', title:'Relatórios', content:'Exporte fechamentos com integridade (Hash).', tip:'Excel gera 5 planilhas completas.' }
  ],

  config: {
    restaurantName: 'Hamburgueria do Vale', city: 'Arapiraca, AL', whatsapp: '5582999999999',
    pixKey: 'contato@hamburgeriavale.com.br', deliveryFee: 6.00, minOrder: 25.00,
    deliveryTime: '30-45 min', isOpen: true, adminPass: 'admin123',
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
};