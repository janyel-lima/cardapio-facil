const appAdmin = {

  // ── Estado: confirmação de limpeza de histórico ────────────────────────────
  showClearHistoryConfirm:    false,
  clearHistoryPassword:       '',
  clearHistoryPasswordError:  '',

  // ── Segurança ──────────────────────────────────────────────────────────────
  

  

  

  

  

  // ── Auditoria ──────────────────────────────────────────────────────────────
  async addAudit(action, data = {}) {
    const BUSINESS_EVENTS = new Set([
      'ORDER_PLACED', 'ORDER_STATUS_CHANGED', 'ORDER_EDITED',
      'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED',
      'CATEGORY_CREATED', 'CATEGORY_DELETED', 'CATEGORY_TOGGLED',
      'PROMO_CREATED', 'PROMO_DELETED', 'CONFIG_SAVED', 'COUPON_APPLIED',
      'EXPORT_EXCEL', 'EXPORT_CSV', 'EXPORT_JSON', 'EXPORT_PRINT',
      'DAY_CLOSED', 'HISTORY_CLEARED',
    ]);
    if (!BUSINESS_EVENTS.has(action)) return;

    try {
      if (!Array.isArray(this.auditLog)) {
        this.logWarn('auditLog não é array — entrada de auditoria ignorada', { source: 'addAudit', type: 'auditStateError', action }, 'admin');
        return;
      }
      const lastEntry  = this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1] : null;
      const prevHash   = lastEntry ? lastEntry.hash : '00000000';
      const entry      = { id: this.uuid(), timestamp: new Date().toISOString(), action, data };
      entry.hash       = this.djb2Hash(
        prevHash + JSON.stringify({ id: entry.id, timestamp: entry.timestamp, action, data }),
      );
      this.auditLog.push(entry);
      await db.auditLog.put(entry);
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'addAudit', type: 'auditWriteError', action }, 'admin');
    }
  },

  verifyAuditIntegrity() {
    if (!Array.isArray(this.auditLog)) return true;
    for (let i = 0; i < this.auditLog.length; i++) {
      const entry    = this.auditLog[i];
      const prevHash = i === 0 ? '00000000' : this.auditLog[i - 1].hash;
      const expected = this.djb2Hash(
        prevHash + JSON.stringify({
          id:        entry.id,
          timestamp: entry.timestamp,
          action:    entry.action,
          data:      entry.data,
        }),
      );
      if (expected !== entry.hash) return false;
    }
    return true;
  },

  verifyOrderHash(order) {
    if (!order || !order.hash || !order.uuid) return false;
    const expected = this.djb2Hash(String(order.uuid) + String(order.total) + String(order.name));
    return expected === order.hash;
  },

  _normalizeOrderDate(order) {
    if (order.date && /^\d{2}\/\d{2}\/\d{4}$/.test(order.date)) return order.date;
    if (order.timestamp) {
      try { return new Date(order.timestamp).toLocaleDateString('pt-BR'); } catch (e) { /* fallthrough */ }
    }
    if (order.date) {
      try { return new Date(order.date).toLocaleDateString('pt-BR'); } catch (e) { /* fallthrough */ }
    }
    return '';
  },

  _refreshEditingProduct() {
    this.editingProduct = {
      ...this.editingProduct,
      complements: (this.editingProduct.complements || []).map(g => ({
        ...g, options: [...(g.options || [])],
      })),
    };
  },

  // ── Admin CRUD ─────────────────────────────────────────────────────────────
  async addCategory() {
    if (!this.newCategory.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    try {
      const cat = {
        id:     this.newCategory.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
        name:   this.newCategory.name.trim(),
        icon:   this.newCategory.icon || '📦',
        active: true,
      };
      this.categories.push(cat);
      this.newCategory = { name: '', icon: '' };
      await this.saveCategories();
      await this.addAudit('CATEGORY_CREATED', { name: cat.name, id: cat.id });
      this.showToast('Categoria adicionada!', 'success', '🏷️');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'addCategory', type: 'adminWriteError', categoryName: this.newCategory?.name || null }, 'admin');
      this.showToast('Erro ao adicionar categoria.', 'error', '❌');
    }
  },

  async deleteCategory(index) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      const cat = this.categories[index];
      this.categories.splice(index, 1);
      await this.saveCategories();
      await this.addAudit('CATEGORY_DELETED', { name: cat.name, id: cat.id });
      this.showToast(`Categoria "${cat.name}" removida.`, 'success', '🗑️');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'deleteCategory', type: 'adminWriteError' }, 'admin');
      this.showToast('Erro ao excluir categoria.', 'error', '❌');
    }
  },

  async toggleCategory(cat) {
    try {
      const willBeActive = !cat.active;
      const catIdx       = this.categories.findIndex(c => c.id === cat.id);
      if (catIdx === -1) return;

      // FIX: splice em vez de reatribuição — preserva a referência do Proxy Alpine.
      // this.categories = [...this.categories]  →  substitui a ref, quebra reatividade.
      // splice(catIdx, 1, novoItem)  →  muta in-place, ref permanece a mesma.
      this.categories.splice(catIdx, 1, { ...this.categories[catIdx], active: willBeActive });

      let affectedCount = 0;
      this.items.forEach((item, i) => {
        if (item.category !== cat.id) return;
        affectedCount++;
        if (!willBeActive) {
          this.items.splice(i, 1, { ...item, _wasAvailable: item.available, available: false });
        } else {
          const { _wasAvailable, ...rest } = item;
          this.items.splice(i, 1, { ...rest, available: _wasAvailable !== undefined ? _wasAvailable : true });
        }
      });

      await this.saveCategories();
      if (affectedCount > 0) await this.saveItems();
      await this.addAudit('CATEGORY_TOGGLED', {
        id:               cat.id,
        name:             cat.name,
        active:           willBeActive,
        affectedProducts: affectedCount,
      });

      const label = willBeActive ? 'ativada' : 'desativada';
      this.showToast(
        `"${cat.name}" ${label} • ${affectedCount} produto(s) ${willBeActive ? 'reativado(s)' : 'desativado(s)'}`,
        willBeActive ? 'success' : 'error',
        willBeActive ? '✅' : '🔕',
      );
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'toggleCategory', type: 'adminWriteError', catId: cat?.id || null, catName: cat?.name || null }, 'admin');
      this.showToast('Erro ao alterar categoria.', 'error', '❌');
    }
  },

  getCategoryName(catId) {
    const cat = this.categories.find(c => c.id === catId);
    return cat ? `${cat.icon} ${cat.name}` : catId;
  },

  openProductForm(item) {
    if (item) {
      this.editingProduct = JSON.parse(JSON.stringify(item));
      if (!this.editingProduct.complements)    this.editingProduct.complements = [];
      if (this.editingProduct.promoId === undefined) this.editingProduct.promoId = null;
    } else {
      this.editingProduct = {
        name: '', desc: '', price: 0, promoPrice: null, promoId: null,
        category:   this.categories[0]?.id || '',
        image:      '',
        available:  true,
        featured:   false,
        complements: [],
      };
    }
    this.newGroup       = { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] };
    this.newGroupOption = { name: '', price: 0 };
    this.showProductForm = true;
  },

  addComplementGroup() {
    if (!this.newGroup.name.trim()) { this.showToast('Informe o nome do grupo', 'error', '⚠️'); return; }
    if (!this.editingProduct.complements) this.editingProduct.complements = [];
    this.editingProduct.complements.push({
      id:       this.uuid(),
      name:     this.newGroup.name.trim(),
      type:     this.newGroup.type,
      required: this.newGroup.required,
      min:      this.newGroup.min  || 0,
      max:      this.newGroup.max  || 3,
      options:  [],
    });
    this._refreshEditingProduct();
    this.newGroup = { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] };
  },

  addComplementOption(groupIdx, nameParam, priceParam) {
    const name  = (nameParam  !== undefined ? String(nameParam)      : this.newGroupOption.name).trim();
    const price = (priceParam !== undefined ? parseFloat(priceParam) : parseFloat(this.newGroupOption.price)) || 0;
    if (!name) { this.showToast('Informe o nome da opção', 'error', '⚠️'); return; }
    if (!this.editingProduct.complements?.[groupIdx]) return;
    this.editingProduct.complements[groupIdx].options.push({ id: this.uuid(), name, price });
    this._refreshEditingProduct();
    this.newGroupOption = { name: '', price: 0 };
  },

  removeComplementOption(groupIdx, optIdx) {
    this.editingProduct.complements[groupIdx].options.splice(optIdx, 1);
    this._refreshEditingProduct();
  },

  removeComplementGroup(groupIdx) {
    this.editingProduct.complements.splice(groupIdx, 1);
    this._refreshEditingProduct();
  },

  async saveProduct() {
    if (!this.editingProduct.name.trim())                              { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    if (!this.editingProduct.price || this.editingProduct.price <= 0) { this.showToast('Preço inválido', 'error', '⚠️'); return; }

    try {
      if (this.editingProduct.promoId) {
        const linkedPromo = this.promotions.find(p => p.id === this.editingProduct.promoId);
        if (linkedPromo && linkedPromo.active &&
            (linkedPromo.type === 'percentage' || linkedPromo.type === 'fixed')) {
          if (linkedPromo.type === 'percentage') {
            this.editingProduct.promoPrice =
              +(this.editingProduct.price * (1 - linkedPromo.value / 100)).toFixed(2);
          } else {
            this.editingProduct.promoPrice =
              +Math.max(0, this.editingProduct.price - linkedPromo.value).toFixed(2);
          }
        } else {
          this.editingProduct.promoId    = null;
          this.editingProduct.promoPrice = null;
        }
      } else if (!this.editingProduct.promoPrice || this.editingProduct.promoPrice <= 0) {
        this.editingProduct.promoPrice = null;
      }

      if (!this.editingProduct.complements) this.editingProduct.complements = [];

      const isNew = !this.editingProduct.id;
      if (isNew) {
        this.editingProduct.id = Date.now();
        this.items.push({ ...this.editingProduct });
        await this.addAudit('PRODUCT_CREATED', {
          name:       this.editingProduct.name,
          price:      this.editingProduct.price,
          promoId:    this.editingProduct.promoId,
          promoPrice: this.editingProduct.promoPrice,
        });
        this.showToast('Produto adicionado!', 'success', '➕');
      } else {
        const idx = this.items.findIndex(i => i.id === this.editingProduct.id);
        if (idx !== -1) this.items.splice(idx, 1, { ...this.editingProduct });
        await this.addAudit('PRODUCT_UPDATED', {
          name:       this.editingProduct.name,
          id:         this.editingProduct.id,
          promoId:    this.editingProduct.promoId,
          promoPrice: this.editingProduct.promoPrice,
        });
        this.showToast('Produto atualizado!', 'success', '✏️');
      }

      await this.saveItems();
      this.showProductForm = false;
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveProduct', type: 'adminWriteError',
        productName: this.editingProduct?.name || null,
        productId:   this.editingProduct?.id   || null,
      }, 'admin');
      this.showToast('Erro ao salvar produto.', 'error', '❌');
    }
  },

  async deleteProduct(index) {
    if (!confirm('Excluir este produto?')) return;
    try {
      const item = this.items[index];
      this.items.splice(index, 1);
      await this.saveItems();
      await this.addAudit('PRODUCT_DELETED', { name: item.name, id: item.id });
      this.showToast('Produto removido', 'success', '🗑️');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'deleteProduct', type: 'adminWriteError',
      }, 'admin');
      this.showToast('Erro ao excluir produto.', 'error', '❌');
    }
  },

  // ── Promoções ──────────────────────────────────────────────────────────────
  async addPromo() {
    if (!this.newPromo.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    if (this.newPromo.type === 'coupon' && !this.newPromo.code.trim()) {
      this.showToast('Informe o código', 'error', '⚠️'); return;
    }
    try {
      const promoScope =
        (this.newPromo.type === 'coupon' || this.newPromo.type === 'freeDelivery')
          ? 'cart'
          : (this.newPromo.scope || 'cart');
      const promo = {
        id:       Date.now(),
        name:     this.newPromo.name.trim(),
        type:     this.newPromo.type,
        scope:    promoScope,
        value:    this.newPromo.value    || 0,
        code:     this.newPromo.code.trim().toUpperCase(),
        minOrder: this.newPromo.minOrder || 0,
        expiresAt: this.newPromo.expiresAt,
        active:   true,
      };
      this.promotions.push(promo);
      this.newPromo = { name: '', type: 'percentage', scope: 'cart', value: 0, code: '', minOrder: 0, expiresAt: '' };
      await this.savePromotions();
      await this.addAudit('PROMO_CREATED', {
        name:  promo.name,
        type:  promo.type,
        scope: promo.scope,
        value: promo.value,
        code:  promo.code,
      });
      this.showToast('Promoção criada!', 'success', '🔥');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'addPromo', type: 'adminWriteError',
        promoName: this.newPromo?.name || null, promoType: this.newPromo?.type || null,
      }, 'admin');
      this.showToast('Erro ao criar promoção.', 'error', '❌');
    }
  },

  async deletePromo(index) {
    try {
      const promo         = this.promotions[index];
      const affectedItems = this.items.filter(i => i.promoId === promo.id);

      if (affectedItems.length > 0) {
        // FIX: this.items.map() retornava um array novo — substituição de ref.
        // forEach + splice muta in-place, preservando a referência.
        this.items.forEach((item, i) => {
          if (item.promoId === promo.id) {
            this.items.splice(i, 1, { ...item, promoId: null, promoPrice: null });
          }
        });
        await this.saveItems();
      }

      this.promotions.splice(index, 1);
      await this.savePromotions();
      await this.addAudit('PROMO_DELETED', {
        name:          promo.name,
        id:            promo.id,
        affectedItems: affectedItems.length,
      });

      if (affectedItems.length > 0) {
        this.showToast(
          `"${promo.name}" removida · ${affectedItems.length} produto(s) desvinculado(s)`,
          'error', '🗑️',
        );
      } else {
        this.showToast(`"${promo.name}" removida`, 'success', '🗑️');
      }
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'deletePromo', type: 'adminWriteError',
      }, 'admin');
      this.showToast('Erro ao excluir promoção.', 'error', '❌');
    }
  },

  async togglePromo(promo) {
    try {
      const idx = this.promotions.findIndex(p => p.id === promo.id);
      if (idx === -1) return;
      const willBeActive = !promo.active;

      // FIX: splice em vez de reatribuição.
      // this.promotions[idx] = {...}; this.promotions = [...this.promotions]
      // → substituía a ref inteira, invalidando o tracking Alpine.
      // splice(idx, 1, novoItem) → muta in-place, ref permanece a mesma.
      this.promotions.splice(idx, 1, { ...this.promotions[idx], active: willBeActive });

      const linked = this.items.filter(i => i.promoId === promo.id);
      if (linked.length > 0) {
        // FIX: idem — this.items.map() retorna array novo.
        // forEach + splice muta in-place.
        this.items.forEach((item, i) => {
          if (item.promoId !== promo.id) return;
          if (!willBeActive) {
            this.items.splice(i, 1, { ...item, promoPrice: null });
          } else {
            let pp = null;
            if (promo.type === 'percentage') pp = +(item.price * (1 - promo.value / 100)).toFixed(2);
            else if (promo.type === 'fixed')  pp = +Math.max(0, item.price - promo.value).toFixed(2);
            this.items.splice(i, 1, { ...item, promoPrice: pp });
          }
        });
        await this.saveItems();
      }

      await this.savePromotions();
      const label = willBeActive ? 'ativada' : 'desativada';
      this.showToast(
        `"${promo.name}" ${label}${linked.length > 0
          ? ` · ${linked.length} produto(s) ${willBeActive ? 'com desconto' : 'sem desconto'}`
          : ''}`,
        willBeActive ? 'success' : 'error',
        willBeActive ? '🔥' : '🔕',
      );
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'togglePromo', type: 'adminWriteError',
        promoId: promo?.id || null, promoName: promo?.name || null,
      }, 'admin');
      this.showToast('Erro ao alterar promoção.', 'error', '❌');
    }
  },

  get itemScopePromos() {
    return this.promotions.filter(p =>
      p.active &&
      (p.scope === 'item' || !p.scope) &&
      (p.type === 'percentage' || p.type === 'fixed'),
    );
  },

  onEditingPromoChange() {
    const promoId = Number(this.editingProduct.promoId) || this.editingProduct.promoId;
    const promo   = promoId ? this.promotions.find(p => p.id === promoId) : null;
    if (promo && this.editingProduct.price > 0) {
      if (promo.type === 'percentage')
        this.editingProduct.promoPrice = +(this.editingProduct.price * (1 - promo.value / 100)).toFixed(2);
      else if (promo.type === 'fixed')
        this.editingProduct.promoPrice = +Math.max(0, this.editingProduct.price - promo.value).toFixed(2);
      else
        this.editingProduct.promoPrice = null;
    } else {
      this.editingProduct.promoPrice = null;
    }
  },

  get editingProductPromoPreview() {
    if (!this.editingProduct?.promoId || !this.editingProduct?.price) return null;
    const promo = this.promotions.find(p => p.id === this.editingProduct.promoId && p.active);
    if (!promo) return null;
    if (promo.type === 'percentage') return +(this.editingProduct.price * (1 - promo.value / 100)).toFixed(2);
    if (promo.type === 'fixed')      return +Math.max(0, this.editingProduct.price - promo.value).toFixed(2);
    return null;
  },

  computeItemPromoPrice(item) {
    if (!item.promoId) return null;
    const promo = this.promotions.find(p => p.id === item.promoId && p.active);
    if (!promo) return null;
    if (promo.type === 'percentage') return +(item.price * (1 - promo.value / 100)).toFixed(2);
    if (promo.type === 'fixed')      return +Math.max(0, item.price - promo.value).toFixed(2);
    return null;
  },

  // ── Limpar histórico ───────────────────────────────────────────────────────
  promptClearHistory() {
    this.clearHistoryPassword      = '';
    this.clearHistoryPasswordError = '';
    this.showClearHistoryConfirm   = true;
  },

  async clearOrderHistory() { this.promptClearHistory(); },

  async confirmClearHistory() {
    if (!this.clearHistoryPassword) {
      this.clearHistoryPasswordError = 'Digite a senha do admin para confirmar.';
      return;
    }
    if (this.clearHistoryPassword !== this.config.adminPass) {
      this.clearHistoryPasswordError = 'Senha incorreta. Tente novamente.';
      this.clearHistoryPassword      = '';
      return;
    }

    try {
      this.showClearHistoryConfirm   = false;
      this.clearHistoryPassword      = '';
      this.clearHistoryPasswordError = '';
      this.orderHistory.splice(0);
      await db.orders.clear();
      await this.addAudit('HISTORY_CLEARED', {});
      this.showToast('Histórico apagado com sucesso', 'success', '🗑️');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'confirmClearHistory', type: 'adminWriteError' }, 'admin');
      this.showToast('Erro ao limpar histórico.', 'error', '❌');
    }
  },

  // ── Relatórios ─────────────────────────────────────────────────────────────
  getTopProducts(orders) {
    const map = {};
    (orders || []).forEach(o => {
      (o.items || []).forEach(item => {
        if (!item?.name) return;
        if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, total: 0 };
        map[item.name].qty   += (item.qty   || 0);
        map[item.name].total += (item.total || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
  },

  get todayStats() {
    const _normalizeDate = typeof this._normalizeOrderDate === 'function'
      ? this._normalizeOrderDate.bind(this)
      : appAdmin._normalizeOrderDate.bind(this);
    const _getTop = typeof this.getTopProducts === 'function'
      ? this.getTopProducts.bind(this)
      : appAdmin.getTopProducts.bind(this);

    try {
      const today   = new Date().toLocaleDateString('pt-BR');
      const orders  = (this.orderHistory || []).filter(o => _normalizeDate(o) === today);
      const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
      return {
        date:      today,
        orders:    orders.length,
        revenue,
        avgTicket: orders.length > 0 ? revenue / orders.length : 0,
        byPayment: {
          pix:  orders.filter(o => o.payment === 'pix' ).reduce((s, o) => s + (o.total || 0), 0),
          card: orders.filter(o => o.payment === 'card').reduce((s, o) => s + (o.total || 0), 0),
          cash: orders.filter(o => o.payment === 'cash').reduce((s, o) => s + (o.total || 0), 0),
        },
        topProducts: _getTop(orders),
        rawOrders:   orders,
      };
    } catch (e) {
      this.logError(e.message || String(e), { stack: e.stack || null, source: 'todayStats', type: 'statsComputeError' }, 'admin');
      return {
        date: new Date().toLocaleDateString('pt-BR'),
        orders: 0, revenue: 0, avgTicket: 0,
        byPayment: { pix: 0, card: 0, cash: 0 },
        topProducts: [], rawOrders: [],
      };
    }
  },

  get allTimeStats() {
    const _normalizeDate = typeof this._normalizeOrderDate === 'function'
      ? this._normalizeOrderDate.bind(this)
      : appAdmin._normalizeOrderDate.bind(this);
    const _getTop = typeof this.getTopProducts === 'function'
      ? this.getTopProducts.bind(this)
      : appAdmin.getTopProducts.bind(this);

    try {
      const all     = this.orderHistory || [];
      const revenue = all.reduce((s, o) => s + (o.total || 0), 0);
      const count   = all.length;
      const byDate  = {};
      all.forEach(o => {
        const d = _normalizeDate(o);
        if (!d) return;
        if (!byDate[d]) byDate[d] = { date: d, orders: 0, revenue: 0 };
        byDate[d].orders++;
        byDate[d].revenue += (o.total || 0);
      });
      const sortedDates = Object.values(byDate).sort((a, b) => {
        const toMs = d => {
          const [dd, mm, yyyy] = d.split('/');
          return new Date(`${yyyy}-${mm}-${dd}`).getTime();
        };
        return toMs(a.date) - toMs(b.date);
      });
      return {
        totalRevenue: revenue,
        totalOrders:  count,
        avgTicket:    count > 0 ? revenue / count : 0,
        byDate:       sortedDates,
        topProducts:  _getTop(all),
      };
    } catch (e) {
      this.logError(e.message || String(e), { stack: e.stack || null, source: 'allTimeStats', type: 'statsComputeError' }, 'admin');
      return { totalRevenue: 0, totalOrders: 0, avgTicket: 0, byDate: [], topProducts: [] };
    }
  },

  async exportExcel() {
    if (typeof XLSX === 'undefined') { this.showToast('Biblioteca XLSX não carregada', 'error', '❌'); return; }
    try {
      const today   = this.todayStats;
      const allOrds = this.orderHistory || [];
      const wb      = XLSX.utils.book_new();
      const n       = v => (typeof v === 'number' ? v : 0);

      const promoTypeLabel = { percentage: '% desconto', fixed: 'R$ desconto', freeDelivery: 'Frete grátis', coupon: 'Cupom' };
      const payLabel       = { pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };

      const dayGross    = today.rawOrders.reduce((s, o) => s + n(o.originalSubtotal || o.subtotal), 0);
      const dayItemDisc = today.rawOrders.reduce((s, o) => s + n(o.itemDiscounts), 0);
      const dayCartDisc = today.rawOrders.reduce((s, o) => s + n(o.discount), 0);
      const dayDelivery = today.rawOrders.reduce((s, o) => s + n(o.deliveryFee), 0);

      const ws1 = XLSX.utils.aoa_to_sheet([
        ['RELATÓRIO CONTÁBIL — FECHAMENTO DO DIA', ''],
        ['', ''],
        ['Data:', today.date],
        ['Gerado em:', new Date().toLocaleString('pt-BR')],
        ['', ''],
        ['── DRE DO DIA ──', ''],
        ['Receita Bruta (subtotais sem descontos)', dayGross],
        ['(−) Descontos de Item (promoções vinculadas por produto)', -dayItemDisc],
        ['(−) Descontos de Carrinho (promos automáticas + cupons)', -dayCartDisc],
        ['(+) Taxas de Entrega cobradas', dayDelivery],
        ['(=) Receita Líquida', today.revenue],
        ['', ''],
        ['── OPERACIONAL ──', ''],
        ['Pedidos no Dia', today.orders],
        ['Pedidos c/ Desconto de Item', today.rawOrders.filter(o => n(o.itemDiscounts) > 0).length],
        ['Pedidos c/ Desconto de Carrinho', today.rawOrders.filter(o => n(o.discount) > 0).length],
        ['Ticket Médio (líquido)', today.avgTicket],
        ['', ''],
        ['── POR FORMA DE PAGAMENTO ──', ''],
        ['PIX',      today.byPayment.pix],
        ['Cartão',   today.byPayment.card],
        ['Dinheiro', today.byPayment.cash],
        ['', ''],
        ['── HISTÓRICO GERAL ──', ''],
        ['Total de Pedidos (histórico)', allOrds.length],
        ['Receita Líquida Total', allOrds.reduce((s, o) => s + n(o.total), 0)],
        ['Total Desconto de Item', allOrds.reduce((s, o) => s + n(o.itemDiscounts), 0)],
        ['Total Desconto de Carrinho', allOrds.reduce((s, o) => s + n(o.discount), 0)],
        ['Total Descontos Combinados', allOrds.reduce((s, o) => s + n(o.itemDiscounts) + n(o.discount), 0)],
      ]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumo Contábil');

      const ws2 = XLSX.utils.aoa_to_sheet([
        ['UUID', 'Nº Pedido', 'Data', 'Hora', 'Cliente', 'Tel', 'Pagamento', 'Tipo',
          'Bruto (orig.)', 'Desc. Item', 'Desc. Carrinho', 'Entrega', 'Total Líquido',
          'Cupom', 'Promos Carrinho', 'Hash', 'Integridade'],
        ...today.rawOrders.map(o => {
          const promoNames = (o.appliedPromos || []).map(p => p.name).join('; ');
          const integrity  = this.verifyOrderHash(o) ? 'íntegro' : 'ADULTERADO';
          return [
            o.uuid || '-', o.orderNumber || '-', o.date || '-', o.time || '-',
            o.name || '-', o.phone || '-',
            payLabel[o.payment] || o.payment || '-', o.deliveryType || '-',
            n(o.originalSubtotal || o.subtotal), n(o.itemDiscounts), n(o.discount),
            n(o.deliveryFee), n(o.total), o.coupon || '—', promoNames || '—',
            o.hash || '-', integrity,
          ];
        }),
      ]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos do Dia');

      const itemRows3 = [];
      today.rawOrders.forEach(o => {
        (o.items || []).forEach(item => {
          itemRows3.push([
            o.orderNumber || '-', o.uuid || '-', o.date || '-', o.name || '-',
            item.name || '-', item.qty || 0,
            n(item.originalPrice || item.unitPrice), n(item.unitPrice),
            n(item.itemDiscountAmount),
            item.itemPromoType ? (item.itemPromoType === 'percentage' ? item.itemPromoValue + '%' : 'R$ ' + item.itemPromoValue) : '—',
            item.itemPromoId || '—', item.itemPromoName || '—',
            promoTypeLabel[item.itemPromoType] || '—',
            n(item.complementsTotal), n(item.total), item.note || '', o.orderNumber || '-',
          ]);
        });
      });
      const ws3 = XLSX.utils.aoa_to_sheet([
        ['Nº Pedido', 'UUID Pedido', 'Data', 'Cliente', 'Item', 'Qtd',
          'Preço Original (tabela)', 'Preço c/ Promo Item', 'Desc. Item (total)',
          'Percentual/Fixo Desc.', 'ID Promoção Item', 'Nome Promoção Item', 'Tipo Promoção Item',
          'Complementos', 'Total Item', 'Obs.', 'Ref. Pedido → Aba Pedidos'],
        ...itemRows3,
      ]);
      XLSX.utils.book_append_sheet(wb, ws3, 'Itens Detalhados');

      const ws4 = XLSX.utils.aoa_to_sheet([
        ['#', 'Produto', 'Qtd Vendida', 'Faturamento (líquido)', '% Receita'],
        ...today.topProducts.map((p, i) => [
          i + 1, p.name, p.qty, p.total,
          today.revenue > 0 ? (p.total / today.revenue * 100).toFixed(1) + '%' : '0%',
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, ws4, 'Ranking Produtos');

      const ws5 = XLSX.utils.aoa_to_sheet([
        ['UUID', 'Nº Pedido', 'Data', 'Hora', 'Cliente', 'Pagamento',
          'Bruto (orig.)', 'Desc. Item', 'Desc. Carrinho', 'Entrega', 'Total', 'Cupom'],
        ...allOrds.map(o => [
          o.uuid || '-', o.orderNumber || '-', this._normalizeOrderDate(o), o.time || '-',
          o.name || '-', payLabel[o.payment] || o.payment || '-',
          n(o.originalSubtotal || o.subtotal), n(o.itemDiscounts), n(o.discount),
          n(o.deliveryFee), n(o.total), o.coupon || '—',
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, ws5, 'Histórico Geral');

      const promoUsage = {};
      allOrds.forEach(o => {
        (o.items || []).forEach(item => {
          if (!item.itemPromoId) return;
          const key = String(item.itemPromoId);
          if (!promoUsage[key]) promoUsage[key] = { name: item.itemPromoName || key, scope: 'item', uses: 0, ordersSet: new Set(), totalDiscount: 0 };
          promoUsage[key].uses++;
          promoUsage[key].ordersSet.add(o.orderNumber);
          promoUsage[key].totalDiscount += n(item.itemDiscountAmount);
        });
        (o.appliedPromos || []).forEach(p => {
          const key = String(p.id);
          if (!promoUsage[key]) promoUsage[key] = { name: p.name || key, scope: 'cart', uses: 0, ordersSet: new Set(), totalDiscount: 0 };
          promoUsage[key].uses++;
          promoUsage[key].ordersSet.add(o.orderNumber);
          promoUsage[key].totalDiscount += n(p.discountAmount);
        });
        if (o.coupon) {
          const key = 'CUP_' + o.coupon;
          if (!promoUsage[key]) promoUsage[key] = { name: 'Cupom: ' + o.coupon, scope: 'coupon', uses: 0, ordersSet: new Set(), totalDiscount: 0 };
          promoUsage[key].uses++;
          promoUsage[key].ordersSet.add(o.orderNumber);
          promoUsage[key].totalDiscount += n(o.couponDetail?.discountAmount || o.discount);
        }
      });

      const promoRows = (this.promotions || []).map(p => {
        const usageKey  = String(p.id);
        const couponKey = p.type === 'coupon' ? 'CUP_' + p.code : null;
        const u         = promoUsage[usageKey] || (couponKey ? promoUsage[couponKey] : null) || { uses: 0, ordersSet: new Set(), totalDiscount: 0 };
        const valueStr  = p.type === 'percentage' ? p.value + '%' : p.type === 'fixed' ? 'R$ ' + p.value : p.type === 'freeDelivery' ? 'Frete grátis' : p.type === 'coupon' ? p.code + ' (' + p.value + (p.type === 'percentage' ? '%)' : ' R$)') : '-';
        const linkedProducts = (this.items || []).filter(i => i.promoId === p.id).map(i => i.name).join('; ') || '—';
        return [p.id, p.name, promoTypeLabel[p.type] || p.type, p.scope || 'cart', valueStr, p.minOrder || 0, p.expiresAt || '—', p.active ? 'Ativa' : 'Inativa', linkedProducts, u.uses, u.ordersSet.size, u.totalDiscount];
      });
      const ws6 = XLSX.utils.aoa_to_sheet([
        ['ID', 'Nome', 'Tipo', 'Escopo', 'Benefício', 'Pedido Mínimo', 'Expira em', 'Status', 'Produtos Vinculados', 'Usos (itens/pedidos)', 'Pedidos Únicos', 'Desconto Total Gerado'],
        ...promoRows,
      ]);
      XLSX.utils.book_append_sheet(wb, ws6, 'Promoções');

      const catalogRows = (this.items || []).map(item => {
        const cat         = this.categories.find(c => c.id === item.category);
        const linkedPromo = item.promoId ? (this.promotions || []).find(p => p.id === item.promoId) : null;
        const discountPct = linkedPromo && item.promoPrice ? (((item.price - item.promoPrice) / item.price) * 100).toFixed(1) + '%' : '—';
        return [item.id, item.name, cat ? `${cat.icon} ${cat.name}` : item.category, item.price, item.promoPrice || '—', discountPct, item.promoId || '—', linkedPromo?.name || '—', linkedPromo?.type ? promoTypeLabel[linkedPromo.type] : '—', item.available ? 'Disponível' : 'Indisponível', item.featured ? 'Sim' : 'Não'];
      });
      const ws7 = XLSX.utils.aoa_to_sheet([
        ['ID Produto', 'Nome', 'Categoria', 'Preço Tabela', 'Preço c/ Promo', '% Desconto', 'ID Promoção Vinculada', 'Nome Promoção', 'Tipo Promoção', 'Disponibilidade', 'Destaque'],
        ...catalogRows,
      ]);
      XLSX.utils.book_append_sheet(wb, ws7, 'Catálogo Produtos');

      XLSX.writeFile(wb, `fechamento_${today.date.replace(/\//g, '-')}.xlsx`);
      await this.addAudit('EXPORT_EXCEL', { date: today.date, orders: today.orders, revenue: today.revenue, itemDiscounts: dayItemDisc, cartDiscounts: dayCartDisc, sheets: 7 });
      this.showToast('Excel exportado! (7 planilhas)', 'success', '📊');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'exportExcel', type: 'exportError', orders: this.todayStats?.orders || 0 }, 'admin');
      this.showToast('Erro ao exportar Excel.', 'error', '❌');
    }
  },

  async exportCSV() {
    try {
      const today = this.todayStats;
      const n     = v => (typeof v === 'number' ? v : 0);
      const q     = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['uuid','orderNumber','date','time','customer','phone','payment','deliveryType','originalSubtotal','itemDiscountsTotal','cartDiscount','totalDiscounts','deliveryFee','netTotal','couponCode','couponDiscount','cartPromoNames','hasItemPromo','itemPromoNames','itemCount','integrity'].map(q);
      const rows = today.rawOrders.map(o => {
        const cartPromoNames = (o.appliedPromos || []).map(p => p.name).join('; ');
        const couponDiscount = o.couponDetail?.discountAmount ?? 0;
        const itemPromoSet   = new Set((o.items || []).filter(i => i.itemPromoName).map(i => i.itemPromoName));
        const itemPromoNames = [...itemPromoSet].join('; ');
        const hasItemPromo   = itemPromoSet.size > 0;
        const totalDiscounts = n(o.itemDiscounts) + n(o.discount);
        const integrity      = this.verifyOrderHash(o) ? 'ok' : 'ADULTERADO';
        return [q(o.uuid||''),q(o.orderNumber||''),q(o.date||''),q(o.time||''),q(o.name||''),q(o.phone||''),q({pix:'PIX',card:'Cartão',cash:'Dinheiro'}[o.payment]||o.payment||''),q(o.deliveryType||''),n(o.originalSubtotal||o.subtotal),n(o.itemDiscounts),n(o.discount),totalDiscounts,n(o.deliveryFee),n(o.total),q(o.coupon||''),couponDiscount,q(cartPromoNames),q(hasItemPromo?'sim':'não'),q(itemPromoNames),(o.items||[]).length,q(integrity)].join(',');
      });
      const csv = [header.join(','), ...rows].join('\n');
      const a   = document.createElement('a');
      a.href    = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `pedidos_${today.date.replace(/\//g, '-')}.csv`;
      a.click();
      await this.addAudit('EXPORT_CSV', { date: today.date, orders: today.orders });
      this.showToast('CSV exportado!', 'success', '📄');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'exportCSV', type: 'exportError' }, 'admin');
      this.showToast('Erro ao exportar CSV.', 'error', '❌');
    }
  },

  async exportJSON() {
    try {
      const today   = this.todayStats;
      const allOrds = this.orderHistory || [];
      const n       = v => (typeof v === 'number' ? v : 0);
      const promoAnalytics = {};
      allOrds.forEach(o => {
        (o.items || []).forEach(item => {
          if (!item.itemPromoId) return;
          const k = String(item.itemPromoId);
          if (!promoAnalytics[k]) promoAnalytics[k] = { promoId: item.itemPromoId, promoName: item.itemPromoName, promoType: item.itemPromoType, promoValue: item.itemPromoValue, scope: 'item', totalItemUses: 0, affectedOrders: new Set(), totalDiscount: 0, affectedItems: [] };
          promoAnalytics[k].totalItemUses++;
          promoAnalytics[k].affectedOrders.add(o.orderNumber);
          promoAnalytics[k].totalDiscount += n(item.itemDiscountAmount);
          if (!promoAnalytics[k].affectedItems.includes(item.name)) promoAnalytics[k].affectedItems.push(item.name);
        });
        (o.appliedPromos || []).forEach(p => {
          const k = String(p.id);
          if (!promoAnalytics[k]) promoAnalytics[k] = { promoId: p.id, promoName: p.name, promoType: p.type, promoValue: p.value, scope: 'cart', totalItemUses: 0, affectedOrders: new Set(), totalDiscount: 0, affectedItems: [] };
          promoAnalytics[k].totalItemUses++;
          promoAnalytics[k].affectedOrders.add(o.orderNumber);
          promoAnalytics[k].totalDiscount += n(p.discountAmount);
        });
        if (o.coupon && o.couponDetail) {
          const k = 'coupon_' + o.coupon;
          if (!promoAnalytics[k]) promoAnalytics[k] = { promoId: k, promoName: 'Cupom: ' + o.coupon, couponCode: o.coupon, promoType: o.couponDetail.type, promoValue: o.couponDetail.value, scope: 'coupon', totalItemUses: 0, affectedOrders: new Set(), totalDiscount: 0, affectedItems: [] };
          promoAnalytics[k].totalItemUses++;
          promoAnalytics[k].affectedOrders.add(o.orderNumber);
          promoAnalytics[k].totalDiscount += n(o.couponDetail.discountAmount);
        }
      });
      Object.values(promoAnalytics).forEach(pa => { pa.affectedOrders = [...pa.affectedOrders]; });
      const payload = {
        _meta: { exportedAt: new Date().toISOString(), exportedBy: 'Cardápio Digital Pro', version: '3.0' },
        todaySummary: { date: today.date, orders: today.orders, originalSubtotal: today.rawOrders.reduce((s,o)=>s+n(o.originalSubtotal||o.subtotal),0), itemDiscounts: today.rawOrders.reduce((s,o)=>s+n(o.itemDiscounts),0), cartDiscounts: today.rawOrders.reduce((s,o)=>s+n(o.discount),0), totalDiscounts: today.rawOrders.reduce((s,o)=>s+n(o.itemDiscounts)+n(o.discount),0), deliveryRevenue: today.rawOrders.reduce((s,o)=>s+n(o.deliveryFee),0), netRevenue: today.revenue, avgTicket: today.avgTicket, byPayment: today.byPayment },
        allTimeSummary: { totalOrders: allOrds.length, totalGross: allOrds.reduce((s,o)=>s+n(o.originalSubtotal||o.subtotal),0), totalItemDisc: allOrds.reduce((s,o)=>s+n(o.itemDiscounts),0), totalCartDisc: allOrds.reduce((s,o)=>s+n(o.discount),0), totalDiscounts: allOrds.reduce((s,o)=>s+n(o.itemDiscounts)+n(o.discount),0), totalDelivery: allOrds.reduce((s,o)=>s+n(o.deliveryFee),0), totalNet: allOrds.reduce((s,o)=>s+n(o.total),0) },
        todayOrders: today.rawOrders,
        allOrders: allOrds,
        promotionsCatalog: (this.promotions||[]).map(p=>({id:p.id,name:p.name,type:p.type,scope:p.scope||'cart',value:p.value,code:p.code||null,minOrder:p.minOrder||0,expiresAt:p.expiresAt||null,active:p.active,linkedItems:(this.items||[]).filter(i=>i.promoId===p.id).map(i=>({id:i.id,name:i.name,price:i.price,promoPrice:i.promoPrice,discountPct:i.promoPrice?(((i.price-i.promoPrice)/i.price)*100).toFixed(1)+'%':null}))})),
        promoAnalytics: Object.values(promoAnalytics),
        itemsCatalog: (this.items||[]).map(i=>{const lp=i.promoId?(this.promotions||[]).find(p=>p.id===i.promoId):null;const cat=this.categories.find(c=>c.id===i.category);return{id:i.id,name:i.name,price:i.price,promoPrice:i.promoPrice||null,promoId:i.promoId||null,promoName:lp?.name||null,promoType:lp?.type||null,promoValue:lp?.value??null,discountPct:(i.promoPrice&&i.price)?(((i.price-i.promoPrice)/i.price)*100).toFixed(1)+'%':null,category:i.category,categoryName:cat?`${cat.icon} ${cat.name}`:i.category,available:i.available,featured:i.featured||false};}),
      };
      const a = document.createElement('a');
      a.href  = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      a.download = `backup_${today.date.replace(/\//g, '-')}.json`;
      a.click();
      await this.addAudit('EXPORT_JSON', { date: today.date, totalOrders: allOrds.length });
      this.showToast('JSON exportado!', 'success', '💾');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'exportJSON', type: 'exportError' }, 'admin');
      this.showToast('Erro ao exportar JSON.', 'error', '❌');
    }
  },

  async printReport() {
    try {
      const today  = this.todayStats;
      const style  = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue('--accent').trim() || '#e85d04';
      const html = buildReportHTML({ today, allTime: this.allTimeStats, orderHistory: this.orderHistory || [], promotions: this.promotions || [], config: this.config, accent, fmt: v => this.formatMoney(v), verifyHash: o => this.verifyOrderHash(o) });
      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) { this.showToast('Permita pop-ups para imprimir', 'error', '⚠️'); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
      await this.addAudit('EXPORT_PRINT', { date: today.date });
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'printReport', type: 'exportError' }, 'admin');
      this.showToast('Erro ao gerar relatório para impressão.', 'error', '❌');
    }
  },

  async closeDayReport() {
    if (this.todayStats.orders === 0) { this.showToast('Nenhum pedido hoje para fechar', 'error', '⚠️'); return; }
    try {
      await this.addAudit('DAY_CLOSED', { date: this.todayStats.date, orders: this.todayStats.orders, revenue: this.todayStats.revenue });
      this.showToast('Dia fechado com sucesso!', 'success', '🎊');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'closeDayReport', type: 'adminWriteError', date: this.todayStats?.date || null }, 'admin');
      this.showToast('Erro ao registrar fechamento.', 'error', '❌');
    }
  },
  async setupRestaurantRealm() {
  try {
    // Verifica se realm já existe
    const existing = await db.realms.toArray();
    if (existing.some(r => r.name === 'Restaurante')) return;

    // Cria o realm compartilhado
    const realmId = await db.realms.add({
      name: 'Restaurante',
    });

    // Associa o catálogo ao realm (visível para workers e admin)
    await db.transaction('rw', db.categories, db.items, db.promotions, async () => {
      for (const cat of this.categories) {
        await db.categories.update(cat.id, { realmId });
      }
      for (const item of this.items) {
        await db.items.update(item.id, { realmId });
      }
      for (const promo of this.promotions) {
        await db.promotions.update(promo.id, { realmId });
      }
    });

    // Novos pedidos criados pelos clientes/workers também vão para este realm
    this._restaurantRealmId = realmId;

    this.logInfo('Realm do restaurante criado', {
      source: 'setupRestaurantRealm', type: 'realmSetup', realmId,
    }, 'admin');

    this.showToast('Sync cloud configurado!', 'success', '☁️');
  } catch (e) {
    await this.logError(e.message || String(e), {
      source: 'setupRestaurantRealm', type: 'realmSetupError', stack: e.stack || null,
    }, 'admin');
  }
},

// Convida um worker por email
async inviteWorker(email) {
  try {
    const realmId = this._restaurantRealmId
      ?? (await db.realms.filter(r => r.name === 'Restaurante').first())?.realmId;

    if (!realmId) {
      this.showToast('Configure o realm primeiro.', 'error', '⚠️'); return;
    }

    await db.members.add({
      realmId,
      email,
      roles:  ['worker'],
      invite: true,  // dispara email de convite
    });

    this.logInfo('Worker convidado', { source: 'inviteWorker', email, realmId }, 'admin');
    this.showToast(`Convite enviado para ${email}`, 'success', '📧');
  } catch (e) {
    await this.logError(e.message || String(e), {
      source: 'inviteWorker', type: 'memberInviteError', email, stack: e.stack || null,
    }, 'admin');
  }
},
};