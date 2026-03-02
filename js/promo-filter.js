/**
 * appPromoFilter — v3.0
 *
 * ─── INTEGRAÇÃO ──────────────────────────────────────────────────────────────
 *
 *  1. app.js — adicionar ao Object.assign:
 *       return { ...appState, ...appDatabase, ...appAdmin,
 *                ...appProductCard, ...appPromoFilter, init() { ... } }
 *
 *  2. appState — NÃO precisa declarar selectedPromoFilter separadamente.
 *     Ele está declarado aqui. Apenas garanta que appPromoFilter está no merge.
 *
 *  3. filteredItems — SUBSTITUA o getter existente pelo deste arquivo.
 *     Busque no seu app por "get filteredItems" e troque.
 *
 * ─── LÓGICA DE FILTRO ────────────────────────────────────────────────────────
 *
 *  searchQuery  ×  activeTab (categoria)  ×  selectedPromoFilter
 *  Todos AND lógico. Busca ativa ignora os outros dois.
 *
 *  selectedPromoFilter pode ser:
 *    null                   → sem filtro
 *    '__any_item_promo__'   → qualquer item com promoId vinculado ativo
 *    <promoId>              → promoção específica
 *
 *  Tipo da promo × comportamento no filtro de itens:
 *    scope:'item' (percentage/fixed vinculado) → filtra por item.promoId === id
 *    scope:'cart' (percentage, fixed)          → mostra todos (desconto no carrinho)
 *    freeDelivery                              → mostra todos (benefício de entrega)
 */

const appPromoFilter = {

    // ── Estado ────────────────────────────────────────────────────────────────
    // DECLARADO AQUI — não precisa declarar em appState.
    selectedPromoFilter: null,


    // ── Promoções ativas para exibição (sem cupons) ───────────────────────────
    get activePromos() {
        return (this.promotions || []).filter(p => p.active && p.type !== 'coupon');
    },

    // ── Há alguma promo de item (scope != cart, tipo vinculável) ──────────────
    get hasItemScopePromos() {
        return (this.promotions || []).some(p =>
            p.active &&
            p.scope !== 'cart' &&
            p.type !== 'freeDelivery' &&
            p.type !== 'coupon'
        );
    },

    // ── Contagem contextual: itens afetados por uma promo, respeitando tab ────
    promoFilterCount(promoId) {
        if (!promoId) return 0;

        if (promoId === '__any_item_promo__') {
            const ids = new Set(
                (this.promotions || [])
                    .filter(p => p.active && p.scope !== 'cart' && p.type !== 'freeDelivery')
                    .map(p => p.id)
            );
            return (this.items || []).filter(i =>
                i.available &&
                (!this.activeTab || i.category === this.activeTab) &&
                i.promoId && ids.has(i.promoId)
            ).length;
        }

        const promo = (this.promotions || []).find(p => p.id === promoId);
        if (!promo) return 0;

        const base = (this.items || []).filter(i =>
            i.available &&
            (!this.activeTab || i.category === this.activeTab)
        );

        if (promo.scope === 'cart' || promo.type === 'freeDelivery') return base.length;
        return base.filter(i => i.promoId === promoId).length;
    },

    // ── Label de cross-filter ─────────────────────────────────────────────────
    get crossFilterLabel() {
        const hasPromo = this.selectedPromoFilter !== null;
        const hasCat   = !!this.activeTab;
        if (!hasPromo && !hasCat) return null;

        const count = this.filteredItems.length;
        const noun  = count === 1 ? 'produto' : 'produtos';

        const catObj  = hasCat  ? (this.categories || []).find(c => c.id === this.activeTab) : null;
        const catName = catObj  ? `${catObj.icon} ${catObj.name}` : null;

        let promoName = null;
        if (this.selectedPromoFilter === '__any_item_promo__') {
            promoName = 'em promoção';
        } else if (this.selectedPromoFilter) {
            const p = (this.promotions || []).find(p => p.id === this.selectedPromoFilter);
            promoName = p ? p.name : null;
        }

        if (hasCat && hasPromo && catName && promoName)
            return `${count} ${noun} em ${catName} · ${promoName}`;
        if (hasPromo && promoName)
            return `${count} ${noun} · ${promoName}`;
        if (hasCat && catName)
            return `${count} ${noun} em ${catName}`;
        return `${count} ${noun}`;
    },

    // ── filteredItems ─────────────────────────────────────────────────────────
    // SUBSTITUI o getter existente no app.
    get filteredItems() {
        let items = this.items || [];

        // 1. Busca — ignora os outros filtros
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            return items.filter(i =>
                i.name.toLowerCase().includes(q) ||
                (i.desc || '').toLowerCase().includes(q)
            );
        }

        // 2. Categoria
        if (this.activeTab) {
            items = items.filter(i => i.category === this.activeTab);
        }

        // 3. Promoção
        if (this.selectedPromoFilter) {
            if (this.selectedPromoFilter === '__any_item_promo__') {
                const ids = new Set(
                    (this.promotions || [])
                        .filter(p => p.active && p.scope !== 'cart' && p.type !== 'freeDelivery')
                        .map(p => p.id)
                );
                items = items.filter(i => i.promoId && ids.has(i.promoId));
            } else {
                const promo = (this.promotions || []).find(p => p.id === this.selectedPromoFilter);
                if (promo && promo.scope !== 'cart' && promo.type !== 'freeDelivery') {
                    items = items.filter(i => i.promoId === this.selectedPromoFilter);
                }
                // cart / freeDelivery → sem filtro adicional
            }
        }

        return items;
    },
};