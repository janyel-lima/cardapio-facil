/**
 * scripts/seed-emulator.js
 *
 * Popula o Firebase Emulator com uma loja de demonstração mínima —
 * um exemplo de cada entidade possível no sistema.
 *
 * USO:
 *   node scripts/seed-emulator.js
 *
 * PRÉ-REQUISITOS:
 *   firebase emulators:start   (rodando em paralelo)
 *   npm install firebase-admin (uma vez)
 *
 * O script é IDEMPOTENTE: apaga tudo antes de recriar.
 * Nunca rode contra o projeto de produção.
 */

'use strict';

const admin = require('firebase-admin');

// ── Conecta ao emulador ────────────────────────────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

admin.initializeApp({ projectId: 'cardapio-digital-pro-c1cd7' });

const db = admin.firestore();
const auth = admin.auth();

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (icon, msg) => console.log(`${icon}  ${msg}`);
const id = () => Math.floor(Date.now() * Math.random()).toString(36);

async function clearCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) return;
  const CHUNK = 450;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

async function upsertUser(email, password, displayName, role) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, displayName });
    log('🔄', `Usuário atualizado: ${email}`);
  } catch {
    user = await auth.createUser({ email, password, displayName, emailVerified: true });
    log('✅', `Usuário criado: ${email}`);
  }
  await auth.setCustomUserClaims(user.uid, { role });
  log('🔑', `  → role="${role}" definida`);
  return user;
}

// ══════════════════════════════════════════════════════════════════════════
// DADOS DA LOJA DE DEMONSTRAÇÃO
// ══════════════════════════════════════════════════════════════════════════

// ── Zonas de entrega ───────────────────────────────────────────────────────
const DELIVERY_ZONES = [
  {
    id: 'zona-centro',
    label: 'Centro',
    maxKm: 3,
    fee: 5.00,
    deliveryTime: '20-30 min',
  },
  {
    id: 'zona-medio',
    label: 'Zona Intermediária',
    maxKm: 7,
    fee: 8.00,
    deliveryTime: '35-50 min',
  },
  {
    id: 'zona-periferia',
    label: 'Periferia',
    maxKm: 12,
    fee: 12.00,
    deliveryTime: '50-70 min',
  },
];

// ── Config ─────────────────────────────────────────────────────────────────
const CONFIG = {
  restaurantName: 'Loja Demo',
  city: 'Arapiraca, AL',
  whatsapp: '5582999999999',
  pixKey: 'demo@lojademo.com.br',

  deliveryFee: 5.00,
  minOrder: 20.00,
  deliveryTime: '30-45 min',

  isOpen: true,
  adminPass: 'admin123',

  deliveryZones: DELIVERY_ZONES,
  deliveryFeeOutOfRange: null,

  storeRua: 'Rua Comendador Leão',
  storeNumero: '198',
  storeComplemento: '',
  storeBairro: 'Centro',
  storeCidade: 'Arapiraca',
  storeUf: 'AL',
  storeCep: '57300-140',
  storeLat: -9.7514,
  storeLng: -36.6605,

  updatedAt: new Date().toISOString(),
};

// ── Categorias ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'pratos', name: 'Pratos', icon: '🍽️', active: true },
  { id: 'bebidas', name: 'Bebidas', icon: '🥤', active: true },
  { id: 'sobremesas', name: 'Sobremesas', icon: '🍰', active: true },
  { id: 'combos', name: 'Combos', icon: '🎁', active: true },
  { id: 'temporarios', name: 'Temporários', icon: '📦', active: false },
];

// ── Promoções ──────────────────────────────────────────────────────────────
const PROMOS = [
  {
    id: 'promo-pct',
    name: 'Desconto de 10%',
    type: 'percentage',
    scope: 'cart',
    value: 10,
    code: '',
    minOrder: 30,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-fixed',
    name: 'R$ 5 de desconto',
    type: 'fixed',
    scope: 'cart',
    value: 5,
    code: '',
    minOrder: 50,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-freight',
    name: 'Frete Grátis',
    type: 'freeDelivery',
    scope: 'cart',
    value: 0,
    code: '',
    minOrder: 40,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-coupon-pct',
    name: 'Cupom 15% OFF',
    type: 'coupon',
    scope: 'cart',
    value: 15,
    code: 'DEMO15',
    minOrder: 0,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-coupon-fixed',
    name: 'Cupom R$ 10',
    type: 'coupon',
    scope: 'cart',
    value: 10,
    code: 'DEMO10',
    minOrder: 25,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-item',
    name: 'Oferta do Dia',
    type: 'fixed',
    scope: 'item',
    value: 3,
    code: '',
    minOrder: 0,
    expiresAt: '',
    active: true,
  },
  {
    id: 'promo-inativa',
    name: 'Promoção Inativa',
    type: 'percentage',
    scope: 'cart',
    value: 20,
    code: '',
    minOrder: 0,
    expiresAt: '2024-01-01',
    active: false,
  },
];

