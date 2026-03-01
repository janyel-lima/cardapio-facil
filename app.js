/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — app.js (Main Assembler)
═══════════════════════════════════════════════════════ */

function menuApp() {
    const component = {};

    // 1. Injeta todas as propriedades e métodos na raiz do componente (preserva Getters/Setters)
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appState));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appDatabase));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appUtils));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appCart));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appAdmin));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appTracking));
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(appOrderManager));

    // 2. Método de Inicialização (Roda automaticamente via x-init="init()")
    component.init = async function() {
        this._loadSecurityState();
        this.darkMode = this.loadSetting('darkMode', false);
        document.documentElement.classList.toggle('dark', this.darkMode);

        // Aplica o tema
        const savedThemeId = this.loadSetting('theme', 'red');
        const savedAccent  = this.loadSetting('customAccent', '#ef4444');
        if (savedThemeId === 'custom') {
            this.customAccent = savedAccent;
            this.applyCustomColor(savedAccent);
        } else {
            const theme = this.themes.find(t => t.id === savedThemeId);
            if (theme) this.setTheme(theme);
        }

        // Carrega dados do Banco (Dexie)
        await this.loadAllData();

        // Checa sessão logada
        this._loadSession();

        // Alpine Watchers — usa JSON diff para detectar mutações profundas (push/splice)
        // sem isso, arrays mutados in-place não disparam o save
        let _snapCat   = JSON.stringify(this.categories);
        let _snapItems = JSON.stringify(this.items);
        let _snapPromos= JSON.stringify(this.promotions);

        const _maybeSaveCats = async (val) => {
            const s = JSON.stringify(val);
            if (s !== _snapCat)   { _snapCat   = s; if (this.dbReady) await this.saveCategories(); }
        };
        const _maybeSaveItems = async (val) => {
            const s = JSON.stringify(val);
            if (s !== _snapItems) { _snapItems = s; if (this.dbReady) await this.saveItems(); }
        };
        const _maybeSavePromos = async (val) => {
            const s = JSON.stringify(val);
            if (s !== _snapPromos){ _snapPromos= s; if (this.dbReady) await this.savePromotions(); }
        };

        this.$watch('categories',  _maybeSaveCats);
        this.$watch('items',       _maybeSaveItems);
        this.$watch('promotions',  _maybeSavePromos);

        // Autosave de segurança: detecta mutações in-place (ex: cat.active = !cat.active)
        // que Alpine pode não propagar para o watcher de referência
        setInterval(async () => {
            if (!this.dbReady) return;
            await _maybeSaveCats(this.categories);
            await _maybeSaveItems(this.items);
            await _maybeSavePromos(this.promotions);
        }, 4000);

        this.$watch('darkMode', val => {
            document.documentElement.classList.toggle('dark', val);
            this.saveSetting('darkMode', val);
        });

        this.$watch('activeTab', () => {
            if (this.searchQuery) { this.searchQuery = ''; this.showSearch = false; }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.showCart = this.showProductModal = this.showThemePicker
                    = this.showProductForm = this.showOrderTracking
                    = this.showOrderManager = false;
            }
        });
    };

    return component;
}