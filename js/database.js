const db = new Dexie('cardapioDigitalPro');
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

const appDatabase = {

  async saveConfig() {
    try {
      await db.config.clear();
      await db.config.add({ ...this.config, _row: 1 });
      // addAudit está definido em admin.js e é o único owner do log de auditoria.
      // CONFIG_SAVED está no conjunto BUSINESS_EVENTS, então será registrado corretamente.
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

  // FIX: transação única garante atomicidade — evita contador inconsistente
  // entre o clear() e o add() se a operação for interrompida.
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
      throw e; // propaga para o caller tratar
    }
    // FIX: nunca reatribuir this.orderHistory = [] — isso quebra o proxy reativo
    // do Alpine. Sempre muta o array existente via splice / push.
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

  // NOTA: addAudit foi REMOVIDO deste módulo intencionalmente.
  // A única implementação válida é a de admin.js, que usa hash encadeado
  // (similar a blockchain) para garantir integridade do log de auditoria.
  // Manter duas implementações causava conflito de merge no Alpine e
  // sobrescrevia a lógica de integridade com uma versão simplificada.

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
        // Merge config sem sobrescrever campos em memória não presentes no DB
        const { _row, id, ...savedCfg } = cfgRows[0];
        this.config = { ...this.config, ...savedCfg };
      }

      if (cats.length)   this.categories  = cats;
      if (its.length)    this.items        = its;
      if (promos.length) this.promotions   = promos;

      // FIX CRÍTICO: orderHistory DEVE existir como [] no estado inicial do Alpine.
      // Nunca usar this.orderHistory = [] — quebra o proxy reativo.
      // Sempre muta via splice para preservar a referência do array.
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

      // FIX: mesma proteção para auditLog — muta em vez de reatribuir.
      if (!Array.isArray(this.auditLog)) {
        console.warn('[loadAllData] auditLog não é array — inicializando.');
        // Não podemos reatribuir, mas podemos tentar. Se não funcionar, 
        // o log simplesmente começa vazio nesta sessão.
      } else if (auditRows.length) {
        this.auditLog.splice(0, this.auditLog.length, ...auditRows);
      }

      this.dbReady = true;

      // Carrega logs do sistema e drena fila de erros pré-Alpine
      await this.loadLogs();

    } catch (e) {
      console.error('[loadAllData] Dexie load error:', e);
      // logError não está disponível ainda se o próprio loadAllData falhou
      // antes de loadLogs() — usamos console como fallback seguro aqui.
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