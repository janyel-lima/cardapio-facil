const appAdmin = {
  // ── Segurança ──────────────────────────────────────────────────────────────
  get isLockedOut() {
    if (!this.lockedUntil) return false;
    if (Date.now() >= this.lockedUntil) { this.lockedUntil = null; this.failedAttempts = 0; this._saveSecurityState(); return false; }
    return true;
  },
  get lockoutRemaining() { return !this.lockedUntil ? 0 : Math.max(0, Math.ceil((this.lockedUntil - Date.now()) / 1000)); },
  get lockoutRemainingFormatted() { const s = this.lockoutRemaining; return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; },

  loginAdmin() {
    if (this.isLockedOut) { this.adminError = `Conta bloqueada. Aguarde ${this.lockoutRemainingFormatted}.`; return; }
    if (this.adminPassword === this.config.adminPass) {
      this.isAdmin = true; this.adminError = ''; this.failedAttempts = 0;
      this.sessionId = this.uuid(); this.sessionExpiry = Date.now() + this.SECURITY_SESSION_MS;
      this._saveSecurityState(); this._saveSession(); this._startSessionTimer();
      this.adminPassword = ''; this.showAdminLogin = false; this.showAdminPanel = true;
    } else {
      this.failedAttempts++;
      if (this.failedAttempts >= this.SECURITY_MAX_ATTEMPTS) {
        this.lockedUntil = Date.now() + this.SECURITY_LOCKOUT_MS; this._saveSecurityState();
        this.adminError = `Muitas tentativas. Conta bloqueada por 15 minutos.`;
      } else { this.adminError = `Senha incorreta. ${this.SECURITY_MAX_ATTEMPTS - this.failedAttempts} tentativa(s) restante(s).`; }
    }
  },

  logoutAdmin() { this._clearSession(); this.isAdmin = false; this.showAdminPanel = false; this.showToast('Sessão encerrada com segurança', 'success', '🔒'); },
  _saveSession() { try { sessionStorage.setItem('adminSession', JSON.stringify({ sessionId: this.sessionId, expiry: this.sessionExpiry })); } catch(e) {} },
  _clearSession() { this.sessionId = null; this.sessionExpiry = null; clearInterval(this._sessionTimer); this.sessionCountdownLabel = ''; try { sessionStorage.removeItem('adminSession'); } catch(e) {} },
  _loadSession() {
    try {
      const raw = sessionStorage.getItem('adminSession'); if (!raw) return false;
      const { sessionId, expiry } = JSON.parse(raw);
      if (Date.now() < expiry) { this.sessionId = sessionId; this.sessionExpiry = expiry; this.isAdmin = true; this._startSessionTimer(); return true; }
      sessionStorage.removeItem('adminSession');
    } catch(e) {} return false;
  },
  _startSessionTimer() {
    clearInterval(this._sessionTimer);
    this._sessionTimer = setInterval(() => {
      if (!this.sessionExpiry) return;
      const remaining = Math.max(0, this.sessionExpiry - Date.now());
      if (remaining === 0) {
        this._clearSession(); this.isAdmin = false; this.showAdminPanel = false;
        this.showToast('Sessão expirada. Faça login novamente.', 'error', '⏰'); return;
      }
      const h = Math.floor(remaining / 3600000), m = Math.floor((remaining % 3600000) / 60000), s = Math.floor((remaining % 60000) / 1000);
      this.sessionCountdownLabel = `${h > 0 ? h+'h ' : ''}${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }, 1000);
  },
  _saveSecurityState() { try { localStorage.setItem('security_state', JSON.stringify({ failedAttempts: this.failedAttempts, lockedUntil: this.lockedUntil })); } catch(e) {} },
  _loadSecurityState() { try { const raw = localStorage.getItem('security_state'); if (!raw) return; const { failedAttempts, lockedUntil } = JSON.parse(raw); this.failedAttempts = failedAttempts || 0; this.lockedUntil = lockedUntil || null; } catch(e) {} },

  // ── Auditoria ──────────────────────────────────────────────────────────────
  async addAudit(action, data = {}) {
    const BUSINESS_EVENTS = new Set(['ORDER_PLACED','ORDER_STATUS_CHANGED','ORDER_EDITED','PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_DELETED','CATEGORY_CREATED','CATEGORY_DELETED','PROMO_CREATED','PROMO_DELETED','CONFIG_SAVED','COUPON_APPLIED','EXPORT_EXCEL','EXPORT_CSV','EXPORT_JSON','EXPORT_PRINT','DAY_CLOSED','HISTORY_CLEARED']);
    if (!BUSINESS_EVENTS.has(action)) return;
    const lastEntry = this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1] : null;
    const prevHash = lastEntry ? lastEntry.hash : '00000000';
    const entry = { id: this.uuid(), timestamp: new Date().toISOString(), action, data };
    entry.hash = this.djb2Hash(prevHash + JSON.stringify({ id: entry.id, timestamp: entry.timestamp, action, data }));
    this.auditLog.push(entry);
    try { await db.auditLog.put(entry); } catch(e) {}
  },
  verifyAuditIntegrity() {
    for (let i = 0; i < this.auditLog.length; i++) {
      const entry = this.auditLog[i]; const prevHash = i === 0 ? '00000000' : this.auditLog[i-1].hash;
      const expected = this.djb2Hash(prevHash + JSON.stringify({ id: entry.id, timestamp: entry.timestamp, action: entry.action, data: entry.data }));
      if (expected !== entry.hash) return false;
    }
    return true;
  },
  verifyOrderHash(order) {
    if (!order.hash) return null;
    const expected = this.djb2Hash(order.uuid + String(order.total) + order.name);
    return expected === order.hash;
  },

  // ── Helper: deep-spread editingProduct ────────────────────────────────────
  // Cria novas referências para editingProduct E para o array complements E
  // para cada array options interno. Sem isso, Alpine não detecta mudanças
  // em x-for que observa editingProduct.complements (mesma referência).
  _refreshEditingProduct() {
    this.editingProduct = {
      ...this.editingProduct,
      complements: (this.editingProduct.complements || []).map(g => ({
        ...g,
        options: [...(g.options || [])]
      }))
    };
  },

  // ── Admin CRUD ─────────────────────────────────────────────────────────────
  async addCategory() {
    if (!this.newCategory.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    const cat = { id: this.newCategory.name.toLowerCase().replace(/\s+/g,'-')+'-'+Date.now(), name: this.newCategory.name.trim(), icon: this.newCategory.icon||'📦', active: true };
    this.categories.push(cat); this.newCategory = { name:'', icon:'' };
    await this.saveCategories(); await this.addAudit('CATEGORY_CREATED', { name: cat.name, id: cat.id });
    this.showToast('Categoria adicionada!', 'success', '🏷️');
  },
  async deleteCategory(index) {
    if (!confirm('Excluir esta categoria?')) return;
    const cat = this.categories[index]; this.categories.splice(index, 1);
    await this.saveCategories(); await this.addAudit('CATEGORY_DELETED', { name: cat.name, id: cat.id });
  },
  getCategoryName(catId) { const cat = this.categories.find(c => c.id === catId); return cat ? `${cat.icon} ${cat.name}` : catId; },

  openProductForm(item) {
    if (item) {
      // JSON round-trip garante deep clone sem proxies Alpine
      this.editingProduct = JSON.parse(JSON.stringify(item));
      if (!this.editingProduct.complements) this.editingProduct.complements = [];
    } else {
      this.editingProduct = { name:'', desc:'', price:0, promoPrice:null, category:this.categories[0]?.id||'', image:'', available:true, featured:false, complements:[] };
    }
    this.newGroup       = { name:'', type:'multiple', required:false, min:0, max:3, options:[] };
    this.newGroupOption = { name:'', price:0 };
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
      options:  []
    });
    this._refreshEditingProduct(); // deep-spread → x-for detecta nova referência
    this.newGroup = { name:'', type:'multiple', required:false, min:0, max:3, options:[] };
  },

  /**
   * Aceita valores via parâmetros (vindos do x-data local do grupo no HTML)
   * OU via this.newGroupOption como fallback.
   */
  addComplementOption(groupIdx, nameParam, priceParam) {
    const name  = (nameParam  !== undefined ? String(nameParam)        : this.newGroupOption.name).trim();
    const price = (priceParam !== undefined ? parseFloat(priceParam)   : parseFloat(this.newGroupOption.price)) || 0;
    if (!name) { this.showToast('Informe o nome da opção', 'error', '⚠️'); return; }
    if (!this.editingProduct.complements?.[groupIdx]) return;
    this.editingProduct.complements[groupIdx].options.push({ id: this.uuid(), name, price });
    this._refreshEditingProduct();
    this.newGroupOption = { name:'', price:0 };
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
    if (!this.editingProduct.promoPrice || this.editingProduct.promoPrice <= 0) this.editingProduct.promoPrice = null;
    if (!this.editingProduct.complements) this.editingProduct.complements = [];

    const isNew = !this.editingProduct.id;
    if (isNew) {
      this.editingProduct.id = Date.now();
      this.items.push({ ...this.editingProduct });
      await this.addAudit('PRODUCT_CREATED', { name: this.editingProduct.name, price: this.editingProduct.price });
      this.showToast('Produto adicionado!', 'success', '➕');
    } else {
      const idx = this.items.findIndex(i => i.id === this.editingProduct.id);
      if (idx !== -1) this.items.splice(idx, 1, { ...this.editingProduct });
      await this.addAudit('PRODUCT_UPDATED', { name: this.editingProduct.name, id: this.editingProduct.id });
      this.showToast('Produto atualizado!', 'success', '✏️');
    }
    await this.saveItems();
    this.showProductForm = false;
  },

  async deleteProduct(index) {
    if (!confirm('Excluir este produto?')) return;
    const item = this.items[index]; this.items.splice(index, 1); await this.saveItems();
    await this.addAudit('PRODUCT_DELETED', { name: item.name, id: item.id });
    this.showToast('Produto removido', 'success', '🗑️');
  },

  // ── Promoções ──────────────────────────────────────────────────────────────
  async addPromo() {
    if (!this.newPromo.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    if (this.newPromo.type === 'coupon' && !this.newPromo.code.trim()) { this.showToast('Informe o código', 'error', '⚠️'); return; }
    const promo = { id: Date.now(), name: this.newPromo.name.trim(), type: this.newPromo.type, value: this.newPromo.value||0, code: this.newPromo.code.trim().toUpperCase(), minOrder: this.newPromo.minOrder||0, expiresAt: this.newPromo.expiresAt, active: true };
    this.promotions.push(promo); this.newPromo = { name:'', type:'percentage', value:0, code:'', minOrder:0, expiresAt:'' };
    await this.savePromotions(); await this.addAudit('PROMO_CREATED', { name: promo.name, type: promo.type, value: promo.value, code: promo.code });
    this.showToast('Promoção criada!', 'success', '🔥');
  },
  async deletePromo(index) {
    const promo = this.promotions[index]; this.promotions.splice(index, 1);
    await this.savePromotions(); await this.addAudit('PROMO_DELETED', { name: promo.name, id: promo.id });
  },
  async clearOrderHistory() {
    this.orderHistory = []; await db.orders.clear(); await this.addAudit('HISTORY_CLEARED', {});
    this.showToast('Histórico apagado', 'success', '🗑️');
  },

  // ── Relatórios ─────────────────────────────────────────────────────────────
  getTopProducts(orders) {
    const map = {};
    orders.forEach(o => { (o.items||[]).forEach(item => { if (!map[item.name]) map[item.name] = { name:item.name, qty:0, total:0 }; map[item.name].qty += item.qty; map[item.name].total += item.total; }); });
    return Object.values(map).sort((a,b) => b.qty - a.qty).slice(0, 10);
  },
  get todayStats() {
    const today = new Date().toLocaleDateString('pt-BR'); const orders = this.orderHistory.filter(o => o.date === today);
    const revenue = orders.reduce((s,o)=>s+o.total,0);
    return { date: today, orders: orders.length, revenue, avgTicket: orders.length > 0 ? revenue / orders.length : 0, byPayment: { pix: orders.filter(o=>o.payment==='pix').reduce((s,o)=>s+o.total,0), card: orders.filter(o=>o.payment==='card').reduce((s,o)=>s+o.total,0), cash: orders.filter(o=>o.payment==='cash').reduce((s,o)=>s+o.total,0) }, topProducts: this.getTopProducts(orders), rawOrders: orders };
  },
  get allTimeStats() {
    const revenue = this.orderHistory.reduce((s,o)=>s+o.total,0); const count = this.orderHistory.length; const byDate = {};
    this.orderHistory.forEach(o => { if (!byDate[o.date]) byDate[o.date] = { date:o.date, orders:0, revenue:0 }; byDate[o.date].orders++; byDate[o.date].revenue += o.total; });
    return { totalRevenue: revenue, totalOrders: count, avgTicket: count > 0 ? revenue/count : 0, byDate: Object.values(byDate).sort((a,b) => { const toMs = d => new Date(d.split('/').reverse().join('-')).getTime(); return toMs(a.date) - toMs(b.date); }), topProducts: this.getTopProducts(this.orderHistory) };
  },
  async exportExcel() {
    if (typeof XLSX === 'undefined') { this.showToast('Biblioteca não carregada', 'error', '❌'); return; }
    const today = this.todayStats; const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([['RELATÓRIO',''],['Data:',today.date],['Receita:',today.revenue],['Pedidos:',today.orders]]); XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');
    const ws2 = XLSX.utils.aoa_to_sheet([['UUID','Nº Pedido','Data','Hora','Cliente','Pagamento','Total'], ...today.rawOrders.map(o=>[o.uuid||'-',o.orderNumber||'-',o.date,o.time,o.name,o.payment,o.total])]); XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos do Dia');
    XLSX.writeFile(wb, `fechamento_${today.date.replace(/\//g,'-')}.xlsx`);
    await this.addAudit('EXPORT_EXCEL', { date: today.date, orders: today.orders, revenue: today.revenue }); this.showToast('Excel exportado!', 'success', '📊');
  },
  async exportCSV() {
    const today = this.todayStats;
    const csv = [['Nº Pedido','Cliente','Total'], ...today.rawOrders.map(o=>[o.orderNumber||'',o.name,o.total.toFixed(2)])].map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})); a.download='pedidos.csv'; a.click();
    await this.addAudit('EXPORT_CSV', { date: today.date }); this.showToast('CSV exportado!', 'success', '📄');
  },
  async exportJSON() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({date:this.todayStats.date,orders:this.todayStats.rawOrders},null,2)],{type:'application/json'})); a.download='backup.json'; a.click();
    await this.addAudit('EXPORT_JSON', { date: this.todayStats.date }); this.showToast('JSON exportado!', 'success', '💾');
  },
  async printReport() { window.print(); await this.addAudit('EXPORT_PRINT', { date: this.todayStats.date }); },
  async closeDayReport() {
    if (this.todayStats.orders === 0) { this.showToast('Nenhum pedido hoje para fechar', 'error', '⚠️'); return; }
    await this.addAudit('DAY_CLOSED', { date: this.todayStats.date, orders: this.todayStats.orders, revenue: this.todayStats.revenue });
    this.showToast('Dia fechado com sucesso!', 'success', '🎊');
  }
};