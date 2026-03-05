/**
 * appPromoFilter — v4.1
 *
 * ─── INTEGRAÇÃO ──────────────────────────────────────────────────────────────
 *
 *  1. app.js — adicionar ao Object.assign:
 *       return { ...appState, ...appDatabase, ...appAdmin,
 *                ...appProductCard, ...appPromoFilter, init() { ... } }
 *
 *  2. appState — NÃO declare selectedPromoFilter separadamente.
 *     Ele vive aqui.
 *
 *  3. filteredItems — SUBSTITUA o getter existente pelo deste arquivo.
 *
 * ─── ARQUITETURA ─────────────────────────────────────────────────────────────
 *
 *  Filtros independentes combinados em AND:
 *
 *    searchQuery         →  curto-circuito: ignora categoria e promoção
 *    activeTab           →  filtra por categoria
 *    selectedPromoFilter →  filtra por promoção (ver SENTINEL abaixo)
 *
 *  Getters privados (_prefixo) são bases computadas uma vez por ciclo reativo
 *  do Alpine, reutilizadas por múltiplos getters públicos.
 *
 * ─── SENTINEL ────────────────────────────────────────────────────────────────
 *
 *  PROMO_ANY_ITEM  →  qualquer item "em promoção" (ver _isItemOnPromo)
 *  <uuid>          →  promoção específica
 *  null            →  sem filtro de promoção
 *
 * ─── O QUE É "ITEM EM PROMOÇÃO" ─────────────────────────────────────────────
 *
 *  _isItemOnPromo(item) → fonte única de verdade para o conceito:
 *
 *    ① item.promoId aponta para uma promo ativa de escopo item
 *    ② item.promoPrice < item.price  (preço promocional direto, sem vínculo explícito)
 *
 *  Ambos os caminhos são tratados de forma idêntica em hasItemScopePromos,
 *  promoFilterCount e filteredItems — sem risco de divergência entre badge,
 *  contagem e resultado do filtro.
 *
 * ─── SEMÂNTICA DE DISPONIBILIDADE ────────────────────────────────────────────
 *
 *  promoFilterCount  → conta apenas itens disponíveis (i.available === true)
 *  filteredItems     → retorna todos (disponível ou não); UI trata visualmente
 */

/** @type {string} Sentinel para "qualquer item em promoção" */
const PROMO_ANY_ITEM = '__any_item_promo__';


