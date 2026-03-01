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

const appDatabase = {
  async saveConfig() {
    await db.config.clear();
    await db.config.add({ ...this.config, _row: 1 });
    await this.addAudit('CONFIG_SAVED', { restaurantName: this.config.restaurantName, isOpen: this.config.isOpen });
    this.showToast('Configurações salvas!', 'success', '💾');
  },

  async updateOrder(order) {
    try { await db.orders.put({ ...order }); } catch(e) { console.error(e); }
  },

  async saveCategories() {
    try {
      await db.transaction('rw', db.categories, async () => {
        await db.categories.clear();
        // Garante que os dados são serializáveis (sem proxies Alpine)
        await db.categories.bulkPut(JSON.parse(JSON.stringify(this.categories)));
      });
    } catch(e) { console.error('saveCategories error:', e); }
  },

  async saveItems() {
    try {
      await db.transaction('rw', db.items, async () => {
        await db.items.clear();
        // Serializa via JSON para limpar proxies e garantir que
        // objetos aninhados (complements, options) sejam persistidos
        await db.items.bulkPut(JSON.parse(JSON.stringify(this.items)));
      });
    } catch(e) { console.error('saveItems error:', e); }
  },

  async savePromotions() {
    try {
      await db.transaction('rw', db.promotions, async () => {
        await db.promotions.clear();
        await db.promotions.bulkPut(JSON.parse(JSON.stringify(this.promotions)));
      });
    } catch(e) { console.error('savePromotions error:', e); }
  },

  async saveOrderCounter() {
    await db.orderCounter.clear();
    await db.orderCounter.add({ counter: this.orderCounter });
  },

  async persistOrder(order) {
    await db.orders.put(order);
  },

  async addAudit(action, data) {
    try {
      await db.auditLog.add({
        id:        crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(36),
        timestamp: Date.now(),
        action,
        data: JSON.stringify(data),
      });
    } catch(e) { /* auditLog não crítico */ }
  },

  async loadAllData() {
    try {
      const [cfgRows, cats, its, promos, orders, counterRow] = await Promise.all([
        db.config.toArray(),
        db.categories.toArray(),
        db.items.toArray(),
        db.promotions.toArray(),
        db.orders.orderBy('timestamp').toArray(),
        db.orderCounter.toArray(),
      ]);

      if (cfgRows.length)    this.config       = { ...this.config, ...cfgRows[0] };
      if (cats.length)       this.categories   = cats;
      if (its.length)        this.items        = its;
      if (promos.length)     this.promotions   = promos;
      if (orders.length)     this.orderHistory = orders;
      if (counterRow.length) this.orderCounter = counterRow[0].counter || 0;

      const auditRows = await db.auditLog.orderBy('timestamp').toArray();
      if (auditRows.length)  this.auditLog = auditRows;

      this.dbReady = true;
    } catch(e) {
      console.error('Dexie load error:', e);
      this.dbReady = true;
    }
  },
};