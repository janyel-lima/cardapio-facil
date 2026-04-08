/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/order-manager.js
   Gerenciamento de pedidos pelo admin

   Migrado de: Dexie (db.orders.put / polling interval)
   Agora:      Firestore via this.updateOrder() + onSnapshot realtime
               O onSnapshot (_initRealtimeOrders em database.js) já
               mantém this.orderHistory atualizado em tempo real —
               polling é desnecessário e foi removido.
════════════════════════════════════════════════════════════════ */

const appOrderManager = {

  /* ── UI state ──────────────────────────────────────────────── */
  showOrderManager: false,
  omView: 'queue',   // 'queue' | 'kanban' | 'detail'
  omFilter: 'all',
  omSearch: '',
  omSelectedOrder: null,
  omEditMode: false,
  omStatusNote: '',
  omCancelReason: '',
  omShowCancelConfirm: false,
  omSaving: false,
  omLastCount: 0,
  omAudioCtx: null,
  omInitialized: false,

  /* ── Edit state ────────────────────────────────────────────── */
  omDraft: null,

  /* ── Status definitions ────────────────────────────────────── */
  omStatuses: [
    { id: 'paid', label: 'Pago', short: 'Pago', emoji: '✅', color: '#3b82f6' },
    { id: 'preparing', label: 'Em Preparação', short: 'Preparo', emoji: '👨‍🍳', color: '#f59e0b' },
    { id: 'out_for_delivery', label: 'Saiu p/ Entrega', short: 'A caminho', emoji: '🛵', color: '#8b5cf6' },
    { id: 'ready_for_pickup', label: 'Pronto p/ Retirada', short: 'Pronto', emoji: '🏃', color: '#10b981' },
    { id: 'delivered', label: 'Entregue', short: 'Entregue', emoji: '🎉', color: '#22c55e' },
    { id: 'cancelled', label: 'Cancelado', short: 'Cancelado', emoji: '❌', color: '#ef4444' },
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
    // ── Janela operacional: hoje + ontem ──────────────────────
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR');
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toLocaleDateString('pt-BR');

    let list = this.orderHistory.filter(o => o.date === today || o.date === yesterday);

    // ── Filtros de status e busca ─────────────────────────────
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

    // ── Ordenação por urgência ────────────────────────────────
    // Ativos primeiro (mais antigos no topo = esperando há mais tempo),
    // entregues/cancelados no final (mais recentes primeiro).
    const DONE = new Set(['delivered', 'cancelled']);
    list.sort((a, b) => {
      const aDone = DONE.has(a.currentStatus ?? 'paid');
      const bDone = DONE.has(b.currentStatus ?? 'paid');
      if (aDone !== bDone) return aDone ? 1 : -1;          // ativos primeiro
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aDone
        ? tB - tA   // finalizados: mais recente primeiro
        : tA - tB;  // ativos: mais antigo primeiro (maior espera = mais urgente)
    });

    return list;
  },

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

  get omTodayKpi() {
    const today = new Date().toLocaleDateString('pt-BR');
    const orders = this.orderHistory.filter(o => o.date === today);
    const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.currentStatus ?? 'paid'));
    const revenue = orders
      .filter(o => (o.currentStatus ?? 'paid') !== 'cancelled')
      .reduce((s, o) => s + o.total, 0);
    return {
      total: orders.length,
      active: active.length,
      revenue,
      avgTicket: orders.length ? revenue / orders.length : 0,
      preparing: orders.filter(o => o.currentStatus === 'preparing').length,
      onTheWay: orders.filter(o => o.currentStatus === 'out_for_delivery').length,
    };
  },

  /* ── Ciclo de vida da aba Order Manager ────────────────────── */
  omEnterTab() {
    if (!this.omInitialized) {
      this.omView = 'queue';
      this.omFilter = 'all';
      this.omSearch = '';
      this.omSelectedOrder = null;
      this.omDraft = null;
      this.omEditMode = false;
      this.omInitialized = true;
    }
    this._omSyncSelectedOrder();
    this.omLastCount = this.orderHistory.length;

    // onSnapshot (database.js → _initRealtimeOrders) já está rodando e
    // mantém this.orderHistory atualizado com latência zero.
    // _omStartNewOrderWatch apenas monitora contagem para tocar o alerta sonoro.
    this._omStartNewOrderWatch();
  },

  omLeaveTab() {
    this._omStopNewOrderWatch();
  },

  openOrderManager() {
    this.omEnterTab();
  },

  closeOrderManager() {
    this.showOrderManager = false;
    this._omStopNewOrderWatch();
  },

  /* ── Sincronização do pedido aberto no detalhe ─────────────── */
  // Chamado sempre que omSelectedOrder pode estar desatualizado.
  // Como onSnapshot já mutou this.orderHistory, basta re-buscar por uuid.
  _omSyncSelectedOrder() {
    if (!this.omSelectedOrder) return;
    const fresh = this.orderHistory.find(o => o.uuid === this.omSelectedOrder.uuid);
    if (fresh) {
      this.omSelectedOrder = { ...fresh };
    } else {
      this.omSelectedOrder = null;
      this.omView = 'queue';
      this.omEditMode = false;
      this.omDraft = null;
    }
  },

  /* ── Abrir detalhe ─────────────────────────────────────────── */
  omOpenDetail(order) {
    const fresh = this.orderHistory.find(o => o.uuid === order.uuid) ?? order;
    this.omSelectedOrder = { ...fresh };
    this.omDraft = null;
    this.omEditMode = false;
    this.omStatusNote = '';
    this.omCancelReason = '';
    this.omShowCancelConfirm = false;
    this.omView = 'detail';
  },

  omCloseDetail() {
    this.omView = 'queue';
    this.omSelectedOrder = null;
    this.omDraft = null;
    this.omEditMode = false;
  },

  /* ── Modo de edição ────────────────────────────────────────── */
  omStartEdit() {
    this.omDraft = {
      ...this.omSelectedOrder,
      items: this.omSelectedOrder.items.map(i => ({ ...i })),
      manualDiscount: this.omSelectedOrder.manualDiscount ?? 0,
      changeFor: this.omSelectedOrder.changeFor ?? 0,
    };
    this._omRecalcDraft();
    this.omEditMode = true;
  },

  omCancelEdit() {
    this.omDraft = null;
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
      item.qty = newQty;
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

  _omRecalcDraft() {
    if (!this.omDraft) return;

    const subtotal = this.omDraft.items.reduce((s, i) => s + (i.total ?? 0), 0);

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

    const couponDiscount = this.omDraft.couponDetail?.discountAmount ?? 0;
    const manualDiscount = this.omDraft.manualDiscount ?? 0;
    const totalDiscount = Math.min(autoDiscount + couponDiscount + manualDiscount, subtotal);
    const total = Math.max(0, subtotal - totalDiscount + (this.omDraft.deliveryFee ?? 0));

    this.omDraft = {
      ...this.omDraft,
      subtotal,
      discount: +(autoDiscount + couponDiscount).toFixed(2),
      total: +total.toFixed(2),
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
        status: updated.currentStatus ?? 'paid',
        label: 'Pedido editado pelo admin',
        emoji: '✏️',
        note: `Subtotal: ${this.formatMoney(updated.subtotal)} · Total: ${this.formatMoney(updated.total)}`,
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      });

      // Persiste no Firestore — onSnapshot propaga de volta para
      // this.orderHistory automaticamente (sem splice manual aqui).
      await this.updateOrder(updated);
      // Agenda fechamento do chat 1h após entrega ou cancelamento
      if (['delivered', 'cancelled'].includes(newStatusId)) {
        await this.chatScheduleClose?.(order.uuid);
      }
      // Atualiza a view de detalhe com os dados recém-salvos
      this.omSelectedOrder = { ...updated };
      this.omDraft = null;
      this.omEditMode = false;

      await this.addAudit('ORDER_EDITED', {
        orderNumber: updated.orderNumber,
        total: updated.total,
      });
      this.showToast('Pedido atualizado!', 'success', '✏️');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'omSaveEdit', type: 'orderManagerError',
        orderNumber: this.omDraft?.orderNumber || null,
        orderUuid: this.omDraft?.uuid || null,
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
      const updated = JSON.parse(JSON.stringify(order));
      if (!updated.timeline) updated.timeline = [];
      const event = {
        status: newStatusId,
        label: statusInfo.label,
        emoji: statusInfo.emoji,
        note: note ?? this.omStatusNote.trim(),
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      };
      updated.timeline.push(event);
      updated.currentStatus = newStatusId;
      updated.updatedAt = event.timestamp;

      // Persiste no Firestore — onSnapshot propaga para this.orderHistory.
      // Não fazemos splice manual: duplicaria a atualização.
      await this.updateOrder(updated);

      // Atualiza views locais imediatamente (antes do snapshot chegar)
      // para UX responsiva — o onSnapshot vai confirmar/sincronizar logo após.
      if (this.omSelectedOrder?.uuid === updated.uuid)
        this.omSelectedOrder = { ...updated };

      if (this.trackingOrder?.uuid === updated.uuid)
        this.trackingOrder = { ...updated };

      this.omStatusNote = '';
      await this.addAudit('ORDER_STATUS_CHANGED', {
        orderNumber: updated.orderNumber,
        newStatus: newStatusId,
        label: statusInfo.label,
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
      await this.omSetStatus(order, 'cancelled', this.omCancelReason.trim());
      this.omCancelReason = '';
      this.omShowCancelConfirm = false;
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
      order.currentStatus === 'out_for_delivery' ? `🛵 Seu pedido está a caminho!` : '',
      order.currentStatus === 'ready_for_pickup' ? `🏃 Pode vir buscar!` : '',
      order.currentStatus === 'delivered' ? `🎉 Pedido entregue! Bom apetite!` : '',
      order.currentStatus === 'cancelled' ? `❌ Pedido cancelado. Entre em contato.` : '',
    ].filter(Boolean).join('\n');

    this.logInfo('Notificação WhatsApp disparada para cliente', {
      source: 'omNotifyClient',
      type: 'clientNotification',
      orderNumber: order.orderNumber,
      orderUuid: order.uuid,
      status: order.currentStatus ?? 'paid',
      customMsg: !!customMsg,
    }, 'order-manager');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(defaultMsg)}`, '_blank');
  },

  /* ── Watcher de novos pedidos (alerta sonoro) ──────────────── */
  //
  // Substituiu o _omStartPolling() que fazia db.orders.where().toArray() a cada 8s.
  //
  // onSnapshot já mantém this.orderHistory em sync — o watcher apenas
  // observa a contagem para disparar o alerta sonoro quando um novo pedido chega.
  // Usa $watch do Alpine sobre orderHistory.length.
  _omStartNewOrderWatch() {
    this._omStopNewOrderWatch();

    // Guarda contagem atual como baseline
    this.omLastCount = this.orderHistory.length;

    // $watch requer contexto Alpine — usa um interval leve (1s) apenas
    // para comparar contagem, sem nenhum I/O. O Firestore onSnapshot
    // é quem realmente popula orderHistory.
    this._omWatchTimer = setInterval(() => {
      const current = this.orderHistory.length;
      if (current > this.omLastCount) {
        this._omPlayAlert();
      }
      this.omLastCount = current;
    }, 1000);
  },

  _omStopNewOrderWatch() {
    clearInterval(this._omWatchTimer);
    this._omWatchTimer = null;
  },

  /* ── Som de alerta ─────────────────────────────────────────── */
  _omPlayAlert() {
    try {
      const ctx = this.omAudioCtx ?? (this.omAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      [[0, 880], [0.18, 1100], [0.36, 880]].forEach(([when, freq]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.15);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + 0.18);
      });
    } catch (e) {
      this.logWarn('AudioContext indisponível — alerta sonoro não reproduzido', {
        source: '_omPlayAlert', type: 'audioError', error: e.message,
      }, 'order-manager');
    }
  },
  omElapsedMinutes(order) {
    // 1. Adicionada a checagem "!order" para evitar o erro Cannot read properties of null
    if (!order || !order.timestamp) return null;

    const min = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    if (min < 1) return 'Agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    return `${h}h${min % 60 > 0 ? String(min % 60).padStart(2, '0') : ''}`;
  },

  omElapsedColor(order) {
    // 2. Adicionada a checagem "!order" para evitar o erro Cannot read properties of null
    if (!order || !order.timestamp) return '';

    const min = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
    if (min < 10) return 'color:#22c55e';
    if (min < 25) return 'color:#f59e0b';
    return 'color:#ef4444';
  },
}