const appPromoFilter = {

    // ── Estado ────────────────────────────────────────────────────────────────
    selectedPromoFilter: null,


    // ══════════════════════════════════════════════════════════════════════════
    // GETTERS PRIVADOS — bases computadas uma vez, reutilizadas em toda a camada
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Todas as promoções ativas, independente de tipo ou escopo.
     * Base para todos os derivados — evita iterar `this.promotions` múltiplas vezes.
     * @returns {Promo[]}
     */
    get _activePromos() {
        return (this.promotions ?? []).filter(p => p.active);
    },

    /**
     * Set de IDs de promoções que incidem sobre itens individuais.
     * Exclui: cart-wide, freeDelivery, cupons — esses não filtram o catálogo.
     *
     * Metade do critério de _isItemOnPromo; a outra metade é promoPrice.
     * @returns {Set<string>}
     */
    get _itemScopePromoIds() {
        return new Set(
            this._activePromos
                .filter(p =>
                    p.scope !== 'cart' &&
                    p.type  !== 'freeDelivery' &&
                    p.type  !== 'coupon'
                )
                .map(p => p.id)
        );
    },

    /**
     * Itens visíveis na aba ativa, independente de disponibilidade.
     * Usado por filteredItems (UI exibe indisponíveis como grayed-out).
     * @returns {Item[]}
     */
    get _itemsInTab() {
        const { items = [], activeTab } = this;
        return activeTab
            ? items.filter(i => i.category === activeTab)
            : items;
    },

    /**
     * Itens disponíveis na aba ativa.
     * Usado por promoFilterCount — contagem não inclui indisponíveis.
     * @returns {Item[]}
     */
    get _availableInTab() {
        return this._itemsInTab.filter(i => i.available);
    },

    /**
     * Verdadeiro se o item exibe badge de promoção — fonte única de verdade
     * para hasItemScopePromos, promoFilterCount e filteredItems.
     *
     * Dois caminhos — basta um ser verdadeiro:
     *  ① promoId aponta para uma promo ativa de escopo item
     *  ② promoPrice < price (preço promocional direto, sem vínculo explícito)
     *
     * Promos cart-wide (desconto no total) e freeDelivery NÃO entram aqui:
     * elas não colocam badge no item individual, portanto não devem inflar
     * a contagem do botão "🔥 Promoções" nem do filtro de itens.
     *
     * @param {Item} item
     * @returns {boolean}
     */
    _isItemOnPromo(item) {
        return (
            (item.promoId != null && this._itemScopePromoIds.has(item.promoId)) ||
            (item.promoPrice > 0 && item.promoPrice < item.price)
        );
    },


    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Promoções visíveis no banner (excluindo cupons — esses ficam no checkout).
     * @returns {Promo[]}
     */
    get activePromos() {
        return this._activePromos.filter(p => p.type !== 'coupon');
    },

    /**
     * Controla a visibilidade do chip "🔥 Promoções" no filtro de categorias.
     * True quando ao menos um item disponível tem badge de promo (_isItemOnPromo).
     * @returns {boolean}
     */
    get hasItemScopePromos() {
        return (this.items ?? []).some(i => i.available && this._isItemOnPromo(i));
    },

    /**
     * Quantidade de itens disponíveis afetados por uma promoção.
     *
     * PROMO_ANY_ITEM → catálogo inteiro (ignora activeTab, pois o botão
     *   reseta activeTab=null ao clicar). Inclui todos os itens quando
     *   há promo cart-wide ativa, pois o desconto beneficia qualquer item.
     *
     * ID específico  → respeita activeTab:
     *   - cart-wide / freeDelivery → todos os disponíveis na aba
     *   - item-scoped              → só os itens com promoId === id
     *
     * @param {string|null} promoId
     * @returns {number}
     */
    promoFilterCount(promoId) {
        if (!promoId) return 0;

        if (promoId === PROMO_ANY_ITEM) {
            return (this.items ?? []).filter(i => i.available && this._isItemOnPromo(i)).length;
        }

        const promo = this._activePromos.find(p => p.id === promoId);
        if (!promo) return 0;

        const base       = this._availableInTab;
        const isCartWide = promo.scope === 'cart' || promo.type === 'freeDelivery';
        return isCartWide
            ? base.length
            : base.filter(i => i.promoId === promoId).length;
    },

    /**
     * Contagem de itens disponíveis em uma categoria, respeitando o filtro
     * de promoção ativo — alimenta os badges dos cards de categoria.
     *
     * Sem filtro de promo  → total de disponíveis na categoria
     * PROMO_ANY_ITEM       → quantos têm badge de promo nessa categoria
     * ID específico:
     *   item-scoped        → itens com promoId === id nessa categoria
     *   cart-wide          → todos disponíveis (desconto incide em qualquer item)
     *   freeDelivery       → todos disponíveis
     *
     * Retorna null quando filtro de promo está ativo e nenhum item da categoria
     * passa — sinal para o HTML ocultar o card ou mostrá-lo esmaecido.
     *
     * @param {string} catId
     * @returns {{ total: number, filtered: number, hasPromo: boolean }}
     */
    categoryCount(catId) {
        const available = (this.items ?? []).filter(i => i.available && i.category === catId);
        const total     = available.length;
        const f         = this.selectedPromoFilter;

        if (!f) return { total, filtered: total, hasPromo: false };

        let filtered;
        if (f === PROMO_ANY_ITEM) {
            filtered = available.filter(i => this._isItemOnPromo(i)).length;
        } else {
            const promo      = this._activePromos.find(p => p.id === f);
            const isCartWide = !promo || promo.scope === 'cart' || promo.type === 'freeDelivery';
            filtered = isCartWide
                ? total
                : available.filter(i => i.promoId === f).length;
        }

        return { total, filtered, hasPromo: filtered > 0 };
    },

    /**
     * Itens resultantes da combinação de filtros ativos (AND lógico).
     *
     *  searchQuery         → curto-circuito: busca full-text, ignora tab e promo
     *  activeTab           → aplicado via _itemsInTab
     *  selectedPromoFilter → aplicado sobre o resultado da tab
     *
     * @returns {Item[]}
     */
    get filteredItems() {
        // Busca: curto-circuito — ignora todos os outros filtros
        if (this.searchQuery?.trim()) {
            const q = this.searchQuery.toLowerCase();
            return (this.items ?? []).filter(i =>
                i.name.toLowerCase().includes(q) ||
                i.desc?.toLowerCase().includes(q)
            );
        }

        let items = this._itemsInTab;

        // Filtro de promoção
        const f = this.selectedPromoFilter;
        if (f === PROMO_ANY_ITEM) {
            items = items.filter(i => this._isItemOnPromo(i));
        } else if (f) {
            const promo      = this._activePromos.find(p => p.id === f);
            const isCartWide = promo?.scope === 'cart' || promo?.type === 'freeDelivery';
            if (!isCartWide) items = items.filter(i => i.promoId === f);
            // cart-wide / freeDelivery → sem restrição no catálogo
        }

        return items;
    },

    /**
     * Rótulo contextual exibido abaixo dos filtros quando ≥1 filtro está ativo.
     * Retorna null quando nenhum filtro está ativo (bloco some via x-show).
     *
     * Formato:
     *  cat + promo  → "N produtos em 🍽️ Cat · Promo"
     *  só promo     → "N produtos · Promo"
     *  só cat       → "N produtos em 🍽️ Cat"
     *
     * @returns {string|null}
     */
    get crossFilterLabel() {
        const hasCat   = !!this.activeTab;
        const hasPromo = this.selectedPromoFilter !== null;
        if (!hasCat && !hasPromo) return null;

        const count = this.filteredItems.length;
        const noun  = count === 1 ? 'produto' : 'produtos';
        const base  = `${count} ${noun}`;

        const cat       = hasCat   ? (this.categories ?? []).find(c => c.id === this.activeTab) : null;
        const promoName = hasPromo ? this._resolvePromoName(this.selectedPromoFilter) : null;

        if (cat && promoName) return `${base} em ${cat.icon} ${cat.name} · ${promoName}`;
        if (promoName)        return `${base} · ${promoName}`;
        if (cat)              return `${base} em ${cat.icon} ${cat.name}`;
        return base;
    },


    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Resolve o nome legível de um filtro de promoção para uso no crossFilterLabel.
     * Retorna null se o ID não corresponder a nenhuma promoção conhecida.
     *
     * @param {string|null} filter
     * @returns {string|null}
     */
    _resolvePromoName(filter) {
        if (!filter) return null;
        if (filter === PROMO_ANY_ITEM) return 'em promoção';
        return this._activePromos.find(p => p.id === filter)?.name ?? null;
    },
};

// ─── Tipos JSDoc (IDEs inferem sem transpilação) ──────────────────────────────
/**
 * @typedef {{ id:string, active:boolean, type:string, scope:string, name:string, value?:number }} Promo
 * @typedef {{ id:string, name:string, desc?:string, category:string, available:boolean, promoId?:string, price:number, promoPrice?:number }} Item
 */