// ── Produtos ───────────────────────────────────────────────────────────────
const ITEMS = [

  // A. Simples
  {
    id: 1001,
    name: 'Prato do Dia',
    category: 'pratos',
    price: 22.00,
    promoPrice: null,
    promoId: null,
    desc: 'Prato simples sem opções adicionais. Serve 1 pessoa.',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
    available: true,
    featured: false,
    complements: [],
  },

  // B. Escolha única obrigatória
  {
    id: 1002,
    name: 'Macarrão',
    category: 'pratos',
    price: 28.00,
    promoPrice: null,
    promoId: null,
    desc: 'Massa ao molho à escolha. Ingrediente obrigatório selecionado antes de adicionar ao carrinho.',
    image: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=500',
    available: true,
    featured: false,
    complements: [
      {
        id: 'grp-molho',
        name: 'Molho',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'ml-bolonhesa', name: 'Bolonhesa', price: 0 },
          { id: 'ml-alfredo', name: 'Alfredo', price: 0 },
          { id: 'ml-pesto', name: 'Pesto', price: 2.00 },
        ],
      },
    ],
  },

  // C. Múltiplo opcional
  {
    id: 1003,
    name: 'Salada Montada',
    category: 'pratos',
    price: 18.00,
    promoPrice: null,
    promoId: null,
    desc: 'Base de folhas com até 3 adicionais à escolha. Nenhum obrigatório.',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
    available: true,
    featured: false,
    complements: [
      {
        id: 'grp-adicionais',
        name: 'Adicionais (até 3)',
        type: 'multiple',
        required: false,
        min: 0,
        max: 3,
        options: [
          { id: 'ad-frango', name: 'Frango grelhado', price: 5.00 },
          { id: 'ad-atum', name: 'Atum', price: 4.00 },
          { id: 'ad-queijo', name: 'Queijo prato', price: 3.00 },
          { id: 'ad-tomate', name: 'Tomate seco', price: 2.00 },
          { id: 'ad-crouton', name: 'Crouton', price: 1.50 },
        ],
      },
    ],
  },

  // D. Múltiplos grupos
  {
    id: 1004,
    name: 'Frango Grelhado',
    category: 'pratos',
    price: 32.00,
    promoPrice: null,
    promoId: null,
    desc: 'Frango grelhado com acompanhamento obrigatório e molho opcional.',
    image: 'https://minhasreceitinhas.com.br/wp-content/uploads/2025/03/bife-de-frango-grelhado.jpeg',
    available: true,
    featured: false,
    complements: [
      {
        id: 'grp-acomp',
        name: 'Acompanhamento',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'ac-arroz', name: 'Arroz e feijão', price: 0 },
          { id: 'ac-pure', name: 'Purê de batata', price: 0 },
          { id: 'ac-legumes', name: 'Legumes ao vapor', price: 0 },
        ],
      },
      {
        id: 'grp-molho2',
        name: 'Molho (opcional)',
        type: 'single',
        required: false,
        min: 0,
        max: 1,
        options: [
          { id: 'mo-ervas', name: 'Ervas finas', price: 0 },
          { id: 'mo-alho', name: 'Alho e azeite', price: 0 },
          { id: 'mo-chimichurri', name: 'Chimichurri', price: 2.00 },
        ],
      },
      {
        id: 'grp-extras',
        name: 'Extras',
        type: 'multiple',
        required: false,
        min: 0,
        max: 2,
        options: [
          { id: 'ex-bacon', name: 'Bacon', price: 4.00 },
          { id: 'ex-queijo', name: 'Queijo derretido', price: 3.00 },
        ],
      },
    ],
  },

  // E. Com promoPrice vinculada
  {
    id: 1005,
    name: 'Suco Natural 500ml',
    category: 'bebidas',
    price: 12.00,
    promoPrice: 9.00,
    promoId: 'promo-item',
    desc: 'Suco fresco com desconto de R$ 3,00 via "Oferta do Dia". Sabor obrigatório.',
    image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500',
    available: true,
    featured: true,
    complements: [
      {
        id: 'grp-sabor-suco',
        name: 'Sabor',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'sj-laranja', name: 'Laranja', price: 0 },
          { id: 'sj-maracuja', name: 'Maracujá', price: 0 },
          { id: 'sj-acerola', name: 'Acerola', price: 0 },
        ],
      },
    ],
  },

  // Bebida simples
  {
    id: 1006,
    name: 'Água Mineral',
    category: 'bebidas',
    price: 3.00,
    promoPrice: null,
    promoId: null,
    desc: 'Garrafa 500ml gelada, sem ou com gás.',
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500',
    available: true,
    featured: false,
    complements: [
      {
        id: 'grp-gas',
        name: 'Com gás?',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'gas-nao', name: 'Sem gás', price: 0 },
          { id: 'gas-sim', name: 'Com gás', price: 0 },
        ],
      },
    ],
  },

  // G. Destaque sem promoção
  {
    id: 1007,
    name: 'Bolo de Chocolate',
    category: 'sobremesas',
    price: 14.00,
    promoPrice: null,
    promoId: null,
    desc: 'Fatia generosa de bolo de chocolate com calda quente. Produto em destaque.',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500',
    available: true,
    featured: true,
    complements: [
      {
        id: 'grp-acomp-bolo',
        name: 'Acompanhamento',
        type: 'single',
        required: false,
        min: 0,
        max: 1,
        options: [
          { id: 'ab-sorvete', name: 'Sorvete de creme', price: 5.00 },
          { id: 'ab-chantilly', name: 'Chantilly', price: 3.00 },
        ],
      },
    ],
  },

  // I. Combo
  {
    id: 1008,
    name: 'Combo Individual',
    category: 'combos',
    price: 35.00,
    promoPrice: null,
    promoId: null,
    desc: 'Um prato + uma bebida + uma sobremesa. Escolha um de cada.',
    image: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=500',
    available: true,
    featured: false,
    complements: [
      {
        id: 'grp-combo-prato',
        name: 'Prato',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'cp-frango', name: 'Frango Grelhado', price: 0 },
          { id: 'cp-macarrao', name: 'Macarrão', price: 0 },
          { id: 'cp-salada', name: 'Salada Montada', price: 0 },
        ],
      },
      {
        id: 'grp-combo-bebida',
        name: 'Bebida',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'cb-suco', name: 'Suco Natural', price: 0 },
          { id: 'cb-agua', name: 'Água Mineral', price: 0 },
        ],
      },
      {
        id: 'grp-combo-sobremesa',
        name: 'Sobremesa',
        type: 'single',
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: 'cs-bolo', name: 'Bolo de Chocolate', price: 0 },
        ],
      },
    ],
  },

  // F. Indisponível
  {
    id: 1009,
    name: 'Prato Especial (indisponível)',
    category: 'pratos',
    price: 45.00,
    promoPrice: null,
    promoId: null,
    desc: 'Este produto está temporariamente indisponível. Exibido com visual de esgotado no cardápio.',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
    available: false,
    featured: false,
    complements: [],
  },

  // H. Categoria desativada
  {
    id: 1010,
    name: 'Item Temporário',
    category: 'temporarios',
    price: 10.00,
    promoPrice: null,
    promoId: null,
    desc: 'Pertence à categoria "Temporários" que está desativada — não aparece no cardápio público.',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
    available: true,
    featured: false,
    complements: [],
  },
];

