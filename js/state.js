const appState = {
  darkMode: false, showSearch: false, searchQuery: '', activeTab: null,
  showCart: false, showProductModal: false, showThemePicker: false,
  showAdminLogin: false, showAdminPanel: false, showProductForm: false,
  showPixModal: false, showTutorial: false, tutorialStep: 0, dbReady: false,

  failedAttempts: 0, lockedUntil: null, sessionId: null, sessionExpiry: null,
  sessionCountdownLabel: '', _sessionTimer: null,
  SECURITY_MAX_ATTEMPTS: 5,
  SECURITY_LOCKOUT_MS:   15 * 60 * 1000,
  SECURITY_SESSION_MS:    4 * 60 * 60 * 1000,
  selectedPromoFilter: null,
  viewMode : 'grid',

  pixStatus: 'pending', pixCopied: false, pixCountdown: 300, _pixTimer: null,
  selectedProduct: null, modalQty: 1, modalNote: '', modalSelectedComplements: {},

  cart: [],
  checkout: { name: '', phone: '', address: '', complement: '', deliveryType: 'delivery', payment: 'pix' },
  couponInput: '', appliedCoupon: null,

  isAdmin: false, adminPassword: '', adminError: '', adminTab: 'store',
  adminTabs: [
  { id: 'store',         name: 'Loja',                icon: '🏪' },
  { id: 'categories',    name: 'Categorias',           icon: '🏷️' },
  { id: 'products',      name: 'Produtos',             icon: '🛍️' },
  { id: 'promos',        name: 'Promoções',            icon: '🔥' },
  { id: 'order-manager', name: 'Gestor Pedidos',    icon: '⚙️' },
  { id: 'orders',        name: 'Histórico Pedidos', icon: '📋' },
  { id: 'reports',       name: 'Relatórios',           icon: '📊' },
  { id: 'syslogs',       name: 'Sys Logs',             icon: '🪲' }, // ← NOVO
],

  editingProduct: {},
  newGroup:       { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] },
  newGroupOption: { name: '', price: 0 },
  newCategory:    { name: '', icon: '' },
  newPromo:       { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' },

  // FIX: orderHistory e auditLog DEVEM ser declarados como arrays aqui.
  // database.js::loadAllData e admin.js::addAudit nunca reatribuem a referência
  // (evitando quebrar o proxy do Alpine) — eles sempre mutam esses arrays via
  // splice() / push(). Se esses campos não existirem ou não forem arrays antes
  // do merge com os outros módulos, as operações de persistência vão falhar.
  orderHistory: [],
  orderCounter: 0,
  auditLog:     [],

  // ── Sys Logs ─────────────────────────────────────────────────
errorLogs:       [],   // DEVE ser [] aqui — nunca reatribuir
logFilter:       'all',
logSearch:       '',
logDetailId:     null,
logClearConfirm: false,
_logSessionErrors: 0,

  toast: { visible: false, message: '', type: 'success', icon: '✓' }, _toastTimer: null,

  currentTheme: { id: 'red', name: 'Vermelho', accent: '#ef4444' }, customAccent: '#ef4444',
  themes: [
    { id: 'red',    name: 'Vermelho', accent: '#ef4444', hover: '#dc2626', rgb: '239,68,68'   },
    { id: 'orange', name: 'Laranja',  accent: '#f97316', hover: '#ea580c', rgb: '249,115,22'  },
    { id: 'amber',  name: 'Âmbar',   accent: '#f59e0b', hover: '#d97706', rgb: '245,158,11'  },
    { id: 'green',  name: 'Verde',    accent: '#22c55e', hover: '#16a34a', rgb: '34,197,94'   },
    { id: 'teal',   name: 'Teal',     accent: '#14b8a6', hover: '#0d9488', rgb: '20,184,166'  },
    { id: 'blue',   name: 'Azul',     accent: '#3b82f6', hover: '#2563eb', rgb: '59,130,246'  },
    { id: 'violet', name: 'Violeta',  accent: '#8b5cf6', hover: '#7c3aed', rgb: '139,92,246'  },
    { id: 'pink',   name: 'Rosa',     accent: '#ec4899', hover: '#db2777', rgb: '236,72,153'  },
  ],
  paymentMethods: [
    { id: 'pix',  name: 'PIX',      icon: '🔑' },
    { id: 'card', name: 'Cartão',   icon: '💳' },
    { id: 'cash', name: 'Dinheiro', icon: '💵' },
  ],

  tutorialSteps: [
    {
      group: 'setup', groupLabel: 'Configuração', groupIcon: '⚙️',
      icon: '🎉', title: 'Bem-vindo ao Cardápio Digital Pro!',
      content: 'Seu cardápio digital completo com pedidos via WhatsApp, gestão de produtos, promoções, rastreamento e relatórios contábeis. Vamos configurar tudo em poucos minutos.',
      tip: 'Este tutorial cobre todas as funcionalidades. Use o menu lateral para pular direto ao tema que precisa.',
      visual: 'welcome',
    },
    {
      group: 'setup', groupLabel: 'Configuração', groupIcon: '⚙️',
      icon: '🏪', title: 'Configurando sua Loja',
      content: 'Na aba "Loja" do painel admin, preencha: Nome do restaurante, cidade, número do WhatsApp com DDI (ex: 5582999999999), Chave PIX para pagamentos, Taxa de entrega e Pedido mínimo.',
      tip: 'O número do WhatsApp deve ter o código do país (55 para Brasil) sem espaços ou símbolos.',
      visual: 'store',
    },
    {
      group: 'setup', groupLabel: 'Configuração', groupIcon: '⚙️',
      icon: '🔓', title: 'Abrindo e Fechando a Loja',
      content: 'O botão "Loja Aberta" no painel admin controla se novos pedidos são aceitos. Quando fechada, clientes veem o aviso e não conseguem finalizar pedidos.',
      tip: 'O indicador verde pulsante no header do cardápio mostra aos clientes que a loja está aberta em tempo real.',
      visual: 'open',
    },
    {
      group: 'setup', groupLabel: 'Configuração', groupIcon: '⚙️',
      icon: '🔐', title: 'Segurança do Painel Admin',
      content: 'Altere a senha padrão "admin123" imediatamente! A senha fica em "Loja → Segurança". O sistema bloqueia o acesso por 15 minutos após 5 tentativas erradas. A sessão admin expira em 4 horas automaticamente.',
      tip: 'Use uma senha com letras, números e símbolos. Nunca compartilhe sua senha com funcionários não autorizados.',
      visual: 'security',
    },
    {
      group: 'menu', groupLabel: 'Cardápio', groupIcon: '🍽️',
      icon: '🏷️', title: 'Criando Categorias',
      content: 'Antes dos produtos, crie as categorias em "Categorias". Cada categoria tem um nome e um emoji que aparece no menu de navegação.',
      tip: 'Crie categorias por tipo: Burgers, Bebidas, Combos, Sobremesas, Acompanhamentos. Ative/desative categorias sem excluí-las.',
      visual: 'categories',
    },
    {
      group: 'menu', groupLabel: 'Cardápio', groupIcon: '🍽️',
      icon: '🛍️', title: 'Adicionando Produtos',
      content: 'Em "Produtos", clique em "+ Novo Produto". Preencha: Nome, Descrição, Preço normal e (opcional) Preço Promocional via promoção vinculada.',
      tip: 'Marque "Destaque ⭐" para que o produto apareça primeiro. Desmarque "Disponível" para ocultar temporariamente sem excluir.',
      visual: 'products',
    },
    {
      group: 'menu', groupLabel: 'Cardápio', groupIcon: '🍽️',
      icon: '🧩', title: 'Grupos de Complementos',
      content: 'Complementos são opções extras de um produto. Para cada grupo defina: Nome, Tipo (escolha única = radio / múltipla = checkbox), Máximo de seleções e se é Obrigatório.',
      tip: 'Grupos obrigatórios impedem o cliente de adicionar ao carrinho sem escolher. Use para "Ponto da carne" ou "Sabor do suco".',
      visual: 'complements',
    },
    {
      group: 'menu', groupLabel: 'Cardápio', groupIcon: '🍽️',
      icon: '➕', title: 'Opções dentro dos Complementos',
      content: 'Dentro de cada grupo, adicione as opções com nome e preço adicional. Opções gratuitas ficam com preço 0.',
      tip: 'O preço dos complementos selecionados é somado automaticamente ao valor do produto no carrinho e no pedido enviado via WhatsApp.',
      visual: 'options',
    },
    {
      group: 'promos', groupLabel: 'Promoções', groupIcon: '🔥',
      icon: '💸', title: 'Desconto Automático (%)',
      content: 'Crie promoções de percentual que se aplicam automaticamente no checkout. Defina: Nome, valor percentual e pedido mínimo (0 = sem mínimo).',
      tip: 'Promoções automáticas aparecem no banner de destaque no topo do cardápio.',
      visual: 'discount_pct',
    },
    {
      group: 'promos', groupLabel: 'Promoções', groupIcon: '🔥',
      icon: '🛵', title: 'Frete Grátis',
      content: 'Crie uma promoção do tipo "Frete Grátis" com um valor de pedido mínimo. A taxa de entrega é automaticamente zerada quando a condição é atingida.',
      tip: 'Frete grátis com pedido mínimo incentiva clientes a adicionarem mais itens — aumenta seu ticket médio.',
      visual: 'free_delivery',
    },
    {
      group: 'promos', groupLabel: 'Promoções', groupIcon: '🔥',
      icon: '🎟️', title: 'Cupons de Desconto',
      content: 'Crie cupons com código personalizado (ex: PRIMEIRACOMPRA). O cliente digita o código no carrinho antes de finalizar.',
      tip: 'Use cupons em campanhas de marketing ou para clientes VIP. Desative um cupom a qualquer momento sem precisar apagá-lo.',
      visual: 'coupon',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '📲', title: 'Como o Cliente Faz o Pedido',
      content: 'O cliente escolhe produtos, configura complementos, preenche nome, WhatsApp e endereço, escolhe a forma de pagamento e clica em "Enviar via WhatsApp".',
      tip: 'O pagamento PIX exibe um QR Code automático com chave e valor. O cliente confirma o pagamento antes de enviar.',
      visual: 'customer_order',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '⚙️', title: 'Gestor de Pedidos — Fila',
      content: 'Na aba "Gestor de Pedidos", a view "Fila" exibe todos os pedidos com status colorido, tempo decorrido e botão de avanço rápido.',
      tip: 'Use os filtros de status para ver apenas pedidos em preparação, a caminho, etc.',
      visual: 'queue',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '🗂️', title: 'Gestor de Pedidos — Kanban',
      content: 'A view "Kanban" exibe colunas por status com todos os pedidos do dia. Ideal para uma visão panorâmica da operação.',
      tip: 'O Kanban atualiza a cada 8 segundos e emite um som de alerta quando um novo pedido chega.',
      visual: 'kanban',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '🔄', title: 'Atualizando o Status do Pedido',
      content: 'No detalhe do pedido: clique "→ Avançar" para ir ao próximo status, ou clique diretamente em qualquer status para definir manualmente.',
      tip: 'Fluxo delivery: Pago → Preparando → Saiu p/ Entrega → Entregue. Retirada: Pago → Preparando → Pronto p/ Retirada → Entregue.',
      visual: 'status',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '✏️', title: 'Editando Itens do Pedido',
      content: 'No detalhe do pedido, clique em "✏️ Editar" para ajustar quantidades, remover itens ou aplicar desconto manual adicional.',
      tip: 'Toda edição gera um evento na timeline — rastreabilidade completa para fins contábeis.',
      visual: 'edit_order',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '💬', title: 'Notificando o Cliente',
      content: 'No detalhe do pedido, clique em "Notificar via WhatsApp" para enviar uma mensagem automática ao cliente com o status atual.',
      tip: 'Manter o cliente informado reduz drasticamente as mensagens do tipo "cadê meu pedido?".',
      visual: 'notify',
    },
    {
      group: 'orders', groupLabel: 'Pedidos', groupIcon: '📦',
      icon: '📍', title: 'Rastreamento pelo Cliente',
      content: 'O cliente acompanha o pedido pelo ícone de clipboard no header do cardápio. Ele vê a timeline completa de status e pode falar com a loja via WhatsApp.',
      tip: 'Pedidos recentes aparecem automaticamente. O cliente não precisa criar conta nem fazer login.',
      visual: 'tracking',
    },
    {
      group: 'reports', groupLabel: 'Relatórios', groupIcon: '📊',
      icon: '📊', title: 'Dashboard de Relatórios',
      content: 'Na aba "Relatórios" veja em tempo real: pedidos do dia, faturamento, ticket médio, total geral e distribuição por forma de pagamento.',
      tip: 'Os relatórios são calculados automaticamente a partir do histórico. Nenhum lançamento manual necessário.',
      visual: 'reports',
    },
    {
      group: 'reports', groupLabel: 'Relatórios', groupIcon: '📊',
      icon: '📤', title: 'Exportando Relatórios',
      content: 'Exporte em 4 formatos: Excel (7 planilhas), CSV (compatível com qualquer planilha), JSON (backup completo) e Imprimir/PDF via navegador.',
      tip: 'O Excel inclui UUID único e hash de integridade em cada pedido, permitindo auditar se algum registro foi alterado.',
      visual: 'export',
    },
    {
      group: 'reports', groupLabel: 'Relatórios', groupIcon: '📊',
      icon: '🔒', title: 'Fechamento Contábil do Dia',
      content: 'Ao fim do dia, clique em "Registrar Fechamento do Dia" para criar um registro imutável no log de auditoria.',
      tip: 'O log usa hash encadeado: cada entrada depende da anterior, tornando impossível falsificar um registro sem invalidar os demais.',
      visual: 'closing',
    },
  ],

  config: {
    restaurantName: 'Hamburgueria do Vale',
    city:           'Arapiraca, AL',
    whatsapp:       '5582999999999',
    pixKey:         'contato@hamburgeriavale.com.br',
    deliveryFee:    6.00,
    minOrder:       25.00,
    deliveryTime:   '30-45 min',
    isOpen:         true,
    adminPass:      'admin123',
  },

  /* ── CATEGORIES (seed) ── */
  categories: [
    { id: 'burgers',         name: 'Burgers',        icon: '🍔', active: true },
    { id: 'bebidas',         name: 'Bebidas',         icon: '🥤', active: true },
    { id: 'combos',          name: 'Combos',          icon: '🎁', active: true },
    { id: 'sobremesas',      name: 'Sobremesas',      icon: '🍩', active: true },
    { id: 'acompanhamentos', name: 'Acompanhamentos', icon: '🍟', active: true },
  ],

  /* ── ITEMS (seed) ── */
  items: [
    {
      id: 1, name: 'X-Arapiraca Master', category: 'burgers',
      price: 28.50, promoPrice: null, promoId: null,
      desc:  'Pão brioche artesanal, carne de sol desfiada 180g, queijo coalho grelhado, mel de engenho e cebola crispy.',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
      available: true, featured: true,
      complements: [
        { id: 'grp-point', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'pt-mal', name: 'Mal passado', price: 0 },
            { id: 'pt-med', name: 'Ao ponto',    price: 0 },
            { id: 'pt-bem', name: 'Bem passado', price: 0 },
          ] },
        { id: 'grp-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 4,
          options: [
            { id: 'ad-bacon',  name: 'Bacon artesanal', price: 4.00 },
            { id: 'ad-ovo',    name: 'Ovo frito',       price: 2.50 },
            { id: 'ad-queijo', name: 'Queijo extra',    price: 2.50 },
            { id: 'ad-catup',  name: 'Cheddar cremoso', price: 3.00 },
          ] },
      ],
    },
    {
      // FIX: item com promoPrice agora tem promoId vinculado à promoção id:4 (seed).
      // Anteriormente promoPrice=19.90 sem promoId causava desconto financeiramente
      // correto, mas sem rastreabilidade de qual promoção gerou o desconto nos relatórios.
      id: 2, name: 'Classic Smash Burger', category: 'burgers',
      price: 24.00, promoPrice: 19.90, promoId: 4,
      desc:  'Dois smash patties 80g, queijo americano, picles, molho especial da casa e alface americana.',
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-smash-pt', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'sp-mal', name: 'Mal passado', price: 0 },
            { id: 'sp-med', name: 'Ao ponto',    price: 0 },
            { id: 'sp-bem', name: 'Bem passado', price: 0 },
          ] },
        { id: 'grp-smash-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
          options: [
            { id: 'sa-bacon', name: 'Bacon extra', price: 4.00 },
            { id: 'sa-ovo',   name: 'Ovo frito',   price: 2.50 },
            { id: 'sa-jal',   name: 'Jalapeño',    price: 1.50 },
          ] },
      ],
    },
    {
      id: 3, name: 'BBQ Bacon Supremo', category: 'burgers',
      price: 32.00, promoPrice: null, promoId: null,
      desc:  'Pão brioche preto, blend 200g, bacon crocante artesanal, queijo cheddar, molho bbq defumado e jalapeños.',
      image: 'https://images.unsplash.com/photo-1596956470007-2bf6095e7e16?w=500',
      available: true, featured: true,
      complements: [
        { id: 'grp-bbq-pt', name: 'Ponto da Carne', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'bp-mal', name: 'Mal passado', price: 0 },
            { id: 'bp-med', name: 'Ao ponto',    price: 0 },
            { id: 'bp-bem', name: 'Bem passado', price: 0 },
          ] },
        { id: 'grp-bbq-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
          options: [
            { id: 'ba-ovo',   name: 'Ovo caipira',    price: 3.00 },
            { id: 'ba-bacon', name: 'Bacon extra',     price: 4.00 },
            { id: 'ba-pica',  name: 'Molho extra BBQ', price: 1.50 },
          ] },
      ],
    },
    {
      id: 4, name: 'Veggie Especial', category: 'burgers',
      price: 22.00, promoPrice: null, promoId: null,
      desc:  'Hambúrguer de grão-de-bico e beterraba, queijo prato derretido, rúcula, tomate confit e maionese de ervas.',
      image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-veg-add', name: 'Adicionais', type: 'multiple', required: false, min: 0, max: 3,
          options: [
            { id: 'va-abac', name: 'Abacate',          price: 3.00 },
            { id: 'va-houm', name: 'Homus extra',       price: 2.00 },
            { id: 'va-tom',  name: 'Tomate seco extra', price: 1.50 },
          ] },
      ],
    },
    {
      id: 5, name: 'Refrigerante Lata', category: 'bebidas',
      price: 5.50, promoPrice: null, promoId: null,
      desc:  'Coca-Cola, Guaraná Antártica, Sprite ou Fanta. 350ml gelado.',
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-ref-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'rs-coca', name: 'Coca-Cola',         price: 0 },
            { id: 'rs-gua',  name: 'Guaraná Antártica', price: 0 },
            { id: 'rs-spr',  name: 'Sprite',            price: 0 },
            { id: 'rs-fan',  name: 'Fanta Laranja',     price: 0 },
          ] },
      ],
    },
    {
      id: 6, name: 'Suco Natural 500ml', category: 'bebidas',
      price: 9.00, promoPrice: null, promoId: null,
      desc:  'Caju, acerola, maracujá ou laranja. Fresquinho e sem conservantes.',
      image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-suco-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'ss-caju',  name: 'Caju',     price: 0 },
            { id: 'ss-acer',  name: 'Acerola',  price: 0 },
            { id: 'ss-mara',  name: 'Maracujá', price: 0 },
            { id: 'ss-laran', name: 'Laranja',  price: 0 },
          ] },
        { id: 'grp-suco-add', name: 'Opções', type: 'multiple', required: false, min: 0, max: 2,
          options: [
            { id: 'soac-mel',  name: 'Com mel',      price: 1.00 },
            { id: 'soac-gen',  name: 'Com gengibre', price: 1.00 },
            { id: 'soac-chia', name: 'Com chia',     price: 2.00 },
          ] },
      ],
    },
    {
      id: 7, name: 'Milkshake Premium', category: 'bebidas',
      price: 16.00, promoPrice: null, promoId: null,
      desc:  'Morango, Oreo, Nutella ou Doce de leite. Feito na hora com sorvete artesanal.',
      image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500',
      available: true, featured: true,
      complements: [
        { id: 'grp-milk-sabor', name: 'Sabor', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'ms-mor',  name: 'Morango',       price: 0    },
            { id: 'ms-oreo', name: 'Oreo',          price: 0    },
            { id: 'ms-nut',  name: 'Nutella',       price: 2.00 },
            { id: 'ms-ddl',  name: 'Doce de leite', price: 0    },
          ] },
        { id: 'grp-milk-add', name: 'Cobertura extra', type: 'multiple', required: false, min: 0, max: 2,
          options: [
            { id: 'ma-choc', name: 'Calda de chocolate', price: 2.00 },
            { id: 'ma-gran', name: 'Granulado colorido',  price: 1.00 },
            { id: 'ma-cho2', name: 'Chantilly',           price: 2.00 },
          ] },
      ],
    },
    {
      id: 8, name: 'Combo Casal', category: 'combos',
      price: 55.00, promoPrice: 49.90, promoId: 5,
      desc:  '2 Burgers à escolha + Batata GG crocante + Refri 1L. Serve 2 pessoas.',
      image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500',
      available: true, featured: true,
      complements: [
        { id: 'grp-cc-burger1', name: '1º Burger', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'cb1-x',     name: 'X-Arapiraca Master', price: 0 },
            { id: 'cb1-smash', name: 'Classic Smash',       price: 0 },
            { id: 'cb1-bbq',   name: 'BBQ Bacon Supremo',   price: 0 },
          ] },
        { id: 'grp-cc-burger2', name: '2º Burger', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'cb2-x',     name: 'X-Arapiraca Master', price: 0 },
            { id: 'cb2-smash', name: 'Classic Smash',       price: 0 },
            { id: 'cb2-bbq',   name: 'BBQ Bacon Supremo',   price: 0 },
          ] },
        { id: 'grp-cc-refri', name: 'Refrigerante 1L', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'cr-coca', name: 'Coca-Cola 1L',         price: 0 },
            { id: 'cr-gua',  name: 'Guaraná Antártica 1L', price: 0 },
          ] },
      ],
    },
    {
      id: 9, name: 'Combo Individual', category: 'combos',
      price: 35.00, promoPrice: null, promoId: null,
      desc:  '1 Burger à escolha + Batata M crocante + Refri 350ml.',
      image: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-ci-burger', name: 'Escolha o Burger', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'cib-x',     name: 'X-Arapiraca Master', price: 0    },
            { id: 'cib-smash', name: 'Classic Smash',       price: 0    },
            { id: 'cib-bbq',   name: 'BBQ Bacon Supremo',   price: 4.00 },
            { id: 'cib-veg',   name: 'Veggie Especial',     price: 0    },
          ] },
        { id: 'grp-ci-refri', name: 'Refrigerante', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'cir-coca', name: 'Coca-Cola',         price: 0 },
            { id: 'cir-gua',  name: 'Guaraná Antártica', price: 0 },
            { id: 'cir-spr',  name: 'Sprite',            price: 0 },
          ] },
      ],
    },
    {
      id: 10, name: 'Batata Frita G', category: 'acompanhamentos',
      price: 14.00, promoPrice: null, promoId: null,
      desc:  'Batata corte palito frita na hora. Temperada com sal defumado e alecrim. Serve 1-2 pessoas.',
      image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-bat-molho', name: 'Molho para mergulhar', type: 'multiple', required: false, min: 0, max: 2,
          options: [
            { id: 'bm-mayo',  name: 'Maionese da casa',  price: 1.50 },
            { id: 'bm-ranch', name: 'Ranch especial',    price: 2.00 },
            { id: 'bm-bbq',   name: 'Molho BBQ',         price: 2.00 },
            { id: 'bm-ketch', name: 'Ketchup artesanal', price: 1.50 },
          ] },
      ],
    },
    {
      id: 11, name: 'Onion Rings', category: 'acompanhamentos',
      price: 16.00, promoPrice: null, promoId: null,
      desc:  'Anéis de cebola empanados no panko com molho ranch especial da casa.',
      image: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500',
      available: true, featured: false,
      complements: [],
    },
    {
      id: 12, name: 'Brownie com Sorvete', category: 'sobremesas',
      price: 18.00, promoPrice: null, promoId: null,
      desc:  'Brownie de chocolate belga quentinho, sorvete de creme, calda de chocolate e granulado.',
      image: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=500',
      available: true, featured: false,
      complements: [
        { id: 'grp-brow-sorvete', name: 'Sabor do Sorvete', type: 'single', required: true, min: 1, max: 1,
          options: [
            { id: 'bs-creme',   name: 'Creme',     price: 0 },
            { id: 'bs-choc',    name: 'Chocolate', price: 0 },
            { id: 'bs-morango', name: 'Morango',   price: 0 },
          ] },
        { id: 'grp-brow-add', name: 'Coberturas extras', type: 'multiple', required: false, min: 0, max: 2,
          options: [
            { id: 'ba-choc2', name: 'Calda extra',   price: 2.00 },
            { id: 'ba-cho3',  name: 'Chantilly',     price: 2.00 },
            { id: 'ba-nozes', name: 'Nozes picadas', price: 3.00 },
          ] },
      ],
    },
  ],

  /* ── PROMOTIONS (seed) ── */
  promotions: [
    {
      id: 1, name: 'Happy Hour', type: 'percentage', scope: 'cart',
      value: 15, minOrder: 0, expiresAt: '', active: true,
    },
    {
      id: 2, name: 'Primeira Compra', type: 'coupon', scope: 'cart',
      value: 10, code: 'PRIMEIRACOMPRA', minOrder: 30, expiresAt: '', active: true,
    },
    {
      id: 3, name: 'Frete Grátis Fim de Semana', type: 'freeDelivery', scope: 'cart',
      value: 0, minOrder: 40, expiresAt: '', active: false,
    },
    // FIX: promoção de item adicionada para corresponder ao promoId:4 do Classic Smash Burger (id:2).
    // Sem esta entrada, o relatório de itens detalhados não conseguia resolver o nome/tipo da promoção.
    {
      id: 4, name: 'Smash Especial', type: 'fixed', scope: 'item',
      value: 4.10, minOrder: 0, expiresAt: '', active: true,
    },
    // FIX: promoção de item para o Combo Casal (id:8, promoId:5).
    {
      id: 5, name: 'Combo Casal Promo', type: 'fixed', scope: 'item',
      value: 5.10, minOrder: 0, expiresAt: '', active: true,
    },
  ],
};