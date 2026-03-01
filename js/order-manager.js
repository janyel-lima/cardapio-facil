/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/order-manager.js
   Gerenciamento de pedidos pelo admin:
   · KPI em tempo real
   · Fila de pedidos com filtros e busca
   · Kanban por status
   · Edição de itens, desconto manual, troco
   · Mudança de status com nota + timeline
   · Cancelamento com motivo
   · Notificação WhatsApp ao cliente
   · Som de alerta para novos pedidos
════════════════════════════════════════════════════════════════ */

const appOrderManager = {

  /* ── UI state ──────────────────────────────────────────────── */
  showOrderManager:    false,    // abre o painel/modal de gerenciamento
  omView:              'queue',  // 'queue' | 'kanban' | 'detail'
  omFilter:            'all',    // 'all' | status id
  omSearch:            '',
  omSelectedOrder:     null,     // pedido aberto no detail
  omEditMode:          false,    // editing items/discount
  omStatusNote:        '',
  omCancelReason:      '',
  omShowCancelConfirm: false,
  omSaving:            false,
  omLastCount:         0,        // para detectar novos pedidos (som)
  omAudioCtx:          null,

  /* ── Edit state (cópia mutável do pedido) ──────────────────── */
  omDraft: null,   // { ...order, items: [...], manualDiscount: 0, changeFor: 0 }

  /* ── Status definitions (ordem do fluxo) ──────────────────── */
  omStatuses: [
    { id: 'paid',             label: 'Pago',              short: 'Pago',      emoji: '✅', color: '#3b82f6' },
    { id: 'preparing',        label: 'Em Preparação',     short: 'Preparo',   emoji: '👨‍🍳', color: '#f59e0b' },
    { id: 'out_for_delivery', label: 'Saiu p/ Entrega',   short: 'A caminho', emoji: '🛵', color: '#8b5cf6' },
    { id: 'ready_for_pickup', label: 'Pronto p/ Retirada',short: 'Pronto',    emoji: '🏃', color: '#10b981' },
    { id: 'delivered',        label: 'Entregue',          short: 'Entregue',  emoji: '🎉', color: '#22c55e' },
    { id: 'cancelled',        label: 'Cancelado',         short: 'Cancelado', emoji: '❌', color: '#ef4444' },
  ],

  /* ── Helpers de status ─────────────────────────────────────── */
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

  /* ── Computed: pedidos filtrados ───────────────────────────── */
  get omFilteredOrders() {
    let list = [...this.orderHistory].reverse(); // mais recentes primeiro

    if (this.omFilter !== 'all')
      list = list.filter(o => (o.currentStatus ?? 'paid') === this.omFilter);

    if (this.omSearch.trim()) {
      const q = this.omSearch.toLowerCase();
      list = list.filter(o =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.name?.toLowerCase().includes(q) ||
        o.phone?.includes(q)
      );
    }

    return list;
  },

  /* ── Computed: pedidos por coluna do kanban ────────────────── */
  get omKanbanColumns() {
    const today = new Date().toLocaleDateString('pt-BR');
    const todayOrders = this.orderHistory.filter(o => o.date === today);
    return this.omStatuses.map(st => ({
      ...st,
      orders: todayOrders
        .filter(o => (o.currentStatus ?? 'paid') === st.id)
        .reverse(),
    }));
  },

  /* ── Computed: KPIs do dia ─────────────────────────────────── */
  get omTodayKpi() {
    const today   = new Date().toLocaleDateString('pt-BR');
    const orders  = this.orderHistory.filter(o => o.date === today);
    const active  = orders.filter(o => !['delivered','cancelled'].includes(o.currentStatus ?? 'paid'));
    const revenue = orders
      .filter(o => (o.currentStatus ?? 'paid') !== 'cancelled')
      .reduce((s, o) => s + o.total, 0);
    return {
      total:    orders.length,
      active:   active.length,
      revenue,
      avgTicket: orders.length ? revenue / orders.length : 0,
      preparing: orders.filter(o => o.currentStatus === 'preparing').length,
      onTheWay:  orders.filter(o => o.currentStatus === 'out_for_delivery').length,
    };
  },

  /* ── Abrir gerenciador ─────────────────────────────────────── */
  openOrderManager() {
    this.showOrderManager = true;
    this.omView           = 'queue';
    this.omFilter         = 'all';
    this.omSearch         = '';
    this.omLastCount      = this.orderHistory.length;
    this._omStartPolling();
  },

  closeOrderManager() {
    this.showOrderManager = false;
    this.omSelectedOrder  = null;
    this.omDraft          = null;
    this.omEditMode       = false;
    clearInterval(this._omPollTimer);
  },

  /* ── Abrir detalhe de um pedido ────────────────────────────── */
  omOpenDetail(order) {
    this.omSelectedOrder  = order;
    this.omDraft          = null;
    this.omEditMode       = false;
    this.omStatusNote     = '';
    this.omCancelReason   = '';
    this.omShowCancelConfirm = false;
    this.omView           = 'detail';
  },

  omCloseDetail() {
    this.omView           = 'queue';
    this.omSelectedOrder  = null;
    this.omDraft          = null;
    this.omEditMode       = false;
  },

  /* ── Modo de edição ────────────────────────────────────────── */
  omStartEdit() {
    this.omDraft = {
      ...this.omSelectedOrder,
      items: this.omSelectedOrder.items.map(i => ({ ...i })),
      manualDiscount: this.omSelectedOrder.manualDiscount ?? 0,
      changeFor:      this.omSelectedOrder.changeFor ?? 0,
    };
    this.omEditMode = true;
  },

  omCancelEdit() {
    this.omDraft    = null;
    this.omEditMode = false;
  },

  /* ── Edição de itens no draft ──────────────────────────────── */
  omDraftItemQty(idx, delta) {
    if (!this.omDraft) return;
    const item = this.omDraft.items[idx];
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

  /* ── Recalcula totais do draft ─────────────────────────────── */
  _omRecalcDraft() {
    if (!this.omDraft) return;
    const subtotal      = this.omDraft.items.reduce((s, i) => s + (i.total ?? 0), 0);
    const autoDiscount  = this.omDraft.discount ?? 0;  // desconto original (cupom/promo)
    const manualDiscount = this.omDraft.manualDiscount ?? 0;
    const totalDiscount = Math.min(autoDiscount + manualDiscount, subtotal);
    const total         = Math.max(0, subtotal - totalDiscount + (this.omDraft.deliveryFee ?? 0));

    this.omDraft = {
      ...this.omDraft,
      subtotal,
      total,
      _totalDiscount: totalDiscount,
    };
  },

  /* ── Salvar edição ─────────────────────────────────────────── */
  async omSaveEdit() {
    if (!this.omDraft) return;
    this.omSaving = true;
    try {
      const updated = {
        ...this.omDraft,
        updatedAt: new Date().toISOString(),
      };

      // timeline event
      if (!updated.timeline) updated.timeline = [];
      updated.timeline.push({
        status:    updated.currentStatus ?? 'paid',
        label:     'Pedido editado pelo admin',
        emoji:     '✏️',
        note:      `Subtotal: ${this.formatMoney(updated.subtotal)} · Total: ${this.formatMoney(updated.total)}`,
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      });

      await db.orders.put({ ...updated });
      const idx = this.orderHistory.findIndex(o => o.uuid === updated.uuid);
      if (idx !== -1) this.orderHistory.splice(idx, 1, { ...updated });

      this.omSelectedOrder = { ...updated };
      this.omDraft    = null;
      this.omEditMode = false;

      await this.addAudit('ORDER_EDITED', {
        orderNumber: updated.orderNumber,
        total:       updated.total,
      });
      this.showToast('Pedido atualizado!', 'success', '✏️');
    } finally {
      this.omSaving = false;
    }
  },

  /* ── Avançar status (1 passo) ──────────────────────────────── */
  async omAdvanceStatus(order) {
    const next = this.omNextStatus(order);
    if (!next) return;
    await this.omSetStatus(order, next, '');
  },

  /* ── Definir status específico ─────────────────────────────── */
  async omSetStatus(order, newStatusId, note) {
    const statusInfo = this.omStatuses.find(s => s.id === newStatusId);
    if (!statusInfo) return;

    if (!order.timeline) order.timeline = [];
    const event = {
      status:    newStatusId,
      label:     statusInfo.label,
      emoji:     statusInfo.emoji,
      note:      note ?? this.omStatusNote.trim(),
      timestamp: new Date().toISOString(),
      updatedBy: 'admin',
    };
    order.timeline.push(event);
    order.currentStatus = newStatusId;
    order.updatedAt     = event.timestamp;

    await db.orders.put({ ...order });
    const idx = this.orderHistory.findIndex(o => o.uuid === order.uuid);
    if (idx !== -1) this.orderHistory.splice(idx, 1, { ...order });
    if (this.omSelectedOrder?.uuid === order.uuid) this.omSelectedOrder = { ...order };
    if (this.trackingOrder?.uuid === order.uuid) this.trackingOrder = { ...order };

    this.omStatusNote = '';
    await this.addAudit('ORDER_STATUS_CHANGED', {
      orderNumber: order.orderNumber,
      newStatus: newStatusId,
      label: statusInfo.label,
    });
    this.showToast(`${statusInfo.emoji} ${statusInfo.label}`, 'success', statusInfo.emoji);
  },

  /* ── Cancelar pedido ───────────────────────────────────────── */
  async omCancelOrder(order) {
    if (!this.omCancelReason.trim()) {
      this.showToast('Informe o motivo do cancelamento.', 'error', '⚠️');
      return;
    }
    await this.omSetStatus(order, 'cancelled', this.omCancelReason.trim());
    this.omCancelReason      = '';
    this.omShowCancelConfirm = false;
    this.showToast('Pedido cancelado.', 'error', '❌');
  },

  /* ── Notificar cliente via WhatsApp ────────────────────────── */
  omNotifyClient(order, customMsg) {
    const phone = (order.phone ?? '').replace(/\D/g, '');
    if (!phone) { this.showToast('Telefone do cliente não disponível.', 'error', '⚠️'); return; }

    const statusInfo = this.omStatuses.find(s => s.id === (order.currentStatus ?? 'paid'));
    const defaultMsg = customMsg ?? [
      `Olá *${order.name}*! 👋`,
      `Atualização do seu pedido *#${order.orderNumber}* em *${this.config.restaurantName}*:`,
      ``,
      `${statusInfo?.emoji ?? '📦'} *${statusInfo?.label ?? 'Atualizado'}*`,
      order.currentStatus === 'out_for_delivery' ? `🛵 Seu pedido está a caminho!` : '',
      order.currentStatus === 'ready_for_pickup' ? `🏃 Pode vir buscar!` : '',
      order.currentStatus === 'delivered'        ? `🎉 Pedido entregue! Bom apetite!` : '',
      order.currentStatus === 'cancelled'        ? `❌ Pedido cancelado. Entre em contato para mais info.` : '',
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(defaultMsg)}`, '_blank');
  },

  /* ── Polling para novos pedidos (som de alerta) ────────────── */
  _omStartPolling() {
    clearInterval(this._omPollTimer);
    this._omPollTimer = setInterval(async () => {
      if (!this.showOrderManager) return;
      // Recarrega pedidos do dia do Dexie
      try {
        const today  = new Date().toLocaleDateString('pt-BR');
        const fresh  = await db.orders.where('date').equals(today).toArray();
        if (fresh.length > this.omLastCount) {
          this._omPlayAlert();
          // Merge sem duplicar
          fresh.forEach(fo => {
            const i = this.orderHistory.findIndex(o => o.uuid === fo.uuid);
            if (i === -1) this.orderHistory.push(fo);
            else          this.orderHistory.splice(i, 1, fo);
          });
          this.omLastCount = fresh.length;
        }
      } catch (e) { /* silencioso */ }
    }, 8000); // a cada 8s
  },

  /* ── Som de alerta para novo pedido (Web Audio API) ────────── */
  _omPlayAlert() {
    try {
      const ctx = this.omAudioCtx ?? (this.omAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const times = [[0, 880], [0.18, 1100], [0.36, 880]];
      times.forEach(([when, freq]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type      = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.15);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + 0.18);
      });
    } catch (e) { /* browser sem AudioContext */ }
  },

  /* ── Tempo decorrido desde o pedido ────────────────────────── */
  omElapsedMinutes(order) {
    if (!order.timestamp) return null;
    const ms = Date.now() - new Date(order.timestamp).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1)   return 'Agora';
    if (min < 60)  return `${min}min`;
    const h = Math.floor(min / 60);
    return `${h}h${min % 60 > 0 ? String(min % 60).padStart(2,'0') : ''}`;
  },

  /* ── Cor do badge de tempo (urgência) ──────────────────────── */
  omElapsedColor(order) {
    if (!order.timestamp) return '';
    const min = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    if (min < 10) return 'color:#22c55e';
    if (min < 25) return 'color:#f59e0b';
    return 'color:#ef4444';
  },
};