// ── Usuários de demonstração ───────────────────────────────────────────────
const USERS = [
  { email: 'admin@demo.com', password: 'admin123', displayName: 'Admin Demo', role: 'admin' },
  { email: 'worker@demo.com', password: 'worker123', displayName: 'Atendente Demo', role: 'worker' },
  { email: 'cliente@demo.com', password: 'cliente123', displayName: 'Cliente Demo', role: 'client' },
  { email: 'cliente2@demo.com', password: 'cliente223', displayName: 'Cliente Demo 2', role: 'client' }, // ← novo
];

// ══════════════════════════════════════════════════════════════════════════
// EXECUÇÃO
// ══════════════════════════════════════════════════════════════════════════

async function seed() {
  console.log('\n🌱  Cardápio Digital Pro — Seed de Demonstração');
  console.log('═'.repeat(52));

  // 1. Limpa coleções
  log('🗑️ ', 'Limpando coleções...');
  await Promise.all([
    clearCollection('config'),
    clearCollection('categories'),
    clearCollection('items'),
    clearCollection('promotions'),
    clearCollection('auditLog'),
    clearCollection('errorLogs'),
  ]);
  log('✅', 'Coleções limpas.\n');

  // 2. Config
  log('🏪', 'Gravando config da loja...');
  await db.collection('config').doc('main').set(CONFIG);
  await db.collection('meta').doc('orderCounter').set({ counter: 0 }, { merge: true });
  log('✅', `Loja: "${CONFIG.restaurantName}" — ${CONFIG.storeCidade}/${CONFIG.storeUf}`);
  log('📍', `  Coords: ${CONFIG.storeLat}, ${CONFIG.storeLng}`);
  log('🛵', `  ${DELIVERY_ZONES.length} zona(s) de entrega:`);
  DELIVERY_ZONES.forEach(z => {
    log('  ↳', `${z.label.padEnd(22)} até ${String(z.maxKm).padStart(3)} km — R$ ${z.fee.toFixed(2).padStart(5)} — ${z.deliveryTime || '(sem tempo)'}`);
  });
  log('🚫', `  Fora de área: ${CONFIG.deliveryFeeOutOfRange == null ? 'bloqueia pedido' : 'R$ ' + CONFIG.deliveryFeeOutOfRange.toFixed(2)}`);
  log('⏱️ ', `  Tempo padrão (fallback): ${CONFIG.deliveryTime}\n`);

  // 3. Categorias
  log('🏷️ ', 'Gravando categorias...');
  for (const cat of CATEGORIES) {
    await db.collection('categories').doc(cat.id).set(cat);
    log(cat.active ? '✅' : '🔕', `  ${cat.icon} ${cat.name}`);
  }
  console.log();

  // 4. Promoções
  log('🔥', 'Gravando promoções...');
  for (const promo of PROMOS) {
    await db.collection('promotions').doc(String(promo.id)).set(promo);
    const detail = promo.type === 'coupon'
      ? `[CUPOM: ${promo.code}]`
      : promo.type === 'freeDelivery'
        ? '[FRETE GRÁTIS]'
        : promo.scope === 'item'
          ? '[ITEM]'
          : '[CARRINHO]';
    log(promo.active ? '✅' : '🔕', `  ${promo.name} ${detail}`);
  }
  console.log();

  // 5. Produtos
  log('🛍️ ', 'Gravando produtos...');
  for (const item of ITEMS) {
    await db.collection('items').doc(String(item.id)).set(item);
    const flags = [
      item.featured ? '⭐' : '',
      !item.available ? '🔕' : '',
      item.promoId ? '🏷️' : '',
      item.complements.length > 0
        ? `(${item.complements.length} grupo(s))`
        : '',
    ].filter(Boolean).join(' ');
    log('✅', `  [${item.category}] ${item.name} — R$ ${item.price.toFixed(2)} ${flags}`);
  }
  console.log();

  // 6. Usuários
  log('👤', 'Criando usuários...');
  for (const u of USERS) {
    await upsertUser(u.email, u.password, u.displayName, u.role);
  }
  console.log();

  // 7. Sumário
  console.log('═'.repeat(52));
  console.log('🎉  Seed concluído!\n');
  console.log('  Logins disponíveis:');
  USERS.forEach(u => {
    const icon = u.role === 'admin' ? '👑' : u.role === 'worker' ? '🧑‍🍳' : '🛒';
    console.log(`    ${icon}  ${u.email}  /  ${u.password}`);
  });
  console.log('\n  Cupons de teste:');
  PROMOS.filter(p => p.type === 'coupon').forEach(p => {
    console.log(`    🎟️   ${p.code}  — ${p.name}`);
  });
  console.log('\n  Zonas de entrega:');
  DELIVERY_ZONES.forEach(z => {
    console.log(`    🛵  ${z.label} — até ${z.maxKm} km — R$ ${z.fee.toFixed(2)} — ${z.deliveryTime || CONFIG.deliveryTime}`);
  });
  console.log('\n  Emulator UI: http://localhost:4000\n');

  await sleep(500);
  process.exit(0);
}

seed().catch(e => {
  console.error('\n❌  Seed falhou:', e.message);
  process.exit(1);
});