/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/state.js

   SEED DATA REMOVIDA INTENCIONALMENTE.
   Razão: ao iniciar com arrays populados, o Alpine persiste
   o seed no Firebase na primeira mutação (via watcher diff),
   corrompendo uma loja recém-criada com dados de demonstração.

   Fluxo correto:
     1. state.js declara arrays vazios / config em branco
     2. loadAllData() tenta carregar do Firebase
     3. Se Firebase vazio → arrays permanecem []
     4. Snapshots _snapCat/Items/Promos são tirados pós-load
        com [] → nenhum save espúrio é disparado
     5. Admin configura a loja pelo painel → watchers detectam
        diff real → Firebase é gravado pela primeira vez

   Para testar com dados de exemplo, use:
     node scripts/seed-emulator.js   (apenas no emulador local)
═══════════════════════════════════════════════════════ */

const appState = {

  // ── UI ─────────────────────────────────────────────────────────────────────
  darkMode: false, showSearch: false, searchQuery: '', activeTab: null,
  showCart: false, showProductModal: false, showThemePicker: false, showProductForm: false,
  showPixModal: false, showTutorial: false, tutorialStep: 0, dbReady: false,

  selectedPromoFilter: null,
  viewMode:            'grid',
  loginEmail:          '',
  showClientLogin:     false,

  // ── Perfil / Login ─────────────────────────────────────────────────────────
  showUserProfile:     false,
  userProfileTab:      'profile',   // 'profile' | 'orders' | 'account'
  loginNudgeDismissed: false,
  showLoginNudge:      false,

  userProfile: {
    displayName: '',
    phone:       '',
  },

  // ── PIX ────────────────────────────────────────────────────────────────────
  pixStatus: 'pending', pixCopied: false, pixCountdown: 300, _pixTimer: null,

  // ── Modal de produto ───────────────────────────────────────────────────────
  selectedProduct: null, modalQty: 1, modalNote: '', modalSelectedComplements: {},

  // ── Carrinho ───────────────────────────────────────────────────────────────
  cart:          [],
  checkout:      { name: '', phone: '', address: '', complement: '', deliveryType: 'delivery', payment: 'pix' },
  couponInput:   '',
  appliedCoupon: null,

  // ── Admin ──────────────────────────────────────────────────────────────────
  isAdmin:  false,
  adminTab: 'store',

  get adminTabs() {
    const all = [
      { id: 'store',         icon: '🏪', name: 'Loja'       },
      { id: 'categories',    icon: '🏷️', name: 'Categorias' },
      { id: 'products',      icon: '🛍️', name: 'Produtos'   },
      { id: 'promos',        icon: '🔥', name: 'Promoções'  },
      { id: 'order-manager', icon: '⚙️', name: 'Pedidos'    },
      { id: 'orders',        icon: '📋', name: 'Histórico'  },
      { id: 'reports',       icon: '📊', name: 'Relatórios' },
      { id: 'syslogs',       icon: '🪲', name: 'Logs'       },
    ];

    if (this.isCloudAdmin)  return all;
    if (this.isCloudWorker) return all.filter(t => ['order-manager', 'orders'].includes(t.id));
    return [];
  },

  // ── Formulários de edição ──────────────────────────────────────────────────
  editingProduct: {},
  newGroup:       { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] },
  newGroupOption: { name: '', price: 0 },
  newCategory:    { name: '', icon: '' },
  newPromo:       { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' },

  // ── Dados reativos — NUNCA reatribuir a referência, sempre usar splice/push ─
  // Declarados como arrays vazios para que loadAllData() controle o primeiro
  // populate; watchers medem diff pós-load → nenhum save espúrio no boot.
  orderHistory: [],
  orderCounter: 0,
  auditLog:     [],

  // ── Sys Logs ───────────────────────────────────────────────────────────────
  errorLogs:         [],
  logFilter:         'all',
  logSearch:         '',
  logDetailId:       null,
  logClearConfirm:   false,
  _logSessionErrors: 0,

  // ── Toast ──────────────────────────────────────────────────────────────────
  toast: { visible: false, message: '', type: 'success', icon: '✓' },
  _toastTimer: null,

  // ── Tema ───────────────────────────────────────────────────────────────────
  currentTheme: { id: 'red', name: 'Vermelho', accent: '#ef4444' },
  customAccent: '#ef4444',
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

  // ── Config da loja — valores em branco para loja nova ─────────────────────
  //
  // loadAllData() sobrescreve com o que vier do Firebase.
  // Se Firebase vazio (primeira vez), o admin preenche pelo painel
  // e saveConfig() grava no Firebase — sem dados fictícios persistidos.
  config: {
    restaurantName: '',
    city:           '',
    whatsapp:       '',
    pixKey:         '',
    deliveryFee:    0,
    minOrder:       0,
    deliveryTime:   '',
    isOpen:         false,   // começa fechada até o admin configurar e abrir
    adminPass:      'admin123',
  },

  // ── Dados do cardápio — vazios para loja nova ──────────────────────────────
  //
  // Preenchidos exclusivamente via painel admin ou loadAllData() (Firebase).
  // Para popular com dados de demonstração no emulador:
  //   node scripts/seed-emulator.js
  categories: [],
  items:       [],
  promotions:  [],

  // ── Getters de perfil / auth ───────────────────────────────────────────────
  get myOrders() {
    if (!this.isCloudAuthenticated) return [];
    return (this.orderHistory || [])
      .filter(o => o.ownerId === this.cloudUser?.userId || o.clientEmail === this.cloudUser?.email)
      .slice()
      .reverse();
  },

  get userAvatarInitial() {
    const name = this.userProfile.displayName || this.cloudUser?.email || '?';
    return name.charAt(0).toUpperCase();
  },

  get userRoleLabel() {
    if (this.isCloudAdmin)  return { text: 'Admin',     color: '#ef4444', bg: 'rgba(239,68,68,.12)'  };
    if (this.isCloudWorker) return { text: 'Atendente', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' };
    if (this.isCloudClient) return { text: 'Cliente',   color: '#3b82f6', bg: 'rgba(59,130,246,.12)' };
    return null;
  },

  // ── Tutorial ───────────────────────────────────────────────────────────────
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
      tip: 'O Kanban atualiza em tempo real via Firestore onSnapshot e emite um som de alerta quando um novo pedido chega.',
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

  // ── Helpers de perfil / checkout ───────────────────────────────────────────
  _loadUserProfile() {
    const uid = this.cloudUser?.userId;
    if (!uid) return;
    try {
      const saved = localStorage.getItem(`userProfile:${uid}`);
      if (saved) Object.assign(this.userProfile, JSON.parse(saved));
    } catch { /* JSON inválido — ignora */ }
  },

  _saveUserProfile() {
    const uid = this.cloudUser?.userId;
    if (!uid) return;
    try {
      localStorage.setItem(`userProfile:${uid}`, JSON.stringify(this.userProfile));
    } catch { /* quota excedida — ignora */ }
  },

  prefillCheckoutFromUser() {
    const u  = this.cloudUser   || this.currentUser  || this.authUser || null;
    const fb = (typeof firebase !== 'undefined' && typeof firebase.auth === 'function')
      ? firebase.auth().currentUser : null;
    const prof = this.userProfile || null;

    const nameEmpty = !this.checkout.name?.trim();
    if (nameEmpty) {
      const name = u?.name || u?.displayName || fb?.displayName || prof?.name || '';
      if (name.trim()) {
        this.checkout.name           = name.trim();
        this.checkout._namePrefilled = true;
      }
    }

    const phoneEmpty = !this.checkout.phone?.trim();
    if (phoneEmpty) {
      const phone = u?.phone || u?.phoneNumber || u?.whatsapp ||
                    fb?.phoneNumber || prof?.phone || prof?.phoneNumber || '';
      if (phone.trim()) {
        this.checkout.phone           = phone.trim();
        this.checkout._phonePrefilled = true;
      }
    }
  },
};