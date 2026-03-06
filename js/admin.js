/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/admin.js
═══════════════════════════════════════════════════════ */

const appAdmin = {

  // ── Estado: confirmação de limpeza de histórico ────────────────────────────
  showClearHistoryConfirm:    false,
  clearHistoryPassword:       '',
  clearHistoryPasswordError:  '',

  // ── Estado: upload de imagem ───────────────────────────────────────────────
  _imageUploading:       false,
  _imageUploadProgress:  0,

  // ── Estado: edição de promoção ─────────────────────────────────────────────
  _promoFormMode:  'add',
  _editingPromoId: null,

  // ── Estado: edição de categoria ────────────────────────────────────────────
  _catFormMode:   'add',
  _editingCatId:  null,


  // ── Upload de imagem → Firebase Storage ───────────────────────────────────
  async uploadItemImage(event) {
    const input = event.target;
    const file  = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Selecione um arquivo de imagem.', 'error', '⚠️');
      input.value = '';
      return;
    }

    const MAX_MB = 5;
    if (file.size > MAX_MB * 1024 * 1024) {
      this.showToast(`Imagem muito grande. Máximo: ${MAX_MB} MB.`, 'error', '⚠️');
      input.value = '';
      return;
    }

    this._imageUploading      = true;
    this._imageUploadProgress = 0;

    try {
      const slug       = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const path       = `items/${Date.now()}_${slug}`;
      const storageRef = firebaseStorage.ref(path);
      const uploadTask = storageRef.put(file);

      await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snap => {
            this._imageUploadProgress = Math.round(
              (snap.bytesTransferred / snap.totalBytes) * 100,
            );
          },
          reject,
          resolve,
        );
      });

      const url = await storageRef.getDownloadURL();
      this.editingProduct.image = url;
      this.showToast('Imagem enviada!', 'success', '🖼️');

    } catch (e) {
      await this.logError(e.message || String(e), {
        source: 'uploadItemImage', type: 'storageError', stack: e.stack || null,
        fileName: file?.name || null, fileSize: file?.size || null,
      }, 'admin');
      this.showToast('Erro ao enviar imagem.', 'error', '❌');
    } finally {
      this._imageUploading      = false;
      this._imageUploadProgress = 0;
      try { input.value = ''; } catch (_) {}
    }
  },


  // ── Salva configurações da loja no Firestore ───────────────────────────────
  async saveConfig() {
    try {
      const payload = {
        // ── Dados básicos ──────────────────────────────────────────────────
        restaurantName: this.config.restaurantName ?? '',
        city:           this.config.city           ?? '',
        whatsapp:       this.config.whatsapp        ?? '',
        pixKey:         this.config.pixKey          ?? '',
        deliveryFee:    Number(this.config.deliveryFee)  || 0,
        minOrder:       Number(this.config.minOrder)     || 0,
        deliveryTime:   this.config.deliveryTime    ?? '',
        adminPass:      this.config.adminPass        ?? '',
        isOpen:         !!this.config.isOpen,

        // ── Zonas de entrega por faixa de km ──────────────────────────────
        // FIX: normaliza maxKm e fee para Number antes de persistir.
        // x-model em inputs entrega strings; sem isso "5" vai para o Firestore
        // e address.js faz (deliveryRouteKm <= "5") que sempre é false.
        deliveryZones: (this.config.deliveryZones || []).map(z => ({
          id:    z.id,
          label: z.label,
          maxKm: Number(z.maxKm),
          fee:   Number(z.fee),
        })),
        deliveryFeeOutOfRange: this.config.deliveryFeeOutOfRange != null
                                 ? Number(this.config.deliveryFeeOutOfRange)
                                 : null,

        // ── Endereço estruturado da loja ───────────────────────────────────
        storeRua:         this.config.storeRua         ?? '',
        storeNumero:      this.config.storeNumero       ?? '',
        storeComplemento: this.config.storeComplemento  ?? '',
        storeBairro:      this.config.storeBairro       ?? '',
        storeCidade:      this.config.storeCidade       ?? '',
        storeUf:          this.config.storeUf           ?? '',
        storeCep:         this.config.storeCep          ?? '',

        storeLat: this.config.storeLat != null ? Number(this.config.storeLat) : null,
        storeLng: this.config.storeLng != null ? Number(this.config.storeLng) : null,

        updatedAt: new Date().toISOString(),
      };

      await firestoreDb.collection('config').doc('main').set(payload, { merge: true });
      await this.addAudit('STORE_SAVED', {
        restaurantName:  payload.restaurantName,
        hasStoreAddress: !!(payload.storeRua),
        hasStoreCoords:  !!(payload.storeLat && payload.storeLng),
        deliveryZones:   payload.deliveryZones.length,
      });
      this.showToast('Configurações salvas!', 'success', '💾');

    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveConfig', type: 'dbWriteError',
        restaurantName: this.config?.restaurantName || null,
      }, 'admin');
      this.showToast('Erro ao salvar configurações.', 'error', '❌');
    }
  },


  // ── Zonas de entrega ───────────────────────────────────────────────────────

  addDeliveryZone() {
    const label = (this.newDeliveryZone.label || '').trim();
    const maxKm = parseFloat(this.newDeliveryZone.maxKm);
    const fee   = parseFloat(this.newDeliveryZone.fee);

    if (!maxKm || maxKm <= 0) {
      this.showToast('Informe o limite em km', 'error', '⚠️'); return;
    }
    if (isNaN(fee) || fee < 0) {
      this.showToast('Informe a taxa (pode ser 0 para grátis)', 'error', '⚠️'); return;
    }
    if ((this.config.deliveryZones || []).some(z => z.maxKm === +maxKm.toFixed(1))) {
      this.showToast(`Já existe uma zona com limite de ${maxKm} km`, 'error', '⚠️'); return;
    }

    if (!Array.isArray(this.config.deliveryZones)) this.config.deliveryZones = [];

    this.config.deliveryZones.push({
      id:     this.uuid(),
      label:  label || `Até ${maxKm} km`,
      maxKm:  +maxKm.toFixed(1),
      fee:    +fee.toFixed(2),
    });

    // Ordena por maxKm e força reatividade Alpine
    this.config.deliveryZones.sort((a, b) => a.maxKm - b.maxKm);
    this.config.deliveryZones = [...this.config.deliveryZones];

    this.newDeliveryZone = { label: '', maxKm: '', fee: '' };
    this.showToast('Zona adicionada! Salve as configurações.', 'success', '🛵');
  },

  removeDeliveryZone(id) {
    if (!Array.isArray(this.config.deliveryZones)) return;
    const idx = this.config.deliveryZones.findIndex(z => z.id === id);
    if (idx === -1) return;
    this.config.deliveryZones.splice(idx, 1);
    this.config.deliveryZones = [...this.config.deliveryZones];
    this.showToast('Zona removida. Salve as configurações.', 'success', '🗑️');
  },


  // ── Auditoria ──────────────────────────────────────────────────────────────
  async addAudit(action, data = {}) {
    const BUSINESS_EVENTS = new Set([
      'ORDER_PLACED', 'ORDER_STATUS_CHANGED', 'ORDER_EDITED',
      'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED',
      'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'CATEGORY_TOGGLED',
      'PROMO_CREATED', 'PROMO_UPDATED', 'PROMO_DELETED', 'CONFIG_SAVED', 'STORE_SAVED', 'COUPON_APPLIED',
      'EXPORT_EXCEL', 'EXPORT_CSV', 'EXPORT_JSON', 'EXPORT_PRINT',
      'DAY_CLOSED', 'HISTORY_CLEARED',
    ]);
    if (!BUSINESS_EVENTS.has(action)) return;

    try {
      if (!Array.isArray(this.auditLog)) {
        this.logWarn('auditLog não é array — entrada de auditoria ignorada',
          { source: 'addAudit', type: 'auditStateError', action }, 'admin');
        return;
      }
      const lastEntry = this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1] : null;
      const prevHash  = lastEntry ? lastEntry.hash : '00000000';
      const entry     = { id: this.uuid(), timestamp: new Date().toISOString(), action, data };
      entry.hash      = this.djb2Hash(
        prevHash + JSON.stringify({ id: entry.id, timestamp: entry.timestamp, action, data }),
      );
      this.auditLog.push(entry);
      await firestoreDb.collection('auditLog').doc(entry.id).set(entry);
    } catch (e) {
      await this.logError(e.message || String(e),
        { stack: e.stack || null, source: 'addAudit', type: 'auditWriteError', action }, 'admin');
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

  startEditCategory(cat) {
    this._editingCatId = cat.id;
    this._catFormMode  = 'edit';
    this.newCategory   = { name: cat.name, icon: cat.icon || '📦' };
    setTimeout(() => {
      document.getElementById('category-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  },

  cancelCategoryEdit() {
    this._editingCatId = null;
    this._catFormMode  = 'add';
    this.newCategory   = { name: '', icon: '' };
  },

  async updateCategory() {
    if (!this.newCategory.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    try {
      const idx = this.categories.findIndex(c => c.id === this._editingCatId);
      if (idx === -1) { this.cancelCategoryEdit(); return; }
      const updated = {
        ...this.categories[idx],
        name: this.newCategory.name.trim(),
        icon: this.newCategory.icon || this.categories[idx].icon || '📦',
      };
      this.categories.splice(idx, 1, updated);
      await this.saveCategories();
      await this.addAudit('CATEGORY_UPDATED', { name: updated.name, id: updated.id });
      this.showToast('Categoria atualizada!', 'success', '✏️');
      this.cancelCategoryEdit();
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'updateCategory', type: 'adminWriteError',
        catId: this._editingCatId,
      }, 'admin');
      this.showToast('Erro ao atualizar categoria.', 'error', '❌');
    }
  },

  async toggleCategory(cat) {
    try {
      const willBeActive = !cat.active;
      const catIdx       = this.categories.findIndex(c => c.id === cat.id);
      if (catIdx === -1) return;
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
        id: cat.id, name: cat.name, active: willBeActive, affectedProducts: affectedCount,
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
        category:    this.categories[0]?.id || '',
        image:       '',
        available:   true,
        featured:    false,
        complements: [],
      };
    }
    this.newGroup        = { name: '', type: 'multiple', required: false, min: 0, max: 3, options: [] };
    this.newGroupOption  = { name: '', price: 0 };
    this._imageUploading = false;
    this._imageUploadProgress = 0;
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
          name: this.editingProduct.name, price: this.editingProduct.price,
          promoId: this.editingProduct.promoId, promoPrice: this.editingProduct.promoPrice,
          hasImage: !!this.editingProduct.image,
        });
        this.showToast('Produto adicionado!', 'success', '➕');
      } else {
        const idx = this.items.findIndex(i => i.id === this.editingProduct.id);
        if (idx !== -1) this.items.splice(idx, 1, { ...this.editingProduct });
        await this.addAudit('PRODUCT_UPDATED', {
          name: this.editingProduct.name, id: this.editingProduct.id,
          promoId: this.editingProduct.promoId, promoPrice: this.editingProduct.promoPrice,
          hasImage: !!this.editingProduct.image,
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
        // FIX: x-model entrega strings de inputs numéricos — Number() garante tipo correto.
        // Sem isso "40" (string) salvo no Firestore faz cartSubtotal >= "40" falhar.
        value:    Number(this.newPromo.value)    || 0,
        code:     this.newPromo.code.trim().toUpperCase(),
        minOrder: Number(this.newPromo.minOrder) || 0,
        expiresAt: this.newPromo.expiresAt,
        active:   true,
      };
      this.promotions.push(promo);
      this.newPromo = { name: '', type: 'percentage', scope: 'cart', value: 0, code: '', minOrder: 0, expiresAt: '' };
      await this.savePromotions();
      await this.addAudit('PROMO_CREATED', {
        name: promo.name, type: promo.type, scope: promo.scope,
        value: promo.value, code: promo.code, minOrder: promo.minOrder,
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

  startEditPromo(promo) {
    this._editingPromoId = promo.id;
    this._promoFormMode  = 'edit';
    this.newPromo = {
      name:      promo.name,
      type:      promo.type,
      scope:     promo.scope || 'cart',
      value:     promo.value || 0,
      code:      promo.code  || '',
      minOrder:  promo.minOrder || 0,
      expiresAt: promo.expiresAt || '',
    };
    setTimeout(() => {
      document.getElementById('promo-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  },

  cancelPromoEdit() {
    this._editingPromoId = null;
    this._promoFormMode  = 'add';
    this.newPromo = { name: '', type: 'percentage', scope: 'cart', value: 0, code: '', minOrder: 0, expiresAt: '' };
  },

  async updatePromo() {
    if (!this.newPromo.name.trim()) { this.showToast('Informe o nome', 'error', '⚠️'); return; }
    if (this.newPromo.type === 'coupon' && !this.newPromo.code.trim()) {
      this.showToast('Informe o código', 'error', '⚠️'); return;
    }
    try {
      const idx = this.promotions.findIndex(p => p.id === this._editingPromoId);
      if (idx === -1) { this.cancelPromoEdit(); return; }

      const existing = this.promotions[idx];
      const scope =
        (this.newPromo.type === 'coupon' || this.newPromo.type === 'freeDelivery')
          ? 'cart'
          : (this.newPromo.scope || 'cart');

      const updated = {
        ...existing,
        name:      this.newPromo.name.trim(),
        type:      this.newPromo.type,
        scope,
        // FIX: mesmo que addPromo — garante number no Firestore
        value:     Number(this.newPromo.value)    || 0,
        code:      (this.newPromo.code || '').trim().toUpperCase(),
        minOrder:  Number(this.newPromo.minOrder) || 0,
        expiresAt: this.newPromo.expiresAt || '',
      };

      this.promotions.splice(idx, 1, updated);

      const linked = this.items.filter(i => i.promoId === updated.id);
      if (linked.length > 0) {
        this.items.forEach((item, i) => {
          if (item.promoId !== updated.id) return;
          let pp = null;
          if (updated.active) {
            if (updated.type === 'percentage')
              pp = +(item.price * (1 - updated.value / 100)).toFixed(2);
            else if (updated.type === 'fixed')
              pp = +Math.max(0, item.price - updated.value).toFixed(2);
          }
          this.items.splice(i, 1, { ...item, promoPrice: pp });
        });
        await this.saveItems();
      }

      await this.savePromotions();
      await this.addAudit('PROMO_UPDATED', {
        name: updated.name, type: updated.type, id: updated.id, minOrder: updated.minOrder,
      });
      this.showToast('Promoção atualizada!', 'success', '✏️');
      this.cancelPromoEdit();

    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'updatePromo', type: 'adminWriteError',
        promoId: this._editingPromoId,
      }, 'admin');
      this.showToast('Erro ao atualizar promoção.', 'error', '❌');
    }
  },

  async deletePromo(index) {
    try {
      const promo         = this.promotions[index];
      const affectedItems = this.items.filter(i => i.promoId === promo.id);

      if (affectedItems.length > 0) {
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
        name: promo.name, id: promo.id, affectedItems: affectedItems.length,
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
      this.promotions.splice(idx, 1, { ...this.promotions[idx], active: willBeActive });

      const linked = this.items.filter(i => i.promoId === promo.id);
      if (linked.length > 0) {
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

      const snap  = await firestoreDb.collection('orders').get();
      const CHUNK = 450;
      for (let i = 0; i < snap.docs.length; i += CHUNK) {
        const batch = firestoreDb.batch();
        snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      this.orderHistory.splice(0);
      await this.addAudit('HISTORY_CLEARED', {});
      this.showToast('Histórico apagado com sucesso', 'success', '🗑️');
    } catch (e) {
      await this.logError(e.message || String(e),
        { stack: e.stack || null, source: 'confirmClearHistory', type: 'adminWriteError' }, 'admin');
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

      const payLabel = { pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };

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
        ['(−) Descontos de Item', -dayItemDisc],
        ['(−) Descontos de Carrinho', -dayCartDisc],
        ['(+) Taxas de Entrega cobradas', dayDelivery],
        ['(=) Receita Líquida', today.revenue],
        ['', ''],
        ['── OPERACIONAL ──', ''],
        ['Pedidos no Dia', today.orders],
        ['Ticket Médio (líquido)', today.avgTicket],
        ['', ''],
        ['── POR FORMA DE PAGAMENTO ──', ''],
        ['PIX',      today.byPayment.pix],
        ['Cartão',   today.byPayment.card],
        ['Dinheiro', today.byPayment.cash],
      ]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumo Contábil');

      const ws2 = XLSX.utils.aoa_to_sheet([
        ['UUID', 'Nº Pedido', 'Data', 'Hora', 'Cliente', 'Tel', 'Pagamento', 'Tipo',
          'Bruto', 'Desc. Item', 'Desc. Carrinho', 'Entrega', 'Total', 'Cupom', 'Zona Entrega', 'Hash', 'Integridade'],
        ...today.rawOrders.map(o => {
          const integrity = this.verifyOrderHash(o) ? 'íntegro' : 'ADULTERADO';
          return [
            o.uuid||'-', o.orderNumber||'-', o.date||'-', o.time||'-',
            o.name||'-', o.phone||'-',
            payLabel[o.payment]||o.payment||'-', o.deliveryType||'-',
            n(o.originalSubtotal||o.subtotal), n(o.itemDiscounts), n(o.discount),
            n(o.deliveryFee), n(o.total), o.coupon||'—',
            o.deliveryZoneLabel||'—', o.hash||'-', integrity,
          ];
        }),
      ]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos do Dia');

      const ws5 = XLSX.utils.aoa_to_sheet([
        ['UUID', 'Nº Pedido', 'Data', 'Hora', 'Cliente', 'Pagamento', 'Total', 'Zona Entrega'],
        ...allOrds.map(o => [
          o.uuid||'-', o.orderNumber||'-', this._normalizeOrderDate(o), o.time||'-',
          o.name||'-', payLabel[o.payment]||o.payment||'-', n(o.total),
          o.deliveryZoneLabel||'—',
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, ws5, 'Histórico Geral');

      XLSX.writeFile(wb, `fechamento_${today.date.replace(/\//g, '-')}.xlsx`);
      await this.addAudit('EXPORT_EXCEL', { date: today.date, orders: today.orders, revenue: today.revenue });
      this.showToast('Excel exportado!', 'success', '📊');
    } catch (e) {
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'exportExcel', type: 'exportError' }, 'admin');
      this.showToast('Erro ao exportar Excel.', 'error', '❌');
    }
  },

  async exportCSV() {
    try {
      const today = this.todayStats;
      const q     = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const n     = v => (typeof v === 'number' ? v : 0);
      const header = ['uuid','orderNumber','date','time','customer','payment','total','deliveryZone'].map(q);
      const rows = today.rawOrders.map(o =>
        [q(o.uuid||''),q(o.orderNumber||''),q(o.date||''),q(o.time||''),q(o.name||''),
         q(o.payment||''),n(o.total),q(o.deliveryZoneLabel||'')].join(',')
      );
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
      const payload = {
        _meta:         { exportedAt: new Date().toISOString(), version: '3.0' },
        todaySummary:  { date: today.date, orders: today.orders, revenue: today.revenue },
        allTimeSummary: { totalOrders: allOrds.length, totalNet: allOrds.reduce((s,o)=>s+(o.total||0),0) },
        todayOrders:   today.rawOrders,
        allOrders:     allOrds,
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
      await this.logError(e.message || String(e), { stack: e.stack || null, source: 'closeDayReport', type: 'adminWriteError' }, 'admin');
      this.showToast('Erro ao registrar fechamento.', 'error', '❌');
    }
  },
};