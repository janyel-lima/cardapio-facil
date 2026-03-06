const appCart = {
  get activeCategories() { return this.categories.filter(c => c.active); },

  get filteredItems() {
    const activeCatIds = new Set(this.categories.filter(c => c.active).map(c => c.id));

    if (this.searchQuery.trim()) {
      const q    = this.searchQuery.toLowerCase();
      const list = this.items.filter(i =>
        activeCatIds.has(i.category) &&
        (i.name.toLowerCase().includes(q) ||
         i.desc.toLowerCase().includes(q) ||
         this.getCategoryName(i.category).toLowerCase().includes(q)),
      );
      return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    let list = this.items.filter(i => activeCatIds.has(i.category));
    if (this.activeTab) {
      list = list.filter(i => i.category === this.activeTab);
    }
    return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  },

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
          this.showToast(`Máximo de ${group.max} opção(ões)`, 'error', '⚠️');
          return;
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
        this.showToast(`Escolha uma opção em "${group.name}"`, 'error', '⚠️');
        return false;
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
        if (opt) result.push({
          groupId:    group.id,
          groupName:  group.name,
          optionId:   opt.id,
          optionName: opt.name,
          price:      opt.price,
        });
      }
    }
    return result;
  },

  get cartTotalItems() { return this.cart.reduce((s, i) => s + i.qty, 0); },

  get cartSubtotal() {
    return this.cart.reduce((s, i) => {
      const base  = (i.promoPrice != null ? i.promoPrice : i.price);
      const comps = (i.complements || []).reduce((sc, c) => sc + c.price, 0);
      return s + (base + comps) * i.qty;
    }, 0);
  },

  get activePromos() { return this.promotions.filter(p => p.active && p.type !== 'coupon'); },

  get activeFreeDeliveryPromo() {
    if (this.checkout?.deliveryType !== 'delivery') return null;
    return this.promotions.find(p =>
      p.active &&
      p.type === 'freeDelivery' &&
      this.cartSubtotal >= Number(p.minOrder || 0),
    ) ?? null;
  },

  get nextFreeDeliveryPromo() {
    if (this.checkout?.deliveryType !== 'delivery') return null;
    const pending = this.promotions
      .filter(p =>
        p.active &&
        p.type === 'freeDelivery' &&
        Number(p.minOrder) > 0 &&
        this.cartSubtotal < Number(p.minOrder),
      )
      .sort((a, b) => Number(a.minOrder) - Number(b.minOrder));
    return pending[0] ?? null;
  },

  get freeDeliveryPromoGap() {
    const next = this.nextFreeDeliveryPromo;
    if (!next) return null;
    return +(Math.max(0, Number(next.minOrder) - this.cartSubtotal)).toFixed(2);
  },

  // ── Taxa de entrega resolvida ─────────────────────────────────────────────
  //
  // No passo 1 (items) nunca inclui frete no total — o cliente ainda não
  // informou o endereço, então qualquer valor seria um placeholder enganoso.
  // O frete só é calculado e exibido a partir do passo 2 (address).
  get deliveryFee() {
    if (this.checkout.deliveryType === 'pickup') return 0;
    if (this.cartStep === 'items') return 0;          // sem frete no passo 1
    if (this.activeFreeDeliveryPromo) return 0;
    const result = this.currentDeliveryFeeResult;
    return Number(result.fee ?? 0);
  },

  get deliveryIsFree() {
    if (!this.deliveryFeeKnown) return false;
    return this.deliveryFee === 0;
  },

  get deliveryIsFreeByPromo() {
    return this.activeFreeDeliveryPromo != null;
  },

  // ── Taxa de entrega já é conhecida? ──────────────────────────────────────
  //
  // No passo 1 (items) sempre retorna false → exibe "—" em vez de um valor
  // calculado antes de o cliente informar o endereço.
  get deliveryFeeKnown() {
    if (this.checkout?.deliveryType !== 'delivery') return true;
    if (this.cartStep === 'items') return false;       // desconhecido no passo 1
    if (this.activeFreeDeliveryPromo) return true;
    if (this.config?.deliveryZones?.length) return this.deliveryRouteKm != null;
    return Number(this.config?.deliveryFee ?? 0) > 0;
  },

  get deliveryOutOfRange() {
    if (this.checkout.deliveryType !== 'delivery') return false;
    if (!this.config.deliveryZones?.length)        return false;
    if (this.deliveryRouteKm == null)              return false;
    return this.currentDeliveryFeeResult?.outOfRange === true;
  },

  // ── Tempo estimado de entrega ─────────────────────────────────────────────
  //
  // Resolução em cascata:
  //   1. Retirada                    → config.deliveryTime (tempo do balcão)
  //   2. Zona matched com deliveryTime → zone.deliveryTime   (tempo da faixa)
  //   3. Zona matched sem deliveryTime → config.deliveryTime (fallback global)
  //   4. Sem zonas / sem rota         → config.deliveryTime
  //   5. Qualquer valor vazio         → null (não exibe)
  get currentDeliveryTime() {
    const fallback = this.config?.deliveryTime?.trim() || null;
    if (this.checkout?.deliveryType !== 'delivery') return fallback;

    const zone = this.currentDeliveryFeeResult?.zone;
    if (zone?.deliveryTime?.trim()) return zone.deliveryTime.trim();

    return fallback;
  },

  get discountValue() {
    let discount = 0;
    for (const p of this.promotions.filter(p =>
      p.active &&
      p.type !== 'coupon' &&
      p.type !== 'freeDelivery' &&
      (p.scope || 'cart') === 'cart' &&
      this.cartSubtotal >= (p.minOrder || 0),
    )) {
      if (p.type === 'percentage') discount += this.cartSubtotal * (p.value / 100);
      else if (p.type === 'fixed') discount += p.value;
    }
    if (this.appliedCoupon) {
      if (this.appliedCoupon.type === 'percentage')
        discount += this.cartSubtotal * (this.appliedCoupon.value / 100);
      else if (this.appliedCoupon.type === 'fixed')
        discount += this.appliedCoupon.value;
    }
    return Math.min(discount, this.cartSubtotal);
  },

  get orderTotal() { return Math.max(0, this.cartSubtotal - this.discountValue + this.deliveryFee); },

  _cartKey(itemId, note, complements) {
    return `${itemId}::${note || ''}::${(complements || []).map(c => c.optionId).sort().join('|')}`;
  },

  addToCart(item) {
    if (!item.available) return;
    if (item.complements?.some(g => g.required)) { this.openProductModal(item); return; }
    this.addToCartWithDetails(item, 1, '', []);
  },

  addToCartWithDetails(item, qty, note, complements) {
    if (!item.available) return;
    const key      = this._cartKey(item.id, note, complements);
    const existing = this.cart.find(c => c._key === key);
    if (existing) {
      existing.qty += qty;
    } else {
      this.cart.push({
        _key:        key,
        id:          item.id,
        name:        item.name,
        price:       item.price,
        promoPrice:  item.promoPrice  ?? null,
        promoId:     item.promoId     ?? null,
        image:       item.image,
        qty:         qty  || 1,
        note:        note || '',
        complements: complements || [],
      });
    }
    this.showToast(`${item.name} adicionado! 🎉`, 'success', '🛒');
  },

  incrementCart(index) { this.cart[index].qty++; },

  decrementCart(index) {
    if (this.cart[index].qty > 1) this.cart[index].qty--;
    else this.cart.splice(index, 1);
  },

  openProductModal(item) {
    this.selectedProduct            = item;
    this.modalQty                   = 1;
    this.modalNote                  = '';
    this.modalSelectedComplements   = {};
    if (item.complements) {
      for (const g of item.complements) {
        if (g.type === 'single' && g.required && g.options.length > 0)
          this.modalSelectedComplements[g.id] = [g.options[0].id];
      }
    }
    this.showProductModal = true;
  },

  confirmAddToCart() {
    if (!this.validateComplements()) return;
    this.addToCartWithDetails(
      this.selectedProduct, this.modalQty, this.modalNote, this.buildSelectedComplements(),
    );
    this.showProductModal = false;
  },

  async applyCoupon() {
    const code = this.couponInput.trim().toUpperCase();
    if (!code) return;
    try {
      const coupon = this.promotions.find(
        p => p.active && p.type === 'coupon' && p.code?.toUpperCase() === code,
      );
      if (!coupon) { this.showToast('Cupom inválido ou expirado', 'error', '❌'); return; }
      if (coupon.minOrder > 0 && this.cartSubtotal < coupon.minOrder) {
        this.showToast(`Pedido mínimo: ${this.formatMoney(coupon.minOrder)}`, 'error', '⚠️');
        return;
      }
      this.appliedCoupon = coupon;
      this.couponInput   = '';
      await this.addAudit('COUPON_APPLIED', { code, discount: coupon.value, type: coupon.type });
      this.logInfo('Cupom aplicado com sucesso', { source: 'applyCoupon', type: 'couponApplied', code, discountType: coupon.type, discountValue: coupon.value }, 'cart');
      this.showToast(`Cupom "${code}" aplicado! 🎟️`, 'success', '🎟️');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'applyCoupon', type: 'cartError',
        couponCode: code || null,
      }, 'cart');
      this.showToast('Erro ao aplicar cupom.', 'error', '❌');
    }
  },

  sendToWhatsApp() {
    if (!this.config.isOpen) { this.showToast('Loja fechada no momento!', 'error', '🚫'); return; }
    if (!this.checkout.name.trim())  { this.showToast('Informe seu nome', 'error', '⚠️'); return; }
    if (!this.checkout.phone.trim()) { this.showToast('Informe seu WhatsApp', 'error', '⚠️'); return; }
    if (this.checkout.deliveryType === 'delivery' && !this.checkout.address.trim()) {
      this.showToast('Informe o endereço', 'error', '⚠️'); return;
    }
    if (this.cartSubtotal < this.config.minOrder && this.checkout.deliveryType === 'delivery') {
      this.showToast(`Pedido mínimo: ${this.formatMoney(this.config.minOrder)}`, 'error', '⚠️');
      return;
    }
    if (this.deliveryOutOfRange) {
      const lastZone = [...(this.config.deliveryZones || [])].sort((a, b) => b.maxKm - a.maxKm)[0];
      const limit    = lastZone ? `máx. ${lastZone.maxKm} km` : '';
      this.showToast(
        `Endereço fora da área de entrega${limit ? ' (' + limit + ')' : ''}.`,
        'error', '🚫',
      );
      return;
    }
    if (this.checkout.payment === 'pix') { this.openPixModal(); return; }
    this._finishOrder();
  },

  openPixModal() {
    this.pixStatus    = 'pending';
    this.pixCopied    = false;
    this.pixCountdown = 300;
    this.showCart     = false;
    this.showPixModal = true;
    clearInterval(this._pixTimer);
    this._pixTimer = setInterval(() => {
      this.pixCountdown--;
      if (this.pixCountdown <= 0) {
        clearInterval(this._pixTimer);
        this.pixStatus = 'expired';
        this.logWarn('PIX expirado por timeout', { source: 'openPixModal', type: 'pixExpired', orderTotal: this.orderTotal, customer: this.checkout?.name || null }, 'cart');
      }
    }, 1000);
  },

  confirmPixPayment() {
    clearInterval(this._pixTimer);
    this.pixStatus = 'confirmed';
    this.logInfo('Pagamento PIX confirmado pelo usuário', { source: 'confirmPixPayment', type: 'pixConfirmed', orderTotal: this.orderTotal, customer: this.checkout?.name || null }, 'cart');
    setTimeout(async () => {
      this.showPixModal = false;
      await this._finishOrder();
    }, 1500);
  },

  copyPixKey() {
    navigator.clipboard.writeText(this.config.pixKey)
      .then(() => { this.pixCopied = true; setTimeout(() => this.pixCopied = false, 3000); })
      .catch(err => {
        this.logWarn('navigator.clipboard indisponível — usando fallback execCommand', { source: 'copyPixKey', type: 'clipboardFallback', error: err?.message || String(err) }, 'cart');
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
    return `${Math.floor(this.pixCountdown / 60).toString().padStart(2, '0')}:${(this.pixCountdown % 60).toString().padStart(2, '0')}`;
  },

  get pixQrUrl() {
    const data = `PIX|${this.config.pixKey}|${this.orderTotal.toFixed(2)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}&margin=10&bgcolor=ffffff`;
  },

  async _finishOrder() {
    try {
      const orderNum = this.nextOrderNumber();
      const now      = new Date().toLocaleString('pt-BR');

      let msg = `🍔 *PEDIDO #${orderNum} — ${this.config.restaurantName.toUpperCase()}*\n📅 ${now}\n\n`;
      msg += `👤 *Cliente:* ${this.checkout.name}\n📱 *WhatsApp:* ${this.checkout.phone}\n`;
      if (this.checkout.deliveryType === 'delivery') {
        msg += `📍 *Endereço:* ${this.checkout.address}${this.checkout.complement ? ', ' + this.checkout.complement : ''}\n`;
        const feeResult = this.currentDeliveryFeeResult;
        if (feeResult?.zone?.label) {
          msg += `📏 *Zona:* ${feeResult.zone.label}`;
          if (this.deliveryRouteKm != null) {
            const kmStr = this.deliveryRouteKm < 1
              ? Math.round(this.deliveryRouteKm * 1000) + ' m'
              : this.deliveryRouteKm.toFixed(1).replace('.', ',') + ' km';
            msg += ` (${kmStr} de rota${this.deliveryRouteFailed ? ' ~est.' : ''})`;
          }
          msg += '\n';
        }
        if (this.deliveryIsFreeByPromo) {
          msg += `🎉 *Frete grátis* (${this.activeFreeDeliveryPromo?.name || 'promoção'})\n`;
        }
      } else {
        msg += `🏃 *Retirada no local*\n`;
      }

      msg += '\n📦 *ITENS:*\n';
      this.cart.forEach(item => {
        const base  = (item.promoPrice != null ? item.promoPrice : item.price);
        const comps = (item.complements || []).reduce((s, c) => s + c.price, 0);
        msg += `• ${item.qty}x ${item.name} — ${this.formatMoney((base + comps) * item.qty)}\n`;
        if (item.promoPrice != null && item.promoPrice < item.price) {
          msg += `  💰 _Era ${this.formatMoney(item.price)}, agora ${this.formatMoney(item.promoPrice)}_\n`;
        }
        if (item.complements?.length) {
          msg += `  ➜ _${item.complements.map(c => `${c.optionName}${c.price > 0 ? ' +' + this.formatMoney(c.price) : ''}`).join(', ')}_\n`;
        }
        if (item.note) msg += `  📝 _${item.note}_\n`;
      });

      msg += `\n💰 *RESUMO:*\nSubtotal: ${this.formatMoney(this.cartSubtotal)}\n`;
      if (this.discountValue > 0) msg += `Desconto: -${this.formatMoney(this.discountValue)}\n`;
      if (this.checkout.deliveryType === 'delivery') {
        msg += this.deliveryIsFreeByPromo
          ? `Taxa entrega: Grátis 🎉 (${this.activeFreeDeliveryPromo?.name})\n`
          : `Taxa entrega: ${this.formatMoney(this.deliveryFee)}\n`;
      }
      msg += `*TOTAL: ${this.formatMoney(this.orderTotal)}*\n\n`;
      msg += `💳 *Pagamento:* ${{ pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' }[this.checkout.payment]}\n`;
      if (this.checkout.payment === 'pix')
        msg += `\n✅ *PIX informado via QR Code*\n_(Aguardando comprovante)_`;

      await this.saveOrderToHistory(orderNum);
      window.open(`https://wa.me/${this.config.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: '_finishOrder', type: 'checkoutError',
        cartItems: this.cart?.length || 0, payment: this.checkout?.payment || null,
      }, 'cart');
      this.showToast('Erro ao finalizar pedido. Tente novamente.', 'error', '❌');
    }
  },

  async saveOrderToHistory(orderNum) {
    const orderId = this.uuid();
    try {
      const delivery = this.checkout.deliveryType === 'delivery'
        ? JSON.parse(JSON.stringify(this.deliveryPayload))
        : { type: 'pickup', address: null, coords: null, label: 'Retirada no local' };

      const storeSnapshot = {
        lat:   this.config.storeLat  ?? null,
        lng:   this.config.storeLng  ?? null,
        label: this.storeAddressFormatted || null,
      };

      const feeResult = this.currentDeliveryFeeResult;

      const order = {
        uuid:        orderId,
        orderNumber: orderNum || this.nextOrderNumber(),
        name:        this.checkout.name,
        phone:       this.checkout.phone,
        address:     this.checkout.deliveryType === 'delivery' ? this.checkout.address : 'Retirada',
        complement:  this.checkout.complement || '',
        deliveryType: this.checkout.deliveryType,
        payment:      this.checkout.payment,

        delivery:     delivery,
        storeAtOrder: storeSnapshot,

        deliveryRouteKm:     this.deliveryRouteKm     ?? null,
        deliveryRouteFailed: this.deliveryRouteFailed  ?? false,
        deliveryZoneLabel:   feeResult?.zone?.label    ?? null,
        deliveryZoneMaxKm:   feeResult?.zone?.maxKm    ?? null,

        originalSubtotal: this.cart.reduce((s, i) => {
          const comps = (i.complements || []).reduce((sc, c) => sc + c.price, 0);
          return s + (i.price + comps) * i.qty;
        }, 0),

        itemDiscounts: this.cart.reduce((s, i) => {
          const unitDiscount = i.price - (i.promoPrice != null ? i.promoPrice : i.price);
          return s + unitDiscount * i.qty;
        }, 0),

        subtotal:    this.cartSubtotal,
        discount:    this.discountValue,
        deliveryFee: this.deliveryFee,
        total:       this.orderTotal,

        items: this.cart.map(i => {
          const catalogItem      = this.items.find(p => p.id === i.id);
          const itemPromoId      = i.promoId ?? catalogItem?.promoId ?? null;
          const linkedPromo      = itemPromoId
            ? this.promotions.find(p => p.id === itemPromoId)
            : null;

          const originalPrice    = i.price;
          const unitPrice        = (i.promoPrice != null ? i.promoPrice : i.price);
          const comps            = (i.complements || []).reduce((sc, c) => sc + c.price, 0);
          const itemDiscountUnit = originalPrice - unitPrice;

          return {
            name:               i.name,
            qty:                i.qty,
            originalPrice,
            unitPrice,
            itemPromoId:        linkedPromo?.id    ?? null,
            itemPromoName:      linkedPromo?.name  ?? null,
            itemPromoType:      linkedPromo?.type  ?? null,
            itemPromoValue:     linkedPromo?.value ?? null,
            itemDiscountPct:    linkedPromo?.type === 'percentage' ? linkedPromo.value : null,
            itemDiscountFlat:   linkedPromo?.type === 'fixed'      ? linkedPromo.value : null,
            itemDiscountAmount: +(itemDiscountUnit * i.qty).toFixed(2),
            complementsTotal:   comps,
            totalUnit:          +(unitPrice + comps).toFixed(2),
            total:              +((unitPrice + comps) * i.qty).toFixed(2),
            note:               i.note || '',
            complements:        i.complements || [],
          };
        }),

        coupon: this.appliedCoupon?.code || '',
        couponDetail: this.appliedCoupon
          ? {
              code:  this.appliedCoupon.code,
              type:  this.appliedCoupon.type,
              value: this.appliedCoupon.value,
              discountAmount: this.appliedCoupon.type === 'percentage'
                ? +(this.cartSubtotal * (this.appliedCoupon.value / 100)).toFixed(2)
                : +(this.appliedCoupon.value).toFixed(2),
            }
          : null,

        appliedPromos: this.promotions
          .filter(p =>
            p.active &&
            p.type !== 'coupon' &&
            p.type !== 'freeDelivery' &&
            (p.scope || 'cart') === 'cart' &&
            this.cartSubtotal >= (p.minOrder || 0),
          )
          .map(p => {
            const discAmt = p.type === 'percentage'
              ? +(this.cartSubtotal * (p.value / 100)).toFixed(2)
              : +(p.value).toFixed(2);
            return { id: p.id, name: p.name, type: p.type, value: p.value, discountAmount: discAmt };
          }),

        freeDeliveryPromo: this.deliveryIsFreeByPromo
          ? {
              id:          this.activeFreeDeliveryPromo?.id   ?? null,
              name:        this.activeFreeDeliveryPromo?.name ?? null,
              minOrder:    Number(this.activeFreeDeliveryPromo?.minOrder || 0),
              savedAmount: this.config.deliveryFee,
            }
          : null,

        date:      new Date().toLocaleDateString('pt-BR'),
        time:      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        hash:      this.djb2Hash(orderId + String(this.orderTotal) + this.checkout.name),
        currentStatus: 'paid',
        timeline: [{
          status:    'paid',
          label:     'Pedido recebido e pago',
          emoji:     '✅',
          note:      '',
          timestamp: new Date().toISOString(),
          updatedBy: 'system',
        }],
        updatedAt: new Date().toISOString(),
      };

      this.cart.splice(0);
      this.checkout      = { name: '', phone: '', address: '', complement: '', deliveryType: 'delivery', payment: 'pix' };
      this.appliedCoupon = null;
      this.showCart      = false;

      if (typeof this.cartResetAddress === 'function') this.cartResetAddress();

      const plainOrder = JSON.parse(JSON.stringify(order));
      await this.persistOrder(plainOrder);
      await this.saveOrderCounter();
      await this.addAudit('ORDER_PLACED', {
        orderNumber:      plainOrder.orderNumber,
        uuid:             orderId,
        total:            plainOrder.total,
        payment:          plainOrder.payment,
        itemCount:        plainOrder.items.length,
        customer:         plainOrder.name,
        itemDiscounts:    plainOrder.itemDiscounts,
        cartDiscounts:    plainOrder.discount,
        hasCoords:        !!(delivery.coords?.lat),
        deliveryZone:     plainOrder.deliveryZoneLabel    || null,
        deliveryRouteKm:  plainOrder.deliveryRouteKm      || null,
        freeDeliveryPromo: plainOrder.freeDeliveryPromo?.name || null,
      });

      this.showToast('Pedido enviado! 🎉', 'success', '✅');
    } catch (err) {
      await this.logError(err.message || String(err), {
        stack: err.stack || null, source: 'saveOrderToHistory', type: 'persistError',
        orderUuid: orderId || null, orderNumber: orderNum || null,
        total: this.orderTotal, payment: this.checkout?.payment || null,
      }, 'cart');
      this.showToast('Pedido enviado, mas houve um erro ao salvar no histórico.', 'error', '⚠️');
    }
  },
};