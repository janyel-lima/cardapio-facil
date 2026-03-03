const db = new Dexie('cardapioDigitalPro', {
  addons: [DexieCloud.dexieCloud],
});
db.version(1).stores({
  config:       '++id',
  categories:   'id, active',
  items:        'id, category, available',
  promotions:   'id, active, type',
  orders:       'uuid, date, timestamp',
  orderCounter: '++id',
  auditLog:     'id, timestamp, action',
});
db.version(2).stores({
  orders: 'uuid, date, timestamp, currentStatus',
});
// v3: índice promoId em items para busca reversa (quais itens usam uma promoção)
db.version(3).stores({
  items: 'id, category, available, promoId',
});
// v4: tabela de logs de erro do sistema (Sys Logs)
db.version(4).stores({
  errorLogs: 'id, severity, timestamp, resolved, module',
});

db.version(5).stores({
  // Tabelas da aplicação — realmId indexado para filtros por realm
  config:       '++id',                                      // local-only (admin manage via rlm-public)
  categories:   'id, active, realmId',
  items:        'id, category, available, promoId, realmId',
  promotions:   'id, active, type, realmId',
  orders:       'uuid, date, timestamp, currentStatus, realmId',
  orderCounter: '++id',                                      // local-only
  auditLog:     'id, timestamp, action, realmId',
  errorLogs:    'id, severity, timestamp, resolved, module, realmId',

  // Tabelas de controle de acesso (nomes e PKs são fixos — Dexie Cloud exige exatamente esses)
  realms:  '@realmId',
  members: '@id',
  roles:   '[realmId+name]',
});



db.cloud.configure({
  databaseUrl:  'https://zrl8ayakm.dexie.cloud', // URL do passo 1
  requireAuth:  false,   // clientes podem navegar sem login; só admin/worker precisam autenticar
  tryUseServiceWorker: true,
  periodicSync: {
    minInterval: 60_000, // sincroniza a cada 1 minuto no mínimo
  },
});

const appDatabase = {

  async saveConfig() {
    try {
      await db.config.clear();
      await db.config.add({ ...this.config, _row: 1 });
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

  async updateOrder(order) {
    try {
      const plain = JSON.parse(JSON.stringify(order));
      await db.orders.put(plain);
      if (!Array.isArray(this.orderHistory)) return;
      const idx = this.orderHistory.findIndex(o => o.uuid === plain.uuid);
      if (idx !== -1) {
        this.orderHistory.splice(idx, 1, plain);
      } else {
        this.orderHistory.push(plain);
      }
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'updateOrder', type: 'dbWriteError',
        orderUuid: order?.uuid || null,
      }, 'database');
    }
  },

  async saveCategories() {
    try {
      await db.transaction('rw', db.categories, async () => {
        await db.categories.clear();
        await db.categories.bulkPut(JSON.parse(JSON.stringify(this.categories)));
      });
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveCategories', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar categorias.', 'error', '❌');
    }
  },

  async saveItems() {
    try {
      await db.transaction('rw', db.items, async () => {
        await db.items.clear();
        await db.items.bulkPut(JSON.parse(JSON.stringify(this.items)));
      });
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveItems', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar produtos.', 'error', '❌');
    }
  },

  async savePromotions() {
    try {
      await db.transaction('rw', db.promotions, async () => {
        await db.promotions.clear();
        await db.promotions.bulkPut(JSON.parse(JSON.stringify(this.promotions)));
      });
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'savePromotions', type: 'dbWriteError',
      }, 'database');
      this.showToast('Erro ao salvar promoções.', 'error', '❌');
    }
  },

  async saveOrderCounter() {
    try {
      await db.transaction('rw', db.orderCounter, async () => {
        await db.orderCounter.clear();
        await db.orderCounter.add({ counter: this.orderCounter });
      });
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'saveOrderCounter', type: 'dbWriteError',
        counter: this.orderCounter,
      }, 'database');
    }
  },

  async persistOrder(order) {
    try {
      await db.orders.put(order);
    } catch (e) {
      await this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'persistOrder', type: 'dbWriteError',
        orderUuid: order?.uuid || null, orderNumber: order?.orderNumber || null,
      }, 'database');
      throw e;
    }
    if (!Array.isArray(this.orderHistory)) {
      console.error(
        '[persistOrder] ERRO: this.orderHistory não é array.\n' +
        'Declare orderHistory: [] no estado inicial do Alpine antes do merge.',
      );
      return;
    }
    const idx = this.orderHistory.findIndex(o => o.uuid === order.uuid);
    if (idx === -1) {
      this.orderHistory.push({ ...order });
    } else {
      this.orderHistory.splice(idx, 1, { ...order });
    }
  },

  async loadAllData() {
    try {
      const [cfgRows, cats, its, promos, orders, counterRow, auditRows] = await Promise.all([
        db.config.toArray(),
        db.categories.toArray(),
        db.items.toArray(),
        db.promotions.toArray(),
        db.orders.orderBy('timestamp').toArray(),
        db.orderCounter.toArray(),
        db.auditLog.orderBy('timestamp').toArray(),
      ]);

      if (cfgRows.length) {
        const { _row, id, ...savedCfg } = cfgRows[0];
        this.config = { ...this.config, ...savedCfg };
      }

      // FIX: splice em vez de reatribuição — preserva a referência do Proxy Alpine.
      // this.categories = cats  →  substitui a ref, $watch e getters perdem o tracking.
      // splice(0, Infinity, ...cats)  →  muta in-place, ref permanece a mesma.
      if (cats.length)   this.categories.splice(0, Infinity, ...cats);
      if (its.length)    this.items.splice(0, Infinity, ...its);
      if (promos.length) this.promotions.splice(0, Infinity, ...promos);

      if (!Array.isArray(this.orderHistory)) {
        console.error(
          '[loadAllData] ERRO: this.orderHistory não existe ou não é array.\n' +
          'Certifique-se de declarar orderHistory: [] no estado inicial do Alpine\n' +
          'ANTES do merge com appDatabase.',
        );
        this.dbReady = true;
        return;
      }
      if (orders.length) {
        this.orderHistory.splice(0, this.orderHistory.length, ...orders);
      }

      if (counterRow.length) {
        this.orderCounter = counterRow[0].counter || 0;
      }

      if (!Array.isArray(this.auditLog)) {
        console.warn('[loadAllData] auditLog não é array — inicializando.');
      } else if (auditRows.length) {
        this.auditLog.splice(0, this.auditLog.length, ...auditRows);
      }

      this.dbReady = true;

      await this.loadLogs();

    } catch (e) {
      console.error('[loadAllData] Dexie load error:', e);
      try {
        await this.logError(e.message || String(e), {
          stack: e.stack || null, source: 'loadAllData', type: 'dbInitError',
        }, 'database');
      } catch { /* logger também pode não estar pronto */ }
      this.showToast('Erro ao carregar dados do banco. Verifique o console.', 'error', '❌');
      this.dbReady = true;
    }
  },
};