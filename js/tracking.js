/* ═══════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/tracking.js
   Módulo de acompanhamento de pedido
════════════════════════════════════════════════════════════ */

const appTracking = {

  /* ── State ─────────────────────────────────────────────── */
  showOrderTracking:   false,
  trackingOrder:       null,
  trackingOrderNumber: '',
  trackingError:       '',
  trackingRefreshing:  false,
  trackingStatusNote:  '',

  /* ── Definição dos status ───────────────────────────────── */
  trackingStatusMap: {
    paid:             { id: 'paid',             label: 'Pago',                  short: 'Pago',      emoji: '✅' },
    preparing:        { id: 'preparing',        label: 'Em Preparação',         short: 'Preparo',   emoji: '👨‍🍳' },
    out_for_delivery: { id: 'out_for_delivery', label: 'Saiu para Entrega',     short: 'A caminho', emoji: '🛵' },
    ready_for_pickup: { id: 'ready_for_pickup', label: 'Pronto para Retirada',  short: 'Pronto',    emoji: '🏃' },
    delivered:        { id: 'delivered',        label: 'Entregue',              short: 'Entregue',  emoji: '🎉' },
    cancelled:        { id: 'cancelled',        label: 'Cancelado',             short: 'Cancelado', emoji: '❌' },
  },

  get trackingStatuses() {
    return [
      this.trackingStatusMap.paid,
      this.trackingStatusMap.preparing,
      this.trackingStatusMap.out_for_delivery,
      this.trackingStatusMap.ready_for_pickup,
      this.trackingStatusMap.delivered,
      this.trackingStatusMap.cancelled,
    ];
  },

  /* ── Steps exibidos na barra de progresso ──────────────── */
  trackingStepsFor(deliveryType) {
    if (deliveryType === 'pickup') {
      return [
        this.trackingStatusMap.paid,
        this.trackingStatusMap.preparing,
        this.trackingStatusMap.ready_for_pickup,
        this.trackingStatusMap.delivered,
      ];
    }
    return [
      this.trackingStatusMap.paid,
      this.trackingStatusMap.preparing,
      this.trackingStatusMap.out_for_delivery,
      this.trackingStatusMap.delivered,
    ];
  },

  /* ── Verifica se um status já foi atingido ─────────────── */
  isStatusReached(stepId, currentStatus) {
    const order            = ['paid', 'preparing', 'out_for_delivery', 'ready_for_pickup', 'delivered'];
    const cancelledReached = currentStatus === 'cancelled';
    if (cancelledReached) return stepId === 'cancelled';
    return order.indexOf(stepId) <= order.indexOf(currentStatus);
  },

  /* ── Descrição contextual do status ────────────────────── */
  trackingStatusDescription(status, deliveryType) {
    const map = {
      paid:             'Recebemos seu pedido! A loja já foi notificada.',
      preparing:        'Nossa cozinha está preparando tudo com carinho. 🍳',
      out_for_delivery: 'Seu pedido está a caminho! Fique de olho. 🛵',
      ready_for_pickup: 'Seu pedido está pronto! Pode vir buscar. 🏃',
      delivered:        deliveryType === 'pickup'
        ? 'Pedido retirado. Bom apetite! 🎉'
        : 'Pedido entregue. Bom apetite! 🎉',
      cancelled: 'Este pedido foi cancelado. Entre em contato para mais informações.',
    };
    return map[status] ?? '';
  },

  /* ── Abrir painel com pedido específico ─────────────────── */
  openTracking(order) {
    this.trackingOrder       = order;
    this.trackingError       = '';
    this.trackingOrderNumber = '';
    this.showOrderTracking   = true;
  },

  /* ── Fechar painel ──────────────────────────────────────── */
  closeTracking() {
    this.showOrderTracking = false;
    setTimeout(() => {
      this.trackingOrder       = null;
      this.trackingError       = '';
      this.trackingOrderNumber = '';
    }, 300);
  },

  /* ── Busca por número de pedido ─────────────────────────── */
  lookupOrder() {
    const num = this.trackingOrderNumber.trim();
    if (!num) { this.trackingError = 'Digite o número do pedido.'; return; }

    const found = this.orderHistory.find(
      o => o.orderNumber === num || o.orderNumber === num.replace(/^#/, ''),
    );
    if (!found) {
      this.trackingError = `Pedido "${num}" não encontrado.`;
      return;
    }
    this.trackingError = '';
    this.openTracking(found);
  },

  /* ── Atualiza dados do pedido ativo da memória ──────────── */
  async refreshTracking() {
    if (!this.trackingOrder) return;
    this.trackingRefreshing = true;
    try {
      const fresh = this.orderHistory.find(o => o.uuid === this.trackingOrder.uuid);
      if (fresh) this.trackingOrder = { ...fresh };
    } finally {
      await new Promise(r => setTimeout(r, 600));
      this.trackingRefreshing = false;
    }
  },

  /* ── Admin: muda status e registra na timeline ──────────── */
  //
  // FIX: substituído `await db.orders.put()` (Dexie — API removida) por
  // `await this.updateOrder()` (Firebase Firestore, via database.js).
  // O updateOrder já:
  //   1. Persiste no Firestore com merge:true
  //   2. Atualiza this.orderHistory via splice (preserva reatividade Alpine)
  //
  // Removido o splice manual que duplicava o update local.
  // Mantidas as atualizações de estado local (trackingOrder, omSelectedOrder)
  // para UX imediata antes do onSnapshot confirmar.
  async updateOrderStatus(order, newStatus) {
    if (!order) return;
    const statusInfo = this.trackingStatusMap[newStatus];
    if (!statusInfo) return;

    try {
      // Trabalha em cópia profunda — nunca muta o objeto Proxy do Alpine diretamente.
      const updated = JSON.parse(JSON.stringify(order));

      if (!updated.timeline) updated.timeline = [];
      const event = {
        status:    newStatus,
        label:     statusInfo.label,
        emoji:     statusInfo.emoji,
        note:      this.trackingStatusNote.trim(),
        timestamp: new Date().toISOString(),
        updatedBy: 'admin',
      };
      updated.timeline.push(event);
      updated.currentStatus = newStatus;
      updated.updatedAt     = event.timestamp;

      // Persiste no Firestore + atualiza this.orderHistory (via database.js)
      await this.updateOrder(updated);

      // Atualiza views locais imediatamente (UX responsiva, onSnapshot confirma logo após)
      this.trackingOrder      = { ...updated };
      this.trackingStatusNote = '';

      // Sincroniza o detalhe do Gestor de Pedidos se o mesmo pedido estiver aberto
      if (this.omSelectedOrder?.uuid === updated.uuid) {
        this.omSelectedOrder = { ...updated };
      }

      await this.addAudit('ORDER_STATUS_CHANGED', {
        orderNumber: updated.orderNumber,
        newStatus,
        label: statusInfo.label,
      });

      this.showToast(`Status: ${statusInfo.label} ${statusInfo.emoji}`, 'success', statusInfo.emoji);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'updateOrderStatus', type: 'trackingError',
        orderNumber: order?.orderNumber || null, newStatus,
      }, 'tracking');
      this.showToast('Erro ao atualizar status do pedido.', 'error', '❌');
    }
  },

  /* ── Botão "Falar com a loja" ───────────────────────────── */
  contactStoreWhatsApp() {
    const phone = (this.config?.whatsapp ?? '').replace(/\D/g, '');
    if (!phone) {
      this.showToast('WhatsApp da loja não configurado.', 'error', '⚠️');
      return;
    }

    let msg = `Olá, ${this.config.restaurantName}! 👋\n`;
    if (this.trackingOrder) {
      msg += `Preciso de ajuda com o meu pedido *#${this.trackingOrder.orderNumber}*`;
      msg += ` (${this.trackingOrder.date} às ${this.trackingOrder.time}).`;
    } else {
      msg += `Gostaria de falar sobre um pedido.`;
    }

    this.logInfo('Cliente abriu contato WhatsApp com a loja', {
      source:      'contactStoreWhatsApp',
      type:        'clientContact',
      orderNumber: this.trackingOrder?.orderNumber || null,
      orderUuid:   this.trackingOrder?.uuid        || null,
    }, 'tracking');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  },
};