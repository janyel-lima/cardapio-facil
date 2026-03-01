const appCart = {
  get activeCategories() { return this.categories.filter(c => c.active); },
  get filteredItems() {
    let list = this.items;
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || this.getCategoryName(i.category).toLowerCase().includes(q));
    } else if (this.activeTab) { list = list.filter(i => i.category === this.activeTab); }
    return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  },
  get modalComplementsTotal() {
    if (!this.selectedProduct?.complements?.length) return 0;
    let total = 0;
    for (const group of this.selectedProduct.complements) {
      for (const optId of (this.modalSelectedComplements[group.id] || [])) {
        const opt = group.options.find(o => o.id === optId); if (opt) total += opt.price;
      }
    }
    return total;
  },
  isComplementSelected(groupId, optionId) { return (this.modalSelectedComplements[groupId] || []).includes(optionId); },
  toggleComplement(group, option) {
    if (!this.modalSelectedComplements[group.id]) this.modalSelectedComplements[group.id] = [];
    const arr = this.modalSelectedComplements[group.id];
    const idx = arr.indexOf(option.id);
    if (idx > -1) { arr.splice(idx, 1); }
    else {
      if (group.type === 'single') { this.modalSelectedComplements[group.id] = [option.id]; }
      else {
        if (arr.length >= (group.max || 99)) { this.showToast(`Máximo de ${group.max} opção(ões)`, 'error', '⚠️'); return; }
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
  get cartTotalItems() { return this.cart.reduce((s, i) => s + i.qty, 0); },
  get cartSubtotal() {
    return this.cart.reduce((s, i) => {
      const base = (i.promoPrice || i.price);
      const comps = (i.complements || []).reduce((sc, c) => sc + c.price, 0);
      return s + (base + comps) * i.qty;
    }, 0);
  },
  get activePromos() { return this.promotions.filter(p => p.active && p.type !== 'coupon'); },
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
      else if (this.appliedCoupon.type === 'fixed') discount += this.appliedCoupon.value;
    }
    return Math.min(discount, this.cartSubtotal);
  },
  get orderTotal() { return Math.max(0, this.cartSubtotal - this.discountValue + this.deliveryFee); },
  _cartKey(itemId, note, complements) { return `${itemId}::${note||''}::${(complements||[]).map(c=>c.optionId).sort().join('|')}`; },
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
    else { this.cart.push({ _key: key, id: item.id, name: item.name, price: item.price, promoPrice: item.promoPrice, image: item.image, qty: qty||1, note: note||'', complements: complements||[] }); }
    this.showToast(`${item.name} adicionado! 🎉`, 'success', '🛒');
  },
  incrementCart(index) { this.cart[index].qty++; },
  decrementCart(index) { if (this.cart[index].qty > 1) this.cart[index].qty--; else this.cart.splice(index, 1); },
  openProductModal(item) {
    this.selectedProduct = item; this.modalQty = 1; this.modalNote = ''; this.modalSelectedComplements = {};
    if (item.complements) {
      for (const g of item.complements) {
        if (g.type === 'single' && g.required && g.options.length > 0) this.modalSelectedComplements[g.id] = [g.options[0].id];
      }
    }
    this.showProductModal = true;
  },
  confirmAddToCart() {
    if (!this.validateComplements()) return;
    this.addToCartWithDetails(this.selectedProduct, this.modalQty, this.modalNote, this.buildSelectedComplements());
    this.showProductModal = false;
  },
  async applyCoupon() {
    const code = this.couponInput.trim().toUpperCase(); if (!code) return;
    const coupon = this.promotions.find(p => p.active && p.type === 'coupon' && p.code?.toUpperCase() === code);
    if (!coupon) { this.showToast('Cupom inválido ou expirado', 'error', '❌'); return; }
    if (coupon.minOrder > 0 && this.cartSubtotal < coupon.minOrder) { this.showToast(`Pedido mínimo: ${this.formatMoney(coupon.minOrder)}`, 'error', '⚠️'); return; }
    this.appliedCoupon = coupon; this.couponInput = '';
    await this.addAudit('COUPON_APPLIED', { code, discount: coupon.value, type: coupon.type });
    this.showToast(`Cupom "${code}" aplicado! 🎟️`, 'success', '🎟️');
  },
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
    clearInterval(this._pixTimer); this.pixStatus = 'confirmed';
    setTimeout(async () => { this.showPixModal = false; await this._finishOrder(); }, 1500);
  },
  copyPixKey() {
    navigator.clipboard.writeText(this.config.pixKey).then(() => { this.pixCopied = true; setTimeout(() => this.pixCopied = false, 3000); })
      .catch(() => {
        const ta = document.createElement('textarea'); ta.value = this.config.pixKey;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        this.pixCopied = true; setTimeout(() => this.pixCopied = false, 3000);
      });
  },
  get pixCountdownFormatted() { return `${Math.floor(this.pixCountdown/60).toString().padStart(2,'0')}:${(this.pixCountdown%60).toString().padStart(2,'0')}`; },
  get pixQrUrl() {
    const data = `PIX|${this.config.pixKey}|${this.orderTotal.toFixed(2)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}&margin=10&bgcolor=ffffff`;
  },
  async _finishOrder() {
    const orderNum = this.nextOrderNumber();
    const now = new Date().toLocaleString('pt-BR');
    let msg = `🍔 *PEDIDO #${orderNum} — ${this.config.restaurantName.toUpperCase()}*\n📅 ${now}\n\n👤 *Cliente:* ${this.checkout.name}\n📱 *WhatsApp:* ${this.checkout.phone}\n`;
    if (this.checkout.deliveryType === 'delivery') msg += `📍 *Endereço:* ${this.checkout.address}${this.checkout.complement ? ', '+this.checkout.complement : ''}\n`;
    else msg += `🏃 *Retirada no local*\n`;
    msg += '\n📦 *ITENS:*\n';
    this.cart.forEach(item => {
      const base = (item.promoPrice || item.price); const comps = (item.complements||[]).reduce((s,c)=>s+c.price,0);
      msg += `• ${item.qty}x ${item.name} — ${this.formatMoney((base+comps)*item.qty)}\n`;
      if (item.complements?.length) msg += `  ➜ _${item.complements.map(c=>`${c.optionName}${c.price>0?' +'+this.formatMoney(c.price):''}`).join(', ')}_\n`;
      if (item.note) msg += `  📝 _${item.note}_\n`;
    });
    msg += `\n💰 *RESUMO:*\nSubtotal: ${this.formatMoney(this.cartSubtotal)}\n`;
    if (this.discountValue > 0) msg += `Desconto: -${this.formatMoney(this.discountValue)}\n`;
    if (this.checkout.deliveryType === 'delivery') msg += `Taxa entrega: ${this.deliveryFee === 0 ? 'Grátis 🎉' : this.formatMoney(this.deliveryFee)}\n`;
    msg += `*TOTAL: ${this.formatMoney(this.orderTotal)}*\n\n💳 *Pagamento:* ${{pix:'PIX',card:'Cartão',cash:'Dinheiro'}[this.checkout.payment]}\n`;
    if (this.checkout.payment === 'pix') msg += `\n✅ *PIX informado via QR Code*\n_(Aguardando comprovante)_`;

    await this.saveOrderToHistory(orderNum);
    window.open(`https://wa.me/${this.config.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  },
  async saveOrderToHistory(orderNum) {
    const orderId = this.uuid();
    const order = {
      uuid: orderId, orderNumber: orderNum || this.nextOrderNumber(), name: this.checkout.name, phone: this.checkout.phone,
      address: this.checkout.deliveryType === 'delivery' ? this.checkout.address : 'Retirada', complement: this.checkout.complement || '',
      deliveryType: this.checkout.deliveryType, payment: this.checkout.payment, subtotal: this.cartSubtotal, discount: this.discountValue,
      deliveryFee: this.deliveryFee, total: this.orderTotal,
      items: this.cart.map(i => {
        const base = (i.promoPrice || i.price); const comps = (i.complements||[]).reduce((s,c)=>s+c.price,0);
        return { name:i.name, qty:i.qty, unitPrice:base, complementsTotal:comps, totalUnit:base+comps, total:(base+comps)*i.qty, note:i.note||'', complements:i.complements||[] };
      }),
      coupon: this.appliedCoupon?.code || '', date: new Date().toLocaleDateString('pt-BR'),
      time: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }), timestamp: new Date().toISOString(),
      hash: this.djb2Hash(orderId + String(this.orderTotal) + this.checkout.name),
      currentStatus: 'paid',
      timeline: [
        {
          status:    'paid',
          label:     'Pedido recebido e pago',
          emoji:     '✅',
          note:      '',
          timestamp: new Date().toISOString(),
          updatedBy: 'system',
        }
      ],
      updatedAt: new Date().toISOString(),
    };

    this.orderHistory.push(order);

    // Limpa o carrinho ANTES dos awaits — garante reset mesmo se DB falhar
    // usa splice(0) para mutar o array no lugar e disparar reatividade do Alpine
    this.cart.splice(0);
    this.checkout = { name:'', phone:'', address:'', complement:'', deliveryType:'delivery', payment:'pix' };
    this.appliedCoupon = null;
    this.showCart = false;
    this.showToast('Pedido enviado! 🎉', 'success', '✅');

    // Persistência em background — não bloqueia o UX
    try {
      // FIX: JSON round-trip remove os Proxies reativos do Alpine antes de gravar no IndexedDB.
      // O IndexedDB usa o algoritmo de "structured clone", que não consegue serializar
      // Proxy objects — resultando em DataCloneError. Serializar para JSON e
      // desserializar de volta garante um objeto POJO puro e clonável.
      const plainOrder = JSON.parse(JSON.stringify(order));

      await this.persistOrder(plainOrder);
      await this.saveOrderCounter();
      await this.addAudit('ORDER_PLACED', { orderNumber: plainOrder.orderNumber, uuid: orderId, total: plainOrder.total, payment: plainOrder.payment, itemCount: plainOrder.items.length, customer: plainOrder.name });
    } catch (err) {
      console.error('[saveOrderToHistory] Erro ao persistir pedido:', err);
    }
  }
};