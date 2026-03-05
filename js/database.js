/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/database.js
   Persistência via Google Cloud Firestore
═══════════════════════════════════════════════════════ */

const appDatabase = {

  // Cleanup do listener de pedidos em tempo real
  _ordersUnsubscribe: null,

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER PRIVADO — substitui clear() + bulkPut() do Dexie
  // ─────────────────────────────────────────────────────────────────────────
  async _replaceCollection(collectionName, items) {
    const col      = firestoreDb.collection(collectionName);
    const existing = await col.get();
    const allOps   = [
      ...existing.docs.map(d => ({ type: 'delete', ref: d.ref })),
      ...items.map(item => ({
        type: 'set',
        ref:  col.doc(String(item.id ?? this.uuid())),
        data: JSON.parse(JSON.stringify(item)),
      })),
    ];

    const CHUNK = 450;
    for (let i = 0; i < allOps.length; i += CHUNK) {
      const batch = firestoreDb.batch();
      allOps.slice(i, i + CHUNK).forEach(op => {
        if (op.type === 'delete') batch.delete(op.ref);
        else                      batch.set(op.ref, op.data);
      });
      await batch.commit();
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER PRIVADO — get com fallback automático para cache offline
  // ─────────────────────────────────────────────────────────────────────────
  async _getWithOfflineFallback(ref) {
    try {
      return await ref.get({ source: 'default' });
    } catch (e) {
      const isOffline =
        e.code === 'unavailable' ||
        (e.message || '').toLowerCase().includes('offline') ||
        (e.message || '').toLowerCase().includes('client is offline');

      if (isOffline) {
        try {
          return await ref.get({ source: 'cache' });
        } catch {
          return { exists: false, data: () => null, docs: [] };
        }
      }
      throw e;
    }
  },

  async _queryWithOfflineFallback(query) {
    try {
      return await query.get({ source: 'default' });
    } catch (e) {
      const isOffline =
        e.code === 'unavailable' ||
        (e.message || '').toLowerCase().includes('offline') ||
        (e.message || '').toLowerCase().includes('client is offline');

      if (isOffline) {
        try {
          return await query.get({ source: 'cache' });
        } catch {
          return { docs: [], empty: true };
        }
      }
      throw e;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  async saveConfig() {
    try {
      const { adminPass, ...publicConfig } = this.config;

      const batch = firestoreDb.batch();

      batch.set(
        firestoreDb.collection('config').doc('main'),
        JSON.parse(JSON.stringify(publicConfig)),
      );

      if (adminPass && adminPass.length >= 4) {
        batch.set(
          firestoreDb.collection('adminConfig').doc('auth'),
          { adminPass, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      }

      await batch.commit();

      await this.addAudit('CONFIG_SAVED', {
        restaurantName: this.config.restaurantName,
        isOpen:         this.config.isOpen,
      });

      this.showToast('Configurações salvas!', 'success', '💾');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveConfig', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar configurações.', 'error', '❌');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIAS / PRODUTOS / PROMOÇÕES
  // ─────────────────────────────────────────────────────────────────────────

  async saveStore() {
    try {
      await Promise.all([
        this.saveConfig(),
        this._replaceCollection('categories', this.categories),
        this._replaceCollection('items',      this.items),
        this._replaceCollection('promotions', this.promotions),
      ]);

      await this.addAudit('STORE_SAVED', {
        restaurantName: this.config.restaurantName,
        categories:     this.categories.length,
        items:          this.items.length,
        promotions:     this.promotions.length,
      });

      this.showToast('Loja salva com sucesso!', 'success', '🏪');
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveStore', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar a loja.', 'error', '❌');
    }
  },

  async saveCategories() {
    try {
      await this._replaceCollection('categories', this.categories);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveCategories', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar categorias.', 'error', '❌');
    }
  },

  async saveItems() {
    try {
      await this._replaceCollection('items', this.items);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveItems', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar produtos.', 'error', '❌');
    }
  },

  async savePromotions() {
    try {
      await this._replaceCollection('promotions', this.promotions);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'savePromotions', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar promoções.', 'error', '❌');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONTADOR DE PEDIDOS
  // ─────────────────────────────────────────────────────────────────────────

  async saveOrderCounter() {
    try {
      await firestoreDb.collection('meta').doc('orderCounter').set(
        { counter: this.orderCounter },
        { merge: true },
      );
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack:   e.stack || null,
        source:  'saveOrderCounter',
        type:    'dbWriteError',
        counter: this.orderCounter,
      }, 'database');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEDIDOS — Escrita
  // ─────────────────────────────────────────────────────────────────────────

  async persistOrder(order) {
    try {
      await firestoreDb.collection('orders').doc(order.uuid).set(
        JSON.parse(JSON.stringify(order)),
      );
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack:        e.stack || null,
        source:       'persistOrder',
        type:         'dbWriteError',
        orderUuid:    order?.uuid        || null,
        orderNumber:  order?.orderNumber || null,
      }, 'database');
      throw e;
    }

    if (!Array.isArray(this.orderHistory)) {
      console.error('[persistOrder] ERRO: this.orderHistory não é array.');
      return;
    }

    const idx = this.orderHistory.findIndex(o => o.uuid === order.uuid);
    if (idx === -1) {
      this.orderHistory.push({ ...order });
    } else {
      this.orderHistory.splice(idx, 1, { ...order });
    }
  },

  async updateOrder(order) {
    try {
      const plain = JSON.parse(JSON.stringify(order));
      await firestoreDb.collection('orders').doc(plain.uuid).set(plain, { merge: true });

      if (!Array.isArray(this.orderHistory)) return;
      const idx = this.orderHistory.findIndex(o => o.uuid === plain.uuid);
      if (idx !== -1) {
        this.orderHistory.splice(idx, 1, plain);
      } else {
        this.orderHistory.push(plain);
      }
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack:     e.stack || null,
        source:    'updateOrder',
        type:      'dbWriteError',
        orderUuid: order?.uuid || null,
      }, 'database');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEDIDOS — Tempo Real
  //
  // FIX (false for 'list' @ L63): getIdTokenResult(false) retornava o token
  // em cache que ainda não carregava o custom claim de role recém-atribuído.
  // Trocado para getIdTokenResult(true) → força round-trip ao servidor,
  // garantindo que o Firestore SDK use o token com o claim correto ao
  // montar o listener onSnapshot.
  // ─────────────────────────────────────────────────────────────────────────

  async _initRealtimeOrders() {
    if (this._ordersUnsubscribe) {
      this._ordersUnsubscribe();
      this._ordersUnsubscribe = null;
    }

    const user = firebaseAuth.currentUser;
    if (!user) return;

    let role = '';
    try {
      // FIX: forceRefresh=true garante que o claim de role já gravado pelo
      // backend esteja presente no token que o Firestore usará para avaliar
      // as Security Rules. Com false, o SDK podia retornar um token stale
      // sem o claim, causando "false for 'list'" mesmo para admin/worker.
      const tokenResult = await user.getIdTokenResult(/* forceRefresh= */ true);
      role = tokenResult.claims.role ?? '';
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: '_initRealtimeOrders', type: 'authError',
      }, 'database');
      return;
    }

    if (firebaseAuth.currentUser?.uid !== user.uid) return;
    if (!['admin', 'worker'].includes(role)) return;

    this._ordersUnsubscribe = firestoreDb
      .collection('orders')
      .orderBy('timestamp', 'asc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          if (!Array.isArray(this.orderHistory)) return;

          snapshot.docChanges().forEach(change => {
            const order = change.doc.data();
            const idx   = this.orderHistory.findIndex(o => o.uuid === order.uuid);

            if (change.type === 'added' && idx === -1) {
              this.orderHistory.push(order);
            } else if (change.type === 'modified' && idx !== -1) {
              this.orderHistory.splice(idx, 1, order);
            } else if (change.type === 'removed' && idx !== -1) {
              this.orderHistory.splice(idx, 1);
            }
          });
        },
        err => {
          this.logError(err.message || String(err), {
            source: '_initRealtimeOrders',
            type:   'realtimeListenerError',
            stack:  err.stack || null,
          }, 'database');
        },
      );
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA INICIAL — dados públicos
  // ─────────────────────────────────────────────────────────────────────────

  async loadAllData() {
    try {
      const [cfgSnap, catsSnap, itemsSnap, promosSnap, counterSnap] =
        await Promise.all([
          this._getWithOfflineFallback(
            firestoreDb.collection('config').doc('main'),
          ),
          this._queryWithOfflineFallback(
            firestoreDb.collection('categories'),
          ),
          this._queryWithOfflineFallback(
            firestoreDb.collection('items'),
          ),
          this._queryWithOfflineFallback(
            firestoreDb.collection('promotions'),
          ),
          this._getWithOfflineFallback(
            firestoreDb.collection('meta').doc('orderCounter'),
          ),
        ]);

      if (cfgSnap.exists) {
        const { _row, id, adminPass: _ignored, ...savedCfg } = cfgSnap.data();
        Object.assign(this.config, savedCfg);
      }

      const cats   = (catsSnap.docs   || []).map(d => d.data());
      const its    = (itemsSnap.docs   || []).map(d => d.data());
      const promos = (promosSnap.docs  || []).map(d => d.data());

      if (cats.length)   this.categories.splice(0, Infinity, ...cats);
      if (its.length)    this.items.splice(0, Infinity, ...its);
      if (promos.length) this.promotions.splice(0, Infinity, ...promos);

      if (counterSnap.exists) {
        this.orderCounter = counterSnap.data().counter || 0;
      }

      this.dbReady = true;

    } catch (e) {
      console.error('[loadAllData] Firestore load error:', e);
      try {
        await this.logError(e.message || String(e), {
          stack:  e.stack || null,
          source: 'loadAllData',
          type:   'dbInitError',
        }, 'database');
      } catch { /* logger pode não estar pronto */ }
      this.showToast('Erro ao carregar dados. Verifique o console.', 'error', '❌');
      this.dbReady = true;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA PÓS-AUTH — dados protegidos (pedidos, auditLog, adminPass)
  // ─────────────────────────────────────────────────────────────────────────

  async loadProtectedData() {
    const user = firebaseAuth.currentUser;

    // ── Força refresh do token para garantir custom claims atualizados ──────
    if (user) {
      try {
        await user.getIdToken(/* forceRefresh= */ true);
      } catch (e) {
        console.warn('[loadProtectedData] token refresh skipped:', e.message);
      }
    }

    // ── adminPass ────────────────────────────────────────────────────────────
    if (this.isCloudAdmin) {
      try {
        const authDoc = await firestoreDb.collection('adminConfig').doc('auth').get();
        if (authDoc.exists) {
          const { adminPass } = authDoc.data();
          if (adminPass) this.config.adminPass = adminPass;
        }
      } catch (e) {
        console.warn('[loadProtectedData] adminConfig read skipped:', e.message);
      }
    }

    // ── Sys Logs ─────────────────────────────────────────────────────────────
    if (this.isCloudAdmin || this.isCloudWorker) {
      try {
        await this.loadLogs();
      } catch (e) {
        await this.logError(e.message || String(e), {
          stack: e.stack || null, source: 'loadProtectedData:logs', type: 'dbReadError',
        }, 'database');
      }
    }

    // ── Pedidos ───────────────────────────────────────────────────────────────
    if (this.isCloudAdmin || this.isCloudWorker) {
      try {
        if (!Array.isArray(this.orderHistory)) return;

        const ordersSnap = await firestoreDb
          .collection('orders')
          .orderBy('timestamp', 'asc')
          .get();

        const orders = ordersSnap.docs.map(d => d.data());
        if (orders.length) {
          this.orderHistory.splice(0, this.orderHistory.length, ...orders);
        }

        await this._initRealtimeOrders();

      } catch (e) {
        const isPermission =
          e.code === 'permission-denied' ||
          (e.message || '').includes('false for');

        await this.logError(e.message || String(e), {
          stack:        e.stack || null,
          source:       'loadProtectedData:orders',
          type:         isPermission ? 'permissionError' : 'dbReadError',
          isCloudAdmin: this.isCloudAdmin,
          isCloudWorker: this.isCloudWorker,
        }, 'database');

        if (isPermission) {
          console.warn(
            '[loadProtectedData:orders] Permissão negada. ' +
            'Verifique as Firestore Security Rules para a coleção "orders".',
          );
        }
      }
    }

    // ── AuditLog ──────────────────────────────────────────────────────────────
    if (this.isCloudAdmin) {
      try {
        const auditSnap = await firestoreDb
          .collection('auditLog')
          .orderBy('timestamp', 'asc')
          .get();

        const audit = auditSnap.docs.map(d => d.data());
        if (Array.isArray(this.auditLog) && audit.length) {
          this.auditLog.splice(0, this.auditLog.length, ...audit);
        }
      } catch (e) {
        await this.logError(e.message || String(e), {
          stack: e.stack || null, source: 'loadProtectedData:auditLog', type: 'dbReadError',
        }, 'database');
      }
    }
  },
};