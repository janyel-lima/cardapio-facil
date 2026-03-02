/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/order-manager.js
   Gerenciamento de pedidos pelo admin
════════════════════════════════════════════════════════════════ */

const appOrderManager = {

  /* ── UI state ──────────────────────────────────────────────── */
  showOrderManager:    false,
  omView:              'queue',   // 'queue' | 'kanban' | 'detail'
  omFilter:            'all',
  omSearch:            '',
  omSelectedOrder:     null,
  omEditMode:          false,
  omStatusNote:        '',
  omCancelReason:      '',
  omShowCancelConfirm: false,
  omSaving:            false,
  omLastCount:         0,
  omAudioCtx:          null,
  omInitialized:       false,

  /* ── Edit state ────────────────────────────────────────────── */
  omDraft: null,

  /* ── Status definitions ────────────────────────────────────── */
  omStatuses: [
    { id: 'paid',             label: 'Pago',               short: 'Pago',      emoji: '✅', color: '#3b82f6' },
    { id: 'preparing',        label: 'Em Preparação',      short: 'Preparo',   emoji: '👨‍🍳', color: '#f59e0b' },
    { id: 'out_for_delivery', label: 'Saiu p/ Entrega',    short: 'A caminho', emoji: '🛵', color: '#8b5cf6' },
    { id: 'ready_for_pickup', label: 'Pronto p/ Retirada', short: 'Pronto',    emoji: '🏃', color: '#10b981' },
    { id: 'delivered',        label: 'Entregue',           short: 'Entregue',  emoji: '🎉', color: '#22c55e' },
    { id: 'cancelled',        label: 'Cancelado',          short: 'Cancelado', emoji: '❌', color: '#ef4444' },
  ],

  /* ── Helpers ───────────────────────────────────────────────── */
  omStatusById(id) {
    return this.omStatuses.find(s => s.id === id) ?? this.omStatuses[0];
  },

  omNextStatus(order) {
    const flow = order.deliveryType === 'pickup'
      ? ['paid', 'preparing', 'ready_for_pickup', 'delivered']
      : ['paid', 'preparing', 'out_for_delivery', 'delivered'];
    const idx = flow.indexOf(order.currentStatus ?? 'paid');
    return idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  },

  /* ── Computed ──────────────────────────────────────────────── */
  get omFilteredOrders() {
    let list = [...this.orderHistory].reverse();
    if (this.omFilter !== 'all')
      list = list.filter(o => (o.currentStatus ?? 'paid') === this.omFilter);
    if (this.omSearch.trim()) {
      const q = this.omSearch.toLowerCase();
      list = list.filter(o =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.name?.toLowerCase().includes(q) ||
        o.phone?.includes(q),
      );
    }
    return list;
  },

  get omKanbanColumns() {
    const today       = new Date().toLocaleDateString('pt-BR');
    const todayOrders = this.orderHistory.filter(o => o.date === today);
    return this.omStatuses.map(st => ({
      ...st,
      orders: todayOrders
        .filter(o => (o.currentStatus ?? 'paid') === st.id)
        .reverse(),
    }));
  },

  get omTodayKpi() {
    const today   = new Date().toLocaleDateString('pt-BR');
    const orders  = this.orderHistory.filter(o => o.date === today);
    const active  = orders.filter(o => !['delivered', 'cancelled'].includes(o.currentStatus ?? 'paid'));
    const revenue = orders
      .filter(o => (o.currentStatus ?? 'paid') !== 'cancelled')
      .reduce((s, o) => s + o.total, 0);
    return {
      total:     orders.length,
      active:    active.length,
      revenue,
      avgTicket: orders.length ? revenue / orders.length : 0,
      preparing: orders.filter(o => o.currentStatus === 'preparing').length,
      onTheWay:  orders.filter(o => o.currentStatus === 'out_for_delivery').length,
    };
  },

  /* ── Ciclo de vida da aba Order Manager ────────────────────── */
  omEnterTab() {
    if (!this.omInitialized) {
      this.omView          = 'queue';
      this.omFilter        = 'all';
      this.omSearch        = '';
      this.omSelectedOrder = null;
      this.omDraft         = null;
      this.omEditMode      = false;
      this.omInitialized   = true;
    }
    this._omSyncSelectedOrder();
    this.omLastCount = this.orderHistory.length;
    this._omStartPolling();
  },

  omLeaveTab() {
    clearInterval(this._omPollTimer);
  },

  openOrderManager() {
    this.omEnterTab();
  },

  closeOrderManager() {
    this.showOrderManager = false;
    clearInterval(this._omPollTimer);
  },

  /* ── Sincronização do pedido aberto no detalhe ─────────────── */
  _omSyncSelectedOrder() {
    if (!this.omSelectedOrder) return;
    const fresh = this.orderHistory.find(o => o.uuid === this.omSelectedOrder.uuid);
    if (fresh) {
      this.omSelectedOrder = { ...fresh };
    } else {
      this.omSelectedOrder = null;
      this.omView          = 'queue';
      this.omEditMode      = false;
      this.omDraft         = null;
    }
  },

  /* ── Abrir detalhe ─────────────────────────────────────────── */
  omOpenDetail(order) {
    const fresh = this.orderHistory.find(o => o.uuid === order.uuid) ?? order;
    this.omSelectedOrder     = { ...fresh };
    this.omDraft             = null;
    this.omEditMode          = false;
    this.omStatusNote        = '';
    this.omCancelReason      = '';
    this.omShowCancelConfirm = false;
    this.omView              = 'detail';
  },

  omCloseDetail() {
    this.omView          = 'queue';
    this.omSelectedOrder = null;
    this.omDraft         = null;
    this.omEditMode      = false;
  },

  /* ── Modo de edição ────────────────────────────────────────── */
  omStartEdit() {
    this.omDraft = {
      ...this.omSelectedOrder,
      items:          this.omSelectedOrder.items.map(i => ({ ...i })),
      manualDiscount: this.omSelectedOrder.manualDiscount ?? 0,
      changeFor:      this.omSelectedOrder.changeFor      ?? 0,
    };
    this._omRecalcDraft();
    this.omEditMode = true;
  },

  omCancelEdit() {
    this.omDraft    = null;
    this.omEditMode = false;
  },

  /* ── Edição de itens no draft ──────────────────────────────── */
  omDraftItemQty(idx, delta) {
    if (!this.omDraft) return;
    const item   = this.omDraft.items[idx];
    const newQty = (item.qty ?? 1) + delta;
    if (newQty < 1) {
      if (this.omDraft.items.length === 1) {
        this.showToast('O pedido deve ter pelo menos 1 item.', 'error', '⚠️');
        return;
      }
      this.omDraft.items.splice(idx, 1);
    } else {
      item.qty   = newQty;
      item.total = (item.unitPrice + (item.complementsTotal ?? 0)) * newQty;
    }
    this.omDraft = { ...this.omDraft, items: [...this.omDraft.items] };
    this._omRecalcDraft();
  },

  omDraftRemoveItem(idx) {
    if (this.omDraft.items.length === 1) {
      this.showToast('O pedido deve ter pelo menos 1 item.', 'error', '⚠️');
      return;
    }
    this.omDraft.items.splice(idx, 1);
    this.omDraft = { ...this.omDraft, items: [...this.omDraft.items] };
    this._omRecalcDraft();
  },

  omDraftSetDiscount(val) {
    if (!this.omDraft) return;
    this.omDraft.manualDiscount = Math.max(0, parseFloat(val) || 0);
    this._omRecalcDraft();
  },

  omDraftSetChangeFor(val) {
    if (!this.omDraft) return;
    this.omDraft.changeFor = Math.max(0, parseFloat(val) || 0);
  },

  // FIX: recalcula totais do draft usando:
  //   1. subtotal dos itens editados
  //   2. descontos automáticos de carrinho reavaliados contra o novo subtotal
  //   3. desconto manual adicionado pelo admin
  // Isso garante que ao remover itens o total reflita as regras de promoção atuais.
  _omRecalcDraft() {
    if (!this.omDraft) return;

    const subtotal = this.omDraft.items.reduce((s, i) => s + (i.total ?? 0), 0);

    // Recalcula descontos de CARRINHO com as regras de promoção ativas atuais.
    // Promoções de ITEM já estão embutidas nos preços unitários (item.unitPrice).
    let autoDiscount = 0;
    for (const p of (this.promotions || []).filter(p =>
      p.active &&
      p.type !== 'coupon' &&
      p.type !== 'freeDelivery' &&
      (p.scope || 'cart') === 'cart' &&
      subtotal >= (p.minOrder || 0),
    )) {
      if (p.type === 'percentage') autoDiscount += subtotal * (p.value / 100);
      else if (p.type === 'fixed') autoDiscount += p.value;
    }

    // Mantém desconto de cupom original (já estava aplicado no pedido).
    // O cupom não é recalculado pois está fixado no momento da compra.
    const couponDiscount = this.omDraft.couponDetail?.discountAmount ?? 0;

    const manualDiscount = this.omDraft.manualDiscount ?? 0;
    const totalDiscount  = Math.min(autoDiscount + couponDiscount + manualDiscount, subtotal);
    const total          = Math.max(0, subtotal - totalDiscount + (this.omDraft.deliveryFee ?? 0));

    this.omDraft = {
      ...this.omDraft,
      subtotal,
      discount:       +(autoDiscount + couponDiscount).toFixed(2),
      total:          +total.toFixed(2),
      _totalDiscount: +totalDiscount.toFixed(2),
    };
  },

  /* ── Salvar edição ─────────────────────────────────────────── */
  async omSaveEdit() {
    if (!this.omDraft) return;
    this.omSaving = true;
    try {
      const updated = { ...this.omDraft, updatedAt: new Date().toISOString() };
      if (!updated.timeline) updated.timeline = [];
      updated.timeline.push({
        status:    updated.currentStatus ?? 'paid',
        label:     'Pedido editado pelo admin',
        emoji:     '✏️',
        note:      `Subtotal: ${this.formatMoney(updated.subtotal)} · Total: ${this.formatMoney(updated.total)}`,
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      });

      const plainUpdated = JSON.parse(JSON.stringify(updated));
      await db.orders.put(plainUpdated);

      const idx = this.orderHistory.findIndex(o => o.uuid === updated.uuid);
      if (idx !== -1) this.orderHistory.splice(idx, 1, plainUpdated);
      this.omSelectedOrder = { ...plainUpdated };
      this.omDraft         = null;
      this.omEditMode      = false;

      await this.addAudit('ORDER_EDITED', {
        orderNumber: updated.orderNumber,
        total:       updated.total,
      });
      this.showToast('Pedido atualizado!', 'success', '✏️');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'omSaveEdit', type: 'orderManagerError',
        orderNumber: this.omDraft?.orderNumber || null,
        orderUuid:   this.omDraft?.uuid        || null,
      }, 'order-manager');
      this.showToast('Erro ao salvar edição.', 'error', '❌');
    } finally {
      this.omSaving = false;
    }
  },

  /* ── Avançar status ────────────────────────────────────────── */
  async omAdvanceStatus(order) {
    const next = this.omNextStatus(order);
    if (!next) return;
    await this.omSetStatus(order, next, '');
  },

  /* ── Definir status específico ─────────────────────────────── */
  async omSetStatus(order, newStatusId, note) {
    const statusInfo = this.omStatuses.find(s => s.id === newStatusId);
    if (!statusInfo) return;
    try {
      // Trabalha em cópia limpa para evitar mutação de proxy Alpine
      const updated = JSON.parse(JSON.stringify(order));
      if (!updated.timeline) updated.timeline = [];
      const event = {
        status:    newStatusId,
        label:     statusInfo.label,
        emoji:     statusInfo.emoji,
        note:      note ?? this.omStatusNote.trim(),
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      };
      updated.timeline.push(event);
      updated.currentStatus = newStatusId;
      updated.updatedAt     = event.timestamp;

      await db.orders.put(updated);

      const idx = this.orderHistory.findIndex(o => o.uuid === updated.uuid);
      if (idx !== -1) this.orderHistory.splice(idx, 1, updated);

      if (this.omSelectedOrder?.uuid === updated.uuid)
        this.omSelectedOrder = { ...updated };

      // Sincroniza também com o módulo de rastreamento (tracking.js)
      if (this.trackingOrder?.uuid === updated.uuid)
        this.trackingOrder = { ...updated };

      this.omStatusNote = '';
      await this.addAudit('ORDER_STATUS_CHANGED', {
        orderNumber: updated.orderNumber,
        newStatus:   newStatusId,
        label:       statusInfo.label,
      });
      this.showToast(`${statusInfo.emoji} ${statusInfo.label}`, 'success', statusInfo.emoji);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'omSetStatus', type: 'orderManagerError',
        orderNumber: order?.orderNumber || null, newStatus: newStatusId,
      }, 'order-manager');
      this.showToast('Erro ao atualizar status.', 'error', '❌');
    }
  },

  /* ── Cancelar pedido ───────────────────────────────────────── */
  async omCancelOrder(order) {
    if (!this.omCancelReason.trim()) {
      this.showToast('Informe o motivo do cancelamento.', 'error', '⚠️');
      return;
    }
    try {
      // FIX: omSetStatus já exibe o toast de status — não duplicar com outro showToast.
      await this.omSetStatus(order, 'cancelled', this.omCancelReason.trim());
      this.omCancelReason      = '';
      this.omShowCancelConfirm = false;
      // Nota: não chamamos showToast aqui pois omSetStatus já exibiu "❌ Cancelado".
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'omCancelOrder', type: 'orderManagerError',
        orderNumber: order?.orderNumber || null, reason: this.omCancelReason || null,
      }, 'order-manager');
      this.showToast('Erro ao cancelar pedido.', 'error', '❌');
    }
  },

  /* ── Notificar cliente ─────────────────────────────────────── */
  omNotifyClient(order, customMsg) {
    const phone = (order.phone ?? '').replace(/\D/g, '');
    if (!phone) { this.showToast('Telefone do cliente não disponível.', 'error', '⚠️'); return; }

    const statusInfo = this.omStatuses.find(s => s.id === (order.currentStatus ?? 'paid'));
    const defaultMsg = customMsg ?? [
      `Olá *${order.name}*! 👋`,
      `Atualização do seu pedido *#${order.orderNumber}* em *${this.config.restaurantName}*:`,
      ``,
      `${statusInfo?.emoji ?? '📦'} *${statusInfo?.label ?? 'Atualizado'}*`,
      order.currentStatus === 'out_for_delivery' ? `🛵 Seu pedido está a caminho!`          : '',
      order.currentStatus === 'ready_for_pickup' ? `🏃 Pode vir buscar!`                     : '',
      order.currentStatus === 'delivered'        ? `🎉 Pedido entregue! Bom apetite!`        : '',
      order.currentStatus === 'cancelled'        ? `❌ Pedido cancelado. Entre em contato.` : '',
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(defaultMsg)}`, '_blank');
  },

  /* ── Polling para novos pedidos ────────────────────────────── */
  _omStartPolling() {
    clearInterval(this._omPollTimer);
    this._omPollTimer = setInterval(async () => {
      try {
        const today = new Date().toLocaleDateString('pt-BR');
        const fresh = await db.orders.where('date').equals(today).toArray();

        if (fresh.length > this.omLastCount) this._omPlayAlert();

        let changed = false;
        fresh.forEach(fo => {
          const i = this.orderHistory.findIndex(o => o.uuid === fo.uuid);
          if (i === -1) {
            this.orderHistory.push(fo);
            changed = true;
          } else {
            const existing = this.orderHistory[i];
            if (fo.updatedAt && (!existing.updatedAt || fo.updatedAt > existing.updatedAt)) {
              this.orderHistory.splice(i, 1, fo);
              changed = true;
              if (this.omSelectedOrder?.uuid === fo.uuid)
                this.omSelectedOrder = { ...fo };
            }
          }
        });

        this.omLastCount = fresh.length;
      } catch (e) { /* polling silencioso — falhas transitórias ignoradas */ }
    }, 8000);
  },

  /* ── Som de alerta ─────────────────────────────────────────── */
  _omPlayAlert() {
    try {
      const ctx = this.omAudioCtx ?? (this.omAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      [[0, 880], [0.18, 1100], [0.36, 880]].forEach(([when, freq]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type            = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.15);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime  + when + 0.18);
      });
    } catch (e) { /* AudioContext indisponível */ }
  },

  /* ── Tempo decorrido ───────────────────────────────────────── */
  omElapsedMinutes(order) {
    if (!order.timestamp) return null;
    const min = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    if (min < 1)  return 'Agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    return `${h}h${min % 60 > 0 ? String(min % 60).padStart(2, '0') : ''}`;
  },

  omElapsedColor(order) {
    if (!order.timestamp) return '';
    const min = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    if (min < 10) return 'color:#22c55e';
    if (min < 25) return 'color:#f59e0b';
    return 'color:#ef4444';
  },
};