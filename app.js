/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — app.js (Main Assembler)
═══════════════════════════════════════════════════════ */

function menuApp() {
  const component = {};

  // 1. Injeta todas as propriedades e métodos na raiz do componente
  //    (Object.defineProperties preserva getters/setters, ao contrário de Object.assign)
  //
  //    Ordem de merge e precedência (último vence em conflito):
  //      appState       → estado inicial + seed data (orderHistory: [], auditLog: [])
  //      appDatabase    → persistência Dexie (loadAllData, saveItems…) sem addAudit
  //      appUtils       → helpers puros (uuid, formatMoney, showToast…)
  //      appCart        → lógica de carrinho e checkout
  //      appAdmin       → CRUD admin + addAudit (hash encadeado) + exportações
  //      appTracking    → rastreamento de pedido pelo cliente
  //      appOrderManager→ gestor de pedidos (fila/kanban/detalhe)
  //
  //    Resultado: this.addAudit sempre resolve para a implementação de appAdmin,
  //    que é a única com hash encadeado para integridade do log.
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appState));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appDatabase));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appUtils));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appCart));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appLogger));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appAdmin));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appTracking));
  Object.defineProperties(component, Object.getOwnPropertyDescriptors(appOrderManager));
    
  // 2. Método de Inicialização (chamado via x-init="init()")
  component.init = async function () {
    try {
      this._loadSecurityState();
      this.darkMode = this.loadSetting('darkMode', false);
      document.documentElement.classList.toggle('dark', this.darkMode);

      // ── Aplica tema salvo ──────────────────────────────────────────────────
      const savedThemeId = this.loadSetting('theme', 'red');
      const savedAccent  = this.loadSetting('customAccent', '#ef4444');
      if (savedThemeId === 'custom') {
        this.customAccent = savedAccent;
        this.applyCustomColor(savedAccent);
      } else {
        const theme = this.themes.find(t => t.id === savedThemeId);
        if (theme) this.setTheme(theme);
      }

      // ── Carrega dados do Banco (Dexie) ────────────────────────────────────
      await this.loadAllData();

      // ── Checa sessão admin ainda válida ───────────────────────────────────
      this._loadSession();

      // ── Alpine Watchers ───────────────────────────────────────────────────
      //
      // Usamos JSON diff para detectar mutações profundas (push/splice) sem
      // depender do proxy do Alpine para propriedades aninhadas.
      //
      // IMPORTANTE: NÃO usamos this.orderHistory = newArray em nenhum watcher.
      // Alpine 3 detecta mutações de array (splice/push) via Proxy.
      // Reatribuir a referência quebraria o vínculo que persistOrder,
      // updateOrder e o polling do order-manager têm com o array original.

      let _snapCat    = JSON.stringify(this.categories);
      let _snapItems  = JSON.stringify(this.items);
      let _snapPromos = JSON.stringify(this.promotions);

      const _maybeSaveCats = async (val) => {
        try {
          const s = JSON.stringify(val);
          if (s !== _snapCat) { _snapCat = s; if (this.dbReady) await this.saveCategories(); }
        } catch (e) { console.error('[watcher:categories] Erro ao salvar:', e); }
      };

      const _maybeSaveItems = async (val) => {
        try {
          const s = JSON.stringify(val);
          if (s !== _snapItems) { _snapItems = s; if (this.dbReady) await this.saveItems(); }
        } catch (e) { console.error('[watcher:items] Erro ao salvar:', e); }
      };

      const _maybeSavePromos = async (val) => {
        try {
          const s = JSON.stringify(val);
          if (s !== _snapPromos) { _snapPromos = s; if (this.dbReady) await this.savePromotions(); }
        } catch (e) { console.error('[watcher:promotions] Erro ao salvar:', e); }
      };

      this.$watch('categories',  _maybeSaveCats);
      this.$watch('items',       _maybeSaveItems);
      this.$watch('promotions',  _maybeSavePromos);

      // Autosave de segurança: captura mutações in-place (ex: cat.active = !cat.active)
      // que o watcher de referência pode não detectar em todos os cenários.
      const _autoSaveInterval = setInterval(async () => {
        if (!this.dbReady) return;
        try {
          await _maybeSaveCats(this.categories);
          await _maybeSaveItems(this.items);
          await _maybeSavePromos(this.promotions);
        } catch (e) {
          console.error('[autoSave] Erro:', e);
          // Não interrompe o intervalo — falhas transitórias são ignoradas.
        }
      }, 4000);

      // ── Dark mode ─────────────────────────────────────────────────────────
      this.$watch('darkMode', val => {
        document.documentElement.classList.toggle('dark', val);
        this.saveSetting('darkMode', val);
      });

      // ── Reatividade do orderHistory para x-for em includes ────────────────
      //
      // Alpine inicializa os escopos filho (includes) antes que loadAllData
      // conclua, portanto o x-for pode renderizar com array vazio.
      //
      // FIX: NÃO usar slice() — isso criaria uma nova referência quebrando o
      // vínculo entre this.orderHistory e todos os módulos que o mutam via splice.
      //
      // Solução: splice(length, 0) é uma inserção de zero elementos — é um no-op
      // que ainda notifica o proxy do Alpine sobre uma mudança no array, forçando
      // o re-render de qualquer x-for que dependa de orderHistory.
      this.$watch('showAdminPanel', (isOpen) => {
        try {
          if (isOpen && this.dbReady) {
            // No-op que aciona reatividade sem quebrar a referência do array.
            this.orderHistory.splice(this.orderHistory.length, 0);
          }
        } catch (e) { console.error('[watcher:showAdminPanel] Erro:', e); }
      });

      this.$watch('adminTab', (tab) => {
        try {
          if ((tab === 'orders' || tab === 'reports') && this.dbReady) {
            this.orderHistory.splice(this.orderHistory.length, 0);
          }
          // Ciclo de vida do Order Manager: inicia/para polling ao trocar de aba.
          if (tab === 'order-manager') {
            this.omEnterTab();
          } else {
            this.omLeaveTab();
          }
        } catch (e) { console.error('[watcher:adminTab] Erro:', e); }
      });

      this.$watch('activeTab', () => {
        try {
          if (this.searchQuery) {
            this.searchQuery = '';
            this.showSearch  = false;
          }
        } catch (e) { /* ignorado */ }
      });

      // ── Atalho de teclado: Escape ─────────────────────────────────────────
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;

        // Fecha modais do cliente
        this.showCart          = false;
        this.showProductModal  = false;
        this.showThemePicker   = false;
        this.showOrderTracking = false;

        // Fecha o formulário de produto mas mantém o painel admin aberto
        if (this.showProductForm) {
          this.showProductForm = false;
          return;
        }

        // FIX: ao fechar o Gestor de Pedidos via Escape, limpa o estado
        // de detalhe e para o polling — sem isso, o estado sujo permanecia
        // entre aberturas (pedido selecionado, modo edição, etc.).
        if (this.showOrderManager) {
          this.omCloseDetail();   // reseta omSelectedOrder, omDraft, omEditMode
          this.omLeaveTab();      // para o polling
          this.showOrderManager  = false;
          return;
        }

        this.showProductForm  = false;
      });

    } catch (e) {
      console.error('[init] Erro durante inicialização:', e);
    }
  };

  return component;
}