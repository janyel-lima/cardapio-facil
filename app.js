/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — app.js
   Alpine.js application logic
═══════════════════════════════════════════════════════ */

function menuApp() {
  return {

    /* ══════════════════════════════════════════
       STATE
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

    // PIX payment state
    pixStatus: 'pending', // pending | confirmed
    pixCopied: false,
    pixCountdown: 300, // 5 min
    _pixTimer: null,

    selectedProduct: null,
    modalQty: 1,
    modalNote: '',

    cart: [],
    checkout: {
      name: '',
      phone: '',
      address: '',
      complement: '',
      deliveryType: 'delivery',
      payment: 'pix',
    },

    couponInput: '',
    appliedCoupon: null,

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

    editingProduct: {},
    newCategory: { name: '', icon: '' },
    newPromo: { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' },

    orderHistory: [],

    toast: { visible: false, message: '', type: 'success', icon: '✓' },
    _toastTimer: null,

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
      { id: 'pix',   name: 'PIX',      icon: '🔑' },
      { id: 'card',  name: 'Cartão',   icon: '💳' },
      { id: 'cash',  name: 'Dinheiro', icon: '💵' },
    ],

    tutorialSteps: [
      {
        icon: '🏪', title: 'Bem-vindo ao Painel Admin!',
        content: 'Este tutorial vai te guiar pelas principais funcionalidades do seu cardápio digital. São apenas 7 passos rápidos.',
        tip: 'Dica: Você pode voltar aqui a qualquer momento clicando no ícone ❓ no menu admin.'
      },
      {
        icon: '⚙️', title: 'Configurações da Loja',
        content: 'Na aba "Loja" você configura: nome do restaurante, número do WhatsApp (formato: 5582999…), chave PIX para pagamentos, taxa de entrega, pedido mínimo e horário de funcionamento.',
        tip: 'Importante: O botão "Loja Aberta/Fechada" controla se novos pedidos podem ser feitos. Desative ao fechar o dia.'
      },
      {
        icon: '🏷️', title: 'Categorias do Cardápio',
        content: 'Crie categorias como Burgers, Bebidas, Combos. Cada categoria tem um emoji que aparece nas abas do cardápio. Você pode ativar ou desativar categorias sem excluí-las.',
        tip: 'Dica: Use emojis relacionados para deixar o cardápio mais visual e atrativo.'
      },
      {
        icon: '🛍️', title: 'Cadastro de Produtos',
        content: 'Adicione produtos com nome, descrição, preço, preço promocional, imagem (URL), categoria e se está disponível ou em destaque. Produtos em "Destaque" aparecem primeiro no cardápio.',
        tip: 'Use serviços gratuitos como Unsplash (unsplash.com) para fotos bonitas dos seus produtos.'
      },
      {
        icon: '🔥', title: 'Promoções e Cupons',
        content: 'Crie promoções automáticas (% ou R$ de desconto, frete grátis) ou cupons de desconto com código. Defina valor mínimo do pedido para a promoção ser aplicada.',
        tip: 'Exemplo: Crie o cupom "BEMVINDO10" com 10% de desconto para novos clientes!'
      },
      {
        icon: '🔑', title: 'Pagamento PIX',
        content: 'Quando o cliente escolhe PIX, um QR Code é gerado automaticamente com sua chave cadastrada. O cliente escaneia, paga e envia o comprovante pelo WhatsApp. Simples e sem taxas!',
        tip: 'Configure sua chave PIX nas configurações da loja. Pode ser CPF, CNPJ, email ou telefone.'
      },
      {
        icon: '📊', title: 'Relatórios e Fechamento',
        content: 'Na aba "Relatórios" você acompanha o desempenho do dia: faturamento, pedidos, ticket médio e produtos mais vendidos. Use o "Fechamento do Dia" para exportar relatórios em Excel, CSV, JSON ou imprimir.',
        tip: 'Faça o fechamento diariamente para manter um histórico organizado do seu negócio!'
      },
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

    /* ── CATEGORIES ── */
    categories: [
      { id: 'burgers',     name: 'Burgers',     icon: '🍔', active: true },
      { id: 'bebidas',     name: 'Bebidas',     icon: '🥤', active: true },
      { id: 'combos',      name: 'Combos',      icon: '🎁', active: true },
      { id: 'sobremesas',  name: 'Sobremesas',  icon: '🍩', active: true },
      { id: 'acompanhamentos', name: 'Acompanhamentos', icon: '🍟', active: true },
    ],

    /* ── ITEMS ── */
    items: [
      {
        id: 1, name: 'X-Arapiraca Master', category: 'burgers',
        price: 28.50, promoPrice: null,
        desc: 'Pão brioche artesanal, carne de sol desfiada 180g, queijo coalho grelhado, mel de engenho e cebola crispy.',
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
        available: true, featured: true
      },
      {
        id: 2, name: 'Classic Smash Burger', category: 'burgers',
        price: 24.00, promoPrice: 19.90,
        desc: 'Dois smash patties 80g, queijo americano, picles, molho especial da casa e alface americana.',
        image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500',
        available: true, featured: false
      },
      {
        id: 3, name: 'BBQ Bacon Supremo', category: 'burgers',
        price: 32.00, promoPrice: null,
        desc: 'Pão brioche preto, blend 200g, bacon crocante artesanal, queijo cheddar, molho bbq defumado e jalapeños.',
        image: 'https://images.unsplash.com/photo-1596956470007-2bf6095e7e16?w=500',
        available: true, featured: true
      },
      {
        id: 4, name: 'Veggie Especial', category: 'burgers',
        price: 22.00, promoPrice: null,
        desc: 'Hambúrguer de grão-de-bico e beterraba, queijo prato derretido, rúcula, tomate confit e maionese de ervas.',
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
        available: true, featured: false
      },
      {
        id: 5, name: 'Refrigerante Lata', category: 'bebidas',
        price: 5.50, promoPrice: null,
        desc: 'Coca-Cola, Guaraná Antártica, Sprite ou Fanta. 350ml gelado.',
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500',
        available: true, featured: false
      },
      {
        id: 6, name: 'Suco Natural 500ml', category: 'bebidas',
        price: 9.00, promoPrice: null,
        desc: 'Caju, acerola, maracujá ou laranja. Fresquinho e sem conservantes.',
        image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500',
        available: true, featured: false
      },
      {
        id: 7, name: 'Milkshake Premium', category: 'bebidas',
        price: 16.00, promoPrice: null,
        desc: 'Morango, Oreo, Nutella ou Doce de leite. Feito na hora com sorvete artesanal.',
        image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500',
        available: true, featured: true
      },
      {
        id: 8, name: 'Combo Casal', category: 'combos',
        price: 55.00, promoPrice: 49.90,
        desc: '2 Burgers à escolha + Batata GG crocante + Refri 1L. Serve 2 pessoas.',
        image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500',
        available: true, featured: true
      },
      {
        id: 9, name: 'Combo Individual', category: 'combos',
        price: 35.00, promoPrice: null,
        desc: '1 Burger à escolha + Batata M crocante + Refri 350ml.',
        image: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=500',
        available: true, featured: false
      },
      {
        id: 10, name: 'Batata Frita G', category: 'acompanhamentos',
        price: 14.00, promoPrice: null,
        desc: 'Batata corte palito frita na hora. Temperada com sal defumado e alecrim. Serve 1-2 pessoas.',
        image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500',
        available: true, featured: false
      },
      {
        id: 11, name: 'Onion Rings', category: 'acompanhamentos',
        price: 16.00, promoPrice: null,
        desc: 'Anéis de cebola empanados no panko com molho ranch especial da casa.',
        image: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500',
        available: true, featured: false
      },
      {
        id: 12, name: 'Brownie com Sorvete', category: 'sobremesas',
        price: 18.00, promoPrice: null,
        desc: 'Brownie de chocolate belga quentinho, sorvete de creme, calda de chocolate e granulado.',
        image: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=500',
        available: true, featured: false
      },
    ],

    /* ── PROMOTIONS ── */
    promotions: [
      {
        id: 1, name: 'Happy Hour',
        type: 'percentage', value: 15,
        minOrder: 0, expiresAt: '',
        active: true
      },
      {
        id: 2, name: 'Primeira Compra',
        type: 'coupon', value: 10, code: 'PRIMEIRACOMPRA',
        minOrder: 30, expiresAt: '',
        active: true
      },
      {
        id: 3, name: 'Frete Grátis Fim de Semana',
        type: 'freeDelivery', value: 0,
        minOrder: 40, expiresAt: '',
        active: false
      },
    ],

    /* ══════════════════════════════════════════
       COMPUTED / GETTERS
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
      // Featured items first
      return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    },

    get cartTotalItems() {
      return this.cart.reduce((sum, i) => sum + i.qty, 0);
    },

    get cartSubtotal() {
      return this.cart.reduce((sum, i) => sum + (i.promoPrice || i.price) * i.qty, 0);
    },

    get activePromos() {
      return this.promotions.filter(p => p.active && p.type !== 'coupon');
    },

    get deliveryFee() {
      if (this.checkout.deliveryType === 'pickup') return 0;
      // Check for free delivery promo
      const freeDelivery = this.promotions.find(p =>
        p.active && p.type === 'freeDelivery' && this.cartSubtotal >= (p.minOrder || 0)
      );
      if (freeDelivery) return 0;
      return this.config.deliveryFee;
    },

    get discountValue() {
      let discount = 0;

      // Auto promotions (non-coupon)
      const autoPromos = this.promotions.filter(p =>
        p.active && p.type !== 'coupon' && p.type !== 'freeDelivery' &&
        this.cartSubtotal >= (p.minOrder || 0)
      );

      for (const promo of autoPromos) {
        if (promo.type === 'percentage') {
          discount += this.cartSubtotal * (promo.value / 100);
        } else if (promo.type === 'fixed') {
          discount += promo.value;
        }
      }

      // Applied coupon
      if (this.appliedCoupon) {
        if (this.appliedCoupon.type === 'percentage') {
          discount += this.cartSubtotal * (this.appliedCoupon.value / 100);
        } else if (this.appliedCoupon.type === 'fixed') {
          discount += this.appliedCoupon.value;
        }
      }

      return Math.min(discount, this.cartSubtotal);
    },

    get orderTotal() {
      return Math.max(0, this.cartSubtotal - this.discountValue + this.deliveryFee);
    },

    /* ══════════════════════════════════════════
       METHODS — CART
    ══════════════════════════════════════════ */

    addToCart(item) {
      if (!item.available) return;
      this.addToCartWithDetails(item, 1, '');
    },

    addToCartWithDetails(item, qty, note) {
      if (!item.available) return;
      const existing = this.cart.find(c => c.id === item.id && c.note === (note || ''));
      if (existing) {
        existing.qty += qty;
      } else {
        this.cart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          promoPrice: item.promoPrice,
          image: item.image,
          qty: qty || 1,
          note: note || '',
        });
      }
      this.showToast(`${item.name} adicionado! 🎉`, 'success', '🛒');
    },

    incrementCart(index) {
      this.cart[index].qty++;
    },

    decrementCart(index) {
      if (this.cart[index].qty > 1) {
        this.cart[index].qty--;
      } else {
        this.cart.splice(index, 1);
      }
    },

    /* ══════════════════════════════════════════
       METHODS — PRODUCT MODAL
    ══════════════════════════════════════════ */

    openProductModal(item) {
      this.selectedProduct = item;
      this.modalQty = 1;
      this.modalNote = '';
      this.showProductModal = true;
    },

    /* ══════════════════════════════════════════
       METHODS — COUPON
    ══════════════════════════════════════════ */

    applyCoupon() {
      const code = this.couponInput.trim().toUpperCase();
      if (!code) return;

      const coupon = this.promotions.find(p =>
        p.active && p.type === 'coupon' &&
        p.code && p.code.toUpperCase() === code
      );

      if (!coupon) {
        this.showToast('Cupom inválido ou expirado', 'error', '❌');
        return;
      }

      if (coupon.minOrder > 0 && this.cartSubtotal < coupon.minOrder) {
        this.showToast(`Pedido mínimo de ${this.formatMoney(coupon.minOrder)} para este cupom`, 'error', '⚠️');
        return;
      }

      this.appliedCoupon = coupon;
      this.couponInput = '';
      this.showToast(`Cupom "${code}" aplicado com sucesso!`, 'success', '🎟️');
    },

    /* ══════════════════════════════════════════
       METHODS — WHATSAPP CHECKOUT
    ══════════════════════════════════════════ */

    sendToWhatsApp() {
      if (!this.config.isOpen) {
        this.showToast('Loja fechada no momento. Tente mais tarde!', 'error', '🚫'); return;
      }
      if (!this.checkout.name.trim()) {
        this.showToast('Informe seu nome', 'error', '⚠️'); return;
      }
      if (!this.checkout.phone.trim()) {
        this.showToast('Informe seu WhatsApp', 'error', '⚠️'); return;
      }
      if (this.checkout.deliveryType === 'delivery' && !this.checkout.address.trim()) {
        this.showToast('Informe o endereço de entrega', 'error', '⚠️'); return;
      }
      if (this.cartSubtotal < this.config.minOrder && this.checkout.deliveryType === 'delivery') {
        this.showToast(`Pedido mínimo: ${this.formatMoney(this.config.minOrder)}`, 'error', '⚠️'); return;
      }

      // If PIX, show PIX modal first
      if (this.checkout.payment === 'pix') {
        this.openPixModal();
        return;
      }

      this._finishOrder();
    },

    openPixModal() {
      this.pixStatus = 'pending';
      this.pixCopied = false;
      this.pixCountdown = 300;
      this.showCart = false;
      this.showPixModal = true;

      // Countdown timer
      clearInterval(this._pixTimer);
      this._pixTimer = setInterval(() => {
        this.pixCountdown--;
        if (this.pixCountdown <= 0) {
          clearInterval(this._pixTimer);
          this.pixStatus = 'expired';
        }
      }, 1000);
    },

    confirmPixPayment() {
      clearInterval(this._pixTimer);
      this.pixStatus = 'confirmed';
      setTimeout(() => {
        this.showPixModal = false;
        this._finishOrder();
      }, 1500);
    },

    copyPixKey() {
      navigator.clipboard.writeText(this.config.pixKey).then(() => {
        this.pixCopied = true;
        setTimeout(() => this.pixCopied = false, 3000);
      }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = this.config.pixKey;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.pixCopied = true;
        setTimeout(() => this.pixCopied = false, 3000);
      });
    },

    get pixCountdownFormatted() {
      const m = Math.floor(this.pixCountdown / 60).toString().padStart(2,'0');
      const s = (this.pixCountdown % 60).toString().padStart(2,'0');
      return `${m}:${s}`;
    },

    get pixQrUrl() {
      const data = `PIX|${this.config.pixKey}|${this.orderTotal.toFixed(2)}`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}&margin=10&bgcolor=ffffff`;
    },

    _finishOrder() {
      const paymentNames = { pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };
      const now = new Date().toLocaleString('pt-BR');

      let msg = `🍔 *NOVO PEDIDO — ${this.config.restaurantName.toUpperCase()}*\n`;
      msg += `📅 ${now}\n\n`;
      msg += `👤 *Cliente:* ${this.checkout.name}\n`;
      msg += `📱 *WhatsApp:* ${this.checkout.phone}\n`;

      if (this.checkout.deliveryType === 'delivery') {
        msg += `📍 *Endereço:* ${this.checkout.address}`;
        if (this.checkout.complement) msg += `, ${this.checkout.complement}`;
        msg += '\n';
      } else {
        msg += `🏃 *Retirada no local*\n`;
      }
      msg += '\n';

      msg += `📦 *ITENS DO PEDIDO:*\n`;
      this.cart.forEach(item => {
        const price = item.promoPrice || item.price;
        msg += `• ${item.qty}x ${item.name} — ${this.formatMoney(price * item.qty)}`;
        if (item.note) msg += `\n  📝 _${item.note}_`;
        msg += '\n';
      });

      msg += `\n💰 *RESUMO:*\n`;
      msg += `Subtotal: ${this.formatMoney(this.cartSubtotal)}\n`;
      if (this.discountValue > 0) msg += `Desconto: -${this.formatMoney(this.discountValue)}\n`;
      if (this.checkout.deliveryType === 'delivery') {
        msg += `Taxa entrega: ${this.deliveryFee === 0 ? 'Grátis 🎉' : this.formatMoney(this.deliveryFee)}\n`;
      }
      msg += `*TOTAL: ${this.formatMoney(this.orderTotal)}*\n`;
      msg += `\n💳 *Pagamento:* ${paymentNames[this.checkout.payment]}\n`;

      if (this.checkout.payment === 'pix') {
        msg += `\n✅ *PIX já informado ao cliente via QR Code*\n`;
        msg += `_(Aguardando confirmação do comprovante)_`;
      }

      this.saveOrderToHistory();
      window.open(`https://wa.me/${this.config.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    saveOrderToHistory() {
      const order = {
        id: Date.now(),
        name: this.checkout.name,
        phone: this.checkout.phone,
        address: this.checkout.deliveryType === 'delivery' ? this.checkout.address : 'Retirada',
        complement: this.checkout.complement || '',
        deliveryType: this.checkout.deliveryType,
        payment: this.checkout.payment,
        subtotal: this.cartSubtotal,
        discount: this.discountValue,
        deliveryFee: this.deliveryFee,
        total: this.orderTotal,
        items: this.cart.map(i => ({
          name: i.name,
          qty: i.qty,
          unitPrice: i.promoPrice || i.price,
          total: (i.promoPrice || i.price) * i.qty,
          note: i.note || ''
        })),
        coupon: this.appliedCoupon?.code || '',
        date: new Date().toLocaleDateString('pt-BR'),
        time: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
        timestamp: new Date().toISOString(),
      };
      this.orderHistory.push(order);
      this.saveDailyData();
      try { localStorage.setItem('orderHistory', JSON.stringify(this.orderHistory)); } catch(e) {}

      // Reset cart
      this.cart = [];
      this.checkout = { name:'', phone:'', address:'', complement:'', deliveryType:'delivery', payment:'pix' };
      this.appliedCoupon = null;
      this.showCart = false;
      this.showToast('Pedido enviado com sucesso! 🎉', 'success', '✅');
    },

    /* ══════════════════════════════════════════
       DAILY DATA PERSISTENCE
    ══════════════════════════════════════════ */

    saveDailyData() {
      const today = new Date().toLocaleDateString('pt-BR');
      const todayOrders = this.orderHistory.filter(o => o.date === today);
      const dailyStats = {
        date: today,
        orders: todayOrders.length,
        revenue: todayOrders.reduce((s, o) => s + o.total, 0),
        avgTicket: todayOrders.length > 0 ? todayOrders.reduce((s,o)=>s+o.total,0)/todayOrders.length : 0,
        byPayment: {
          pix:  todayOrders.filter(o => o.payment === 'pix').reduce((s,o)=>s+o.total,0),
          card: todayOrders.filter(o => o.payment === 'card').reduce((s,o)=>s+o.total,0),
          cash: todayOrders.filter(o => o.payment === 'cash').reduce((s,o)=>s+o.total,0),
        },
        topProducts: this.getTopProducts(todayOrders),
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem('dailyStats_' + today.replace(/\//g,'-'), JSON.stringify(dailyStats));
        localStorage.setItem('lastDailyStats', JSON.stringify(dailyStats));
      } catch(e) {}
      return dailyStats;
    },

    getTopProducts(orders) {
      const map = {};
      orders.forEach(o => {
        o.items.forEach(item => {
          if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, total: 0 };
          map[item.name].qty += item.qty;
          map[item.name].total += item.total;
        });
      });
      return Object.values(map).sort((a,b) => b.qty - a.qty).slice(0, 10);
    },

    get todayStats() {
      const today = new Date().toLocaleDateString('pt-BR');
      const todayOrders = this.orderHistory.filter(o => o.date === today);
      return {
        orders: todayOrders.length,
        revenue: todayOrders.reduce((s,o)=>s+o.total,0),
        avgTicket: todayOrders.length > 0 ? todayOrders.reduce((s,o)=>s+o.total,0)/todayOrders.length : 0,
        byPayment: {
          pix:  todayOrders.filter(o=>o.payment==='pix').reduce((s,o)=>s+o.total,0),
          card: todayOrders.filter(o=>o.payment==='card').reduce((s,o)=>s+o.total,0),
          cash: todayOrders.filter(o=>o.payment==='cash').reduce((s,o)=>s+o.total,0),
        },
        topProducts: this.getTopProducts(todayOrders),
        rawOrders: todayOrders,
        date: today,
      };
    },

    get allTimeStats() {
      const total = this.orderHistory.reduce((s,o)=>s+o.total,0);
      const count = this.orderHistory.length;
      // Group by date
      const byDate = {};
      this.orderHistory.forEach(o => {
        if (!byDate[o.date]) byDate[o.date] = { date: o.date, orders: 0, revenue: 0 };
        byDate[o.date].orders++;
        byDate[o.date].revenue += o.total;
      });
      return {
        totalRevenue: total,
        totalOrders: count,
        avgTicket: count > 0 ? total/count : 0,
        byDate: Object.values(byDate).sort((a,b) => new Date(a.date.split('/').reverse().join('-')) - new Date(b.date.split('/').reverse().join('-'))),
        topProducts: this.getTopProducts(this.orderHistory),
      };
    },

    /* ══════════════════════════════════════════
       EXPORT REPORTS
    ══════════════════════════════════════════ */

    exportExcel() {
      if (typeof XLSX === 'undefined') {
        this.showToast('Biblioteca de export não carregada', 'error', '❌');
        return;
      }

      const today = this.todayStats;
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Resumo do Dia ──
      const resumoData = [
        ['RELATÓRIO DE FECHAMENTO DO DIA', '', ''],
        ['Restaurante:', this.config.restaurantName, ''],
        ['Data:', today.date, ''],
        ['Gerado em:', new Date().toLocaleString('pt-BR'), ''],
        ['', '', ''],
        ['INDICADORES DO DIA', '', ''],
        ['Total de Pedidos', today.orders, ''],
        ['Faturamento Bruto', this.formatMoney(today.revenue), ''],
        ['Ticket Médio', this.formatMoney(today.avgTicket), ''],
        ['', '', ''],
        ['FATURAMENTO POR PAGAMENTO', '', ''],
        ['PIX', this.formatMoney(today.byPayment.pix), `${today.revenue > 0 ? ((today.byPayment.pix/today.revenue)*100).toFixed(1) : 0}%`],
        ['Cartão', this.formatMoney(today.byPayment.card), `${today.revenue > 0 ? ((today.byPayment.card/today.revenue)*100).toFixed(1) : 0}%`],
        ['Dinheiro', this.formatMoney(today.byPayment.cash), `${today.revenue > 0 ? ((today.byPayment.cash/today.revenue)*100).toFixed(1) : 0}%`],
      ];
      const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
      wsResumo['!cols'] = [{wch:30},{wch:20},{wch:12}];
      wsResumo['A1'] = { v: 'RELATÓRIO DE FECHAMENTO DO DIA', t: 's', s: { font: { bold: true, sz: 14 }, fill: { fgColor: { rgb: 'EF4444' } } }};
      XLSX.utils.book_append_sheet(wb, wsResumo, '📊 Resumo');

      // ── Sheet 2: Pedidos do Dia ──
      const ordersHeaders = ['#', 'Horário', 'Cliente', 'Telefone', 'Tipo', 'Endereço', 'Pagamento', 'Subtotal', 'Desconto', 'Entrega', 'Total', 'Cupom'];
      const ordersRows = today.rawOrders.map((o, i) => [
        i + 1,
        o.time,
        o.name,
        o.phone,
        o.deliveryType === 'delivery' ? 'Delivery' : 'Retirada',
        o.address + (o.complement ? ', ' + o.complement : ''),
        { pix:'PIX', card:'Cartão', cash:'Dinheiro' }[o.payment] || o.payment,
        o.subtotal,
        o.discount,
        o.deliveryFee,
        o.total,
        o.coupon || '-'
      ]);
      const wsPedidos = XLSX.utils.aoa_to_sheet([ordersHeaders, ...ordersRows]);
      wsPedidos['!cols'] = [{wch:4},{wch:8},{wch:20},{wch:16},{wch:10},{wch:35},{wch:10},{wch:12},{wch:10},{wch:10},{wch:12},{wch:14}];
      XLSX.utils.book_append_sheet(wb, wsPedidos, '🧾 Pedidos do Dia');

      // ── Sheet 3: Itens Vendidos ──
      const itensHeaders = ['Pedido #', 'Horário', 'Cliente', 'Produto', 'Qtd', 'Preço Unit.', 'Total', 'Observação'];
      const itensRows = [];
      today.rawOrders.forEach((o, i) => {
        o.items.forEach(item => {
          itensRows.push([i+1, o.time, o.name, item.name, item.qty, item.unitPrice, item.total, item.note || '']);
        });
      });
      const wsItens = XLSX.utils.aoa_to_sheet([itensHeaders, ...itensRows]);
      wsItens['!cols'] = [{wch:8},{wch:8},{wch:18},{wch:28},{wch:5},{wch:12},{wch:12},{wch:25}];
      XLSX.utils.book_append_sheet(wb, wsItens, '🛍️ Itens Vendidos');

      // ── Sheet 4: Ranking Produtos ──
      const rankHeaders = ['Pos.', 'Produto', 'Qtd Vendida', 'Faturamento', '% do Total'];
      const rankRows = today.topProducts.map((p, i) => [
        i+1, p.name, p.qty,
        p.total,
        today.revenue > 0 ? `${((p.total/today.revenue)*100).toFixed(1)}%` : '0%'
      ]);
      const wsRank = XLSX.utils.aoa_to_sheet([rankHeaders, ...rankRows]);
      wsRank['!cols'] = [{wch:5},{wch:30},{wch:14},{wch:14},{wch:12}];
      XLSX.utils.book_append_sheet(wb, wsRank, '🏆 Ranking Produtos');

      // ── Sheet 5: Histórico Geral ──
      const histHeaders = ['Data', 'Pedidos', 'Faturamento', 'Ticket Médio'];
      const histRows = this.allTimeStats.byDate.map(d => [
        d.date, d.orders, d.revenue, d.orders > 0 ? d.revenue/d.orders : 0
      ]);
      histRows.push(['', '', '', '']);
      histRows.push(['TOTAL GERAL', this.allTimeStats.totalOrders, this.allTimeStats.totalRevenue, this.allTimeStats.avgTicket]);
      const wsHist = XLSX.utils.aoa_to_sheet([histHeaders, ...histRows]);
      wsHist['!cols'] = [{wch:12},{wch:10},{wch:16},{wch:14}];
      XLSX.utils.book_append_sheet(wb, wsHist, '📅 Histórico Geral');

      const filename = `fechamento_${today.date.replace(/\//g,'-')}_${this.config.restaurantName.replace(/\s+/g,'_')}.xlsx`;
      XLSX.writeFile(wb, filename);
      this.showToast('Excel exportado com sucesso!', 'success', '📊');
    },

    exportCSV() {
      const today = this.todayStats;
      const headers = ['Horário','Cliente','Telefone','Tipo','Endereço','Pagamento','Subtotal','Desconto','Entrega','Total','Cupom','Itens'];
      const rows = today.rawOrders.map(o => [
        o.time, o.name, o.phone,
        o.deliveryType === 'delivery' ? 'Delivery' : 'Retirada',
        o.address,
        { pix:'PIX', card:'Cartão', cash:'Dinheiro' }[o.payment],
        o.subtotal.toFixed(2), o.discount.toFixed(2), o.deliveryFee.toFixed(2), o.total.toFixed(2),
        o.coupon || '',
        o.items.map(i => `${i.qty}x ${i.name}`).join(' | ')
      ]);

      const csvContent = [headers, ...rows].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')
      ).join('\n');

      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pedidos_${today.date.replace(/\//g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('CSV exportado!', 'success', '📄');
    },

    exportJSON() {
      const data = {
        exportedAt: new Date().toISOString(),
        restaurant: this.config.restaurantName,
        date: this.todayStats.date,
        summary: {
          orders: this.todayStats.orders,
          revenue: this.todayStats.revenue,
          avgTicket: this.todayStats.avgTicket,
          byPayment: this.todayStats.byPayment,
        },
        topProducts: this.todayStats.topProducts,
        orders: this.todayStats.rawOrders,
        allTimeStats: this.allTimeStats,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${this.todayStats.date.replace(/\//g,'-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('JSON exportado!', 'success', '💾');
    },

    printReport() {
      const today = this.todayStats;
      const rows = today.rawOrders.map((o,i) => `
        <tr>
          <td>${i+1}</td><td>${o.time}</td><td>${o.name}</td>
          <td>${o.deliveryType==='delivery'?'Delivery':'Retirada'}</td>
          <td>{{pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment]||o.payment}</td>
          <td>R$ ${o.total.toFixed(2)}</td>
        </tr>`.replace('{{pix:\'PIX\',card:\'Cartão\',cash:\'Dinheiro\'}[o.payment]||o.payment}',
          {pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment] || o.payment
        )
      ).join('');

      const topRows = today.topProducts.map((p,i) => `
        <tr><td>${i+1}</td><td>${p.name}</td><td>${p.qty}</td><td>R$ ${p.total.toFixed(2)}</td></tr>
      `).join('');

      const html = `<!DOCTYPE html><html lang="pt-br"><head>
        <meta charset="UTF-8"><title>Fechamento ${today.date}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body { font-family: Arial, sans-serif; font-size:12px; color:#1a1a1a; padding:24px; }
          h1 { font-size:20px; margin-bottom:4px; }
          h2 { font-size:14px; margin:16px 0 8px; padding-bottom:4px; border-bottom:2px solid #ef4444; color:#ef4444; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
          .header-right { text-align:right; color:#666; font-size:11px; }
          .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:12px 0; }
          .kpi { background:#f8f8f8; border:1px solid #e5e7eb; border-radius:8px; padding:12px; text-align:center; }
          .kpi-value { font-size:18px; font-weight:bold; color:#ef4444; }
          .kpi-label { font-size:10px; color:#666; margin-top:2px; }
          table { width:100%; border-collapse:collapse; margin-top:8px; }
          th { background:#ef4444; color:white; padding:6px 8px; text-align:left; font-size:11px; }
          td { padding:5px 8px; border-bottom:1px solid #f0f0f0; font-size:11px; }
          tr:nth-child(even) td { background:#fafafa; }
          .payment-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0; }
          .footer { margin-top:24px; text-align:center; font-size:10px; color:#999; border-top:1px solid #e5e7eb; padding-top:12px; }
          @media print { body { padding:0; } }
        </style>
      </head><body>
        <div class="header">
          <div>
            <h1>${this.config.restaurantName}</h1>
            <div style="color:#666;font-size:11px">${this.config.city} • ${this.config.whatsapp}</div>
          </div>
          <div class="header-right">
            <div style="font-size:16px;font-weight:bold">FECHAMENTO DO DIA</div>
            <div>${today.date}</div>
            <div>Gerado: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <h2>📊 Indicadores</h2>
        <div class="kpis">
          <div class="kpi"><div class="kpi-value">${today.orders}</div><div class="kpi-label">Pedidos</div></div>
          <div class="kpi"><div class="kpi-value">R$ ${today.revenue.toFixed(2)}</div><div class="kpi-label">Faturamento</div></div>
          <div class="kpi"><div class="kpi-value">R$ ${today.avgTicket.toFixed(2)}</div><div class="kpi-label">Ticket Médio</div></div>
        </div>

        <h2>💳 Por Forma de Pagamento</h2>
        <div class="payment-row"><span>🔑 PIX</span><span><strong>R$ ${today.byPayment.pix.toFixed(2)}</strong></span></div>
        <div class="payment-row"><span>💳 Cartão</span><span><strong>R$ ${today.byPayment.card.toFixed(2)}</strong></span></div>
        <div class="payment-row"><span>💵 Dinheiro</span><span><strong>R$ ${today.byPayment.cash.toFixed(2)}</strong></span></div>

        <h2>🧾 Pedidos do Dia</h2>
        <table><thead><tr><th>#</th><th>Horário</th><th>Cliente</th><th>Tipo</th><th>Pagamento</th><th>Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#999">Nenhum pedido hoje</td></tr>'}</tbody></table>

        <h2>🏆 Top Produtos</h2>
        <table><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Faturamento</th></tr></thead>
        <tbody>${topRows || '<tr><td colspan="4" style="text-align:center;color:#999">Sem dados</td></tr>'}</tbody></table>

        <div class="footer">Relatório gerado pelo Cardápio Digital Pro • ${new Date().toLocaleString('pt-BR')}</div>
      </body></html>`;

      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
      this.showToast('Abrindo para impressão/PDF!', 'success', '🖨️');
    },

    closeDayReport() {
      if (this.todayStats.orders === 0) {
        this.showToast('Nenhum pedido hoje para fechar', 'error', '⚠️'); return;
      }
      this.saveDailyData();
      this.showToast(`Dia ${this.todayStats.date} fechado! ${this.todayStats.orders} pedido(s) · ${this.formatMoney(this.todayStats.revenue)}`, 'success', '🎊');
    },

    /* ══════════════════════════════════════════
       METHODS — ADMIN
    ══════════════════════════════════════════ */

    loginAdmin() {
      if (this.adminPassword === this.config.adminPass) {
        this.isAdmin = true;
        this.adminError = '';
        this.adminPassword = '';
        this.showAdminLogin = false;
        this.showAdminPanel = true;
      } else {
        this.adminError = 'Senha incorreta. Tente novamente.';
      }
    },

    saveConfig() {
      try { localStorage.setItem('storeConfig', JSON.stringify(this.config)); } catch(e) {}
      this.showToast('Configurações salvas!', 'success', '💾');
    },

    /* ── Categories ── */
    addCategory() {
      if (!this.newCategory.name.trim()) {
        this.showToast('Informe o nome da categoria', 'error', '⚠️'); return;
      }
      this.categories.push({
        id: this.newCategory.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
        name: this.newCategory.name.trim(),
        icon: this.newCategory.icon || '📦',
        active: true,
      });
      this.newCategory = { name: '', icon: '' };
      this.saveData();
      this.showToast('Categoria adicionada!', 'success', '🏷️');
    },

    deleteCategory(index) {
      if (!confirm('Excluir esta categoria? Os produtos não serão deletados.')) return;
      this.categories.splice(index, 1);
      this.saveData();
    },

    getCategoryName(catId) {
      const cat = this.categories.find(c => c.id === catId);
      return cat ? `${cat.icon} ${cat.name}` : catId;
    },

    /* ── Products ── */
    openProductForm(item) {
      if (item) {
        this.editingProduct = { ...item };
      } else {
        this.editingProduct = {
          name: '', desc: '', price: 0, promoPrice: null,
          category: this.categories[0]?.id || '',
          image: '', available: true, featured: false,
        };
      }
      this.showProductForm = true;
    },

    saveProduct() {
      if (!this.editingProduct.name.trim()) {
        this.showToast('Informe o nome do produto', 'error', '⚠️'); return;
      }
      if (!this.editingProduct.price || this.editingProduct.price <= 0) {
        this.showToast('Informe um preço válido', 'error', '⚠️'); return;
      }

      // Clean up promoPrice if empty
      if (!this.editingProduct.promoPrice || this.editingProduct.promoPrice <= 0) {
        this.editingProduct.promoPrice = null;
      }

      if (this.editingProduct.id) {
        const idx = this.items.findIndex(i => i.id === this.editingProduct.id);
        if (idx !== -1) this.items.splice(idx, 1, { ...this.editingProduct });
        this.showToast('Produto atualizado!', 'success', '✏️');
      } else {
        this.editingProduct.id = Date.now();
        this.items.push({ ...this.editingProduct });
        this.showToast('Produto adicionado!', 'success', '➕');
      }

      this.saveData();
      this.showProductForm = false;
    },

    deleteProduct(index) {
      if (!confirm('Excluir este produto definitivamente?')) return;
      this.items.splice(index, 1);
      this.saveData();
      this.showToast('Produto removido', 'success', '🗑️');
    },

    /* ── Promotions ── */
    addPromo() {
      if (!this.newPromo.name.trim()) {
        this.showToast('Informe o nome da promoção', 'error', '⚠️'); return;
      }
      if (this.newPromo.type === 'coupon' && !this.newPromo.code.trim()) {
        this.showToast('Informe o código do cupom', 'error', '⚠️'); return;
      }

      this.promotions.push({
        id: Date.now(),
        name: this.newPromo.name.trim(),
        type: this.newPromo.type,
        value: this.newPromo.value || 0,
        code: this.newPromo.code.trim().toUpperCase(),
        minOrder: this.newPromo.minOrder || 0,
        expiresAt: this.newPromo.expiresAt,
        active: true,
      });
      this.newPromo = { name: '', type: 'percentage', value: 0, code: '', minOrder: 0, expiresAt: '' };
      this.saveData();
      this.showToast('Promoção criada!', 'success', '🔥');
    },

    deletePromo(index) {
      this.promotions.splice(index, 1);
      this.saveData();
    },

    /* ══════════════════════════════════════════
       METHODS — THEME
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
      const rgb = this.hexToRgb(hex);
      const darker = this.darkenHex(hex, 0.15);
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-hover', darker);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.documentElement.style.setProperty('--accent-light', `rgba(${rgb}, 0.12)`);
      this.currentTheme = { id: 'custom', name: 'Custom', accent: hex };
      this.saveSetting('theme', 'custom');
      this.saveSetting('customAccent', hex);
    },

    hexToRgb(hex) {
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return `${r},${g},${b}`;
    },

    darkenHex(hex, amount) {
      let r = parseInt(hex.slice(1,3), 16);
      let g = parseInt(hex.slice(3,5), 16);
      let b = parseInt(hex.slice(5,7), 16);
      r = Math.max(0, Math.round(r * (1 - amount)));
      g = Math.max(0, Math.round(g * (1 - amount)));
      b = Math.max(0, Math.round(b * (1 - amount)));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    },

    /* ══════════════════════════════════════════
       METHODS — UTILS
    ══════════════════════════════════════════ */

    formatMoney(val) {
      if (val == null || isNaN(val)) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    },

    showToast(message, type = 'success', icon = '✓') {
      clearTimeout(this._toastTimer);
      this.toast = { visible: true, message, type, icon };
      this._toastTimer = setTimeout(() => { this.toast.visible = false; }, 2800);
    },

    saveSetting(key, value) {
      try { localStorage.setItem('menuSetting_' + key, JSON.stringify(value)); } catch(e) {}
    },

    loadSetting(key, fallback) {
      try {
        const val = localStorage.getItem('menuSetting_' + key);
        return val !== null ? JSON.parse(val) : fallback;
      } catch(e) { return fallback; }
    },

    saveData() {
      try {
        localStorage.setItem('menuItems', JSON.stringify(this.items));
        localStorage.setItem('menuCategories', JSON.stringify(this.categories));
        localStorage.setItem('menuPromotions', JSON.stringify(this.promotions));
      } catch(e) {}
    },

    loadData() {
      try {
        const items = localStorage.getItem('menuItems');
        const cats  = localStorage.getItem('menuCategories');
        const promos = localStorage.getItem('menuPromotions');
        const config = localStorage.getItem('storeConfig');
        const orders = localStorage.getItem('orderHistory');
        if (items)  this.items = JSON.parse(items);
        if (cats)   this.categories = JSON.parse(cats);
        if (promos) this.promotions = JSON.parse(promos);
        if (config) this.config = { ...this.config, ...JSON.parse(config) };
        if (orders) this.orderHistory = JSON.parse(orders);
      } catch(e) {}
    },

    /* ══════════════════════════════════════════
       INIT
    ══════════════════════════════════════════ */
    init() {
      // Load persisted data
      this.loadData();

      // Load theme
      this.darkMode = this.loadSetting('darkMode', false);
      const savedThemeId = this.loadSetting('theme', 'red');
      const savedAccent  = this.loadSetting('customAccent', '#ef4444');

      if (savedThemeId === 'custom') {
        this.customAccent = savedAccent;
        this.applyCustomColor(savedAccent);
      } else {
        const theme = this.themes.find(t => t.id === savedThemeId);
        if (theme) this.setTheme(theme);
      }

      // Watch dark mode to apply/remove class from html
      this.$watch('darkMode', (val) => {
        document.documentElement.classList.toggle('dark', val);
      });
      document.documentElement.classList.toggle('dark', this.darkMode);

      // Close search when tab changes
      this.$watch('activeTab', () => {
        if (this.searchQuery) {
          this.searchQuery = '';
          this.showSearch = false;
        }
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.showCart = false;
          this.showProductModal = false;
          this.showThemePicker = false;
          this.showProductForm = false;
        }
      });
    },
  };
}