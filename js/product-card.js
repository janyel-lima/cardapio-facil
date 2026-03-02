/**
 * appProductCard — v5.0
 *
 * Exibe TODAS as promoções disponíveis para o item:
 *   1. Promo vinculada diretamente ao item (item.promoId) — chip verde
 *   2. Promos de carrinho ativas (scope:cart, exceto cupons) — chip laranja/azul
 *
 * Chips gerados como string HTML via cardAllPromosHTML(item) → x-html.
 * Zero <template> dentro do card, zero #document-fragment no DevTools.
 * Todos os métodos no escopo raiz (menuApp) — reatividade direta no Proxy.
 */

const appProductCard = {

    // ── 1. Promo vinculada ao item (via promoId) ──────────────────────────────
    // Retorna o objeto da promo se existir, estiver ativa e for do tipo item.
    cardItemPromo(item) {
        if (!item.promoId) return null;
        return (this.promotions || []).find(p =>
            p.id === item.promoId &&
            p.active
        ) || null;
    },

    // ── 2. Promos de carrinho ativas (scope:cart, exceto cupons) ──────────────
    cardCartPromos(item) {
        return (this.promotions || []).filter(p =>
            p.active &&
            (p.scope === 'cart' || !p.scope) &&
            p.type !== 'coupon'
        );
    },

    // ── 3. União: item promo + cart promos ────────────────────────────────────
    // Item promo aparece primeiro (desconto garantido), depois as de carrinho.
    cardAllPromos(item) {
        const all = [];
        const itemPromo = this.cardItemPromo(item);
        if (itemPromo) all.push({ ...itemPromo, _source: 'item' });
        this.cardCartPromos(item).forEach(p => all.push({ ...p, _source: 'cart' }));
        return all;
    },

    // ── 4. HTML dos chips ─────────────────────────────────────────────────────
    // Retorna string HTML; o template aplica via x-html="cardAllPromosHTML(item)".
    // Máximo 3 chips visíveis + overflow "+N mais".
    cardAllPromosHTML(item) {
        const promos = this.cardAllPromos(item);
        if (!promos.length) return '';

        const visible = promos.slice(0, 3);
        const extra   = promos.length - 3;

        // Estilos por origem/tipo
        const styleItem     = 'background:rgba(34,197,94,.12);color:#16a34a;border-color:rgba(34,197,94,.35)';
        const styleCart     = 'background:rgba(var(--accent-rgb),.1);color:var(--accent);border-color:rgba(var(--accent-rgb),.3)';
        const styleFreight  = 'background:rgba(59,130,246,.1);color:#3b82f6;border-color:rgba(59,130,246,.3)';
        const base = 'display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:4px 10px;border-radius:9999px;border:1px solid;white-space:nowrap';

        const chips = visible.map(p => {
            let st, icon, label;

            if (p._source === 'item') {
                // Promo vinculada ao item — verde, ícone de etiqueta
                st   = styleItem;
                icon = '🏷️';
                if (p.type === 'percentage') label = `${p.name} −${p.value}%`;
                else if (p.type === 'fixed') label = `${p.name} −${this.formatMoney(p.value)}`;
                else                          label = p.name;
            } else if (p.type === 'freeDelivery') {
                st    = styleFreight;
                icon  = '🚚';
                label = p.minOrder > 0
                    ? `Frete grátis +${this.formatMoney(p.minOrder)}`
                    : 'Frete grátis';
            } else {
                // Promo de carrinho (percentage, fixed)
                st   = styleCart;
                icon = '🔥';
                if (p.type === 'percentage') label = `${p.name} −${p.value}%`;
                else if (p.type === 'fixed') label = `${p.name} −${this.formatMoney(p.value)}`;
                else                          label = p.name;
            }

            return `<span style="${base};${st}">${icon} ${label}</span>`;
        });

        if (extra > 0) {
            const stExtra = 'border-color:var(--border);color:var(--text-muted);background:var(--surface-muted)';
            chips.push(`<span style="${base};${stExtra}">+${extra} mais</span>`);
        }

        return chips.join('');
    },

    // ── Desconto % do item (para badge na imagem) ─────────────────────────────
    cardPct(item) {
        const price = item.price || 0;
        const pp    = item.promoPrice;
        return pp != null && price > 0 ? Math.round((price - pp) / price * 100) : 0;
    },

    // ── Economia adicional estimada via melhor % de carrinho ──────────────────
    _cardAddSaved(item) {
        const base    = item.promoPrice != null ? item.promoPrice : (item.price || 0);
        const bestPct = this.cardCartPromos(item)
            .filter(p => p.type === 'percentage')
            .reduce((max, p) => Math.max(max, p.value), 0);
        return bestPct > 0 ? +(base * bestPct / 100).toFixed(2) : 0;
    },

    cardHasSavings(item) {
        const saved    = (item.price || 0) - (item.promoPrice ?? item.price ?? 0);
        const addSaved = this._cardAddSaved(item);
        return saved > 0 || addSaved > 0;
    },

    cardSavingsLabel(item) {
        const price    = item.price || 0;
        const pp       = item.promoPrice;
        const saved    = pp != null ? price - pp : 0;
        const addSaved = this._cardAddSaved(item);
        if (!this.cardHasSavings(item)) return '';

        const fmt = v => this.formatMoney(v);

        if (saved > 0 && addSaved > 0)
            return `💰 Economize ~${fmt(saved + addSaved)} (${fmt(saved)} no item + ~${fmt(addSaved)} no pedido)`;
        if (saved > 0)
            return `💰 Economize ${fmt(saved)}`;

        const best = this.cardCartPromos(item)
            .filter(p => p.type === 'percentage')
            .sort((a, b) => b.value - a.value)[0];
        return `💰 Economize ~${fmt(addSaved)}` + (best ? ` c/ ${best.name}` : ' no pedido');
    },
};