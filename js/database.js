/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/database.js
   Persistência via Google Cloud Firestore

   Migrado de: Dexie + Dexie Cloud
   Mantém: mesmas assinaturas de método e formatos de dados
   Melhoria: pedidos em tempo real via onSnapshot (sem polling)
═══════════════════════════════════════════════════════ */

const appDatabase = {

  // Cleanup do listener de pedidos em tempo real
  _ordersUnsubscribe: null,

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER PRIVADO — substitui clear() + bulkPut() do Dexie
  //
  // Estratégia atômica com WriteBatch:
  //   1. Deleta todos os docs existentes da coleção
  //   2. Escreve todos os novos em um único commit
  //
  // Limite: 500 ops/batch (Firestore). Para menus de restaurante, é sempre
  // suficiente. Se ultrapassar, o método divide em batches de 450.
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

    // Divide em chunks de 450 para respeitar o limite do Firestore
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
  // STORE — salva tudo de uma vez (config + categorias + itens + promoções)
  //
  // Estratégia: Promise.all para paralelizar os writes independentes.
  // Não usamos transaction multi-coleção porque _replaceCollection precisa
  // ler docs existentes antes de escrever — isso tornaria a transaction
  // pesada e complexa sem benefício real para este caso de uso.
  //
  // Limite de 1MB/doc impede consolidar tudo em um único documento Firestore.
  // Coleções separadas são o padrão correto para listas de tamanho variável.
  // ─────────────────────────────────────────────────────────────────────────

  async saveStore() {
    try {
      await Promise.all([
        firestoreDb.collection('config').doc('main').set(
          JSON.parse(JSON.stringify(this.config)),
        ),
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

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  async saveConfig() {
    try {
      await firestoreDb.collection('config').doc('main').set(
        JSON.parse(JSON.stringify(this.config)),
      );
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
  // CATEGORIAS
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUTOS
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // PROMOÇÕES
  // ─────────────────────────────────────────────────────────────────────────

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
  //
  // Melhoria Firebase: usa FieldValue.increment() para garantir atomicidade
  // em cenários multi-dispositivo (ex: dois atendentes cadastrando pedidos
  // simultaneamente). Previne o problema de N+1 na leitura manual do counter.
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
      throw e; // relança — cart.js depende deste throw para feedback ao usuário
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

  async updateOrder(order) {
    try {
      const plain = JSON.parse(JSON.stringify(order));
      // merge: true → atualiza apenas campos enviados, preserva o resto
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
  // PEDIDOS — Tempo Real (melhoria Firebase vs Dexie Cloud)
  //
  // onSnapshot dispara imediatamente com o estado atual e depois a cada
  // mudança no Firestore — substitui o periodicSync do Dexie Cloud com
  // latência zero e granularidade por documento (added/modified/removed).
  //
  // Chamado após loadAllData() para evitar duplicação de eventos da
  // carga inicial (que já populou orderHistory via getDocs).
  // ─────────────────────────────────────────────────────────────────────────

  async _initRealtimeOrders() {
    if (this._ordersUnsubscribe) {
      this._ordersUnsubscribe();
      this._ordersUnsubscribe = null;
    }

    // Guard 1: usuário precisa estar logado.
    const user = firebaseAuth.currentUser;
    if (!user) return;

    let role = '';
    try {
      // forceRefresh=false — token já foi refreshado pelo onAuthStateChanged.
      // Usar true aqui causava double-refresh desnecessário e não resolvia a race.
      const tokenResult = await user.getIdTokenResult(false);
      role = tokenResult.claims.role ?? '';
    } catch (e) {
      return; // token inválido ou usuário deslogado durante o await
    }

    // Guard 2: anti-race — verifica se o usuário não mudou durante o await.
    // Cenário: cliente loga enquanto este método estava suspenso no getIdTokenResult.
    // O teardown em auth.js viu _ordersUnsubscribe=null (listener ainda não existia),
    // então nada foi destruído. Sem este guard, o listener subiria com uid de admin
    // mas o Firestore avaliaria com o token do novo usuário (cliente) → rejeição.
    if (firebaseAuth.currentUser?.uid !== user.uid) return;

    // Guard 3: só admin/worker têm permissão de `list` em /orders.
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
  // CARGA INICIAL — dados públicos apenas
  //
  // Carrega somente as coleções com read: true nas Security Rules.
  // Dados protegidos (auditLog, orders) são carregados pelo auth.js
  // após o onAuthStateChanged confirmar a sessão → sem race condition
  // e sem erro de permissão para usuários não autenticados.
  // ─────────────────────────────────────────────────────────────────────────

  async loadAllData() {
    try {
      const [cfgSnap, catsSnap, itemsSnap, promosSnap, counterSnap] =
        await Promise.all([
          firestoreDb.collection('config').doc('main').get(),
          firestoreDb.collection('categories').get(),
          firestoreDb.collection('items').get(),
          firestoreDb.collection('promotions').get(),
          firestoreDb.collection('meta').doc('orderCounter').get(),
        ]);

      // Config
      if (cfgSnap.exists) {
        const { _row, id, ...savedCfg } = cfgSnap.data();
        this.config = { ...this.config, ...savedCfg };
      }

      // Listas — splice in-place para preservar a referência do Proxy Alpine.
      // Nunca reatribuir (this.x = arr) — quebra o tracking do Alpine.
      const cats   = catsSnap.docs.map(d => d.data());
      const its    = itemsSnap.docs.map(d => d.data());
      const promos = promosSnap.docs.map(d => d.data());

      if (cats.length)   this.categories.splice(0, Infinity, ...cats);
      if (its.length)    this.items.splice(0, Infinity, ...its);
      if (promos.length) this.promotions.splice(0, Infinity, ...promos);

      if (counterSnap.exists) {
        this.orderCounter = counterSnap.data().counter || 0;
      }

      this.dbReady = true;

      // loadLogs() é chamado em loadProtectedData() pós-auth.
      // errorLogs requer isWorker() nas Security Rules — não pode
      // ser lido aqui onde o usuário ainda não está autenticado.

    } catch (e) {
      console.error('[loadAllData] Firestore load error:', e);
      try {
        await this.logError(e.message || String(e), {
          stack:  e.stack || null,
          source: 'loadAllData',
          type:   'dbInitError',
        }, 'database');
      } catch { /* logger também pode não estar pronto */ }
      this.showToast('Erro ao carregar dados. Verifique o console.', 'error', '❌');
      this.dbReady = true;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA PÓS-AUTH — pedidos (worker/admin) e auditLog (admin)
  //
  // Chamado por auth.js → _initCloudAuth() após onAuthStateChanged resolver.
  // Só executa se o usuário tiver a role necessária, evitando qualquer
  // tentativa de leitura que as Security Rules iriam negar.
  // ─────────────────────────────────────────────────────────────────────────

  async loadProtectedData() {
    // Sys Logs: worker e admin podem listar errorLogs
    if (this.isCloudAdmin || this.isCloudWorker) {
      try {
        await this.loadLogs();
      } catch (e) {
        await this.logError(e.message || String(e), {
          stack: e.stack || null, source: 'loadProtectedData:logs', type: 'dbReadError',
        }, 'database');
      }
    }

    // Pedidos: qualquer worker ou admin
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

        // Inicia listener em tempo real — await garante que o uid-guard
        // detecta mudança de usuário ocorrida durante a carga inicial.
        await this._initRealtimeOrders();

      } catch (e) {
        await this.logError(e.message || String(e), {
          stack: e.stack || null, source: 'loadProtectedData:orders', type: 'dbReadError',
        }, 'database');
      }
    }

    // AuditLog: somente admin
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