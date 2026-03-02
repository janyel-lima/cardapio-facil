/* ═══════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/report-template.js
   Relatório completo de fechamento.

   Seções:
     1. Resumo Contábil  — DRE + KPIs + formas de pagamento
     2. Pedidos do Dia   — por pedido com desconto detalhado
     3. Itens Detalhados — preço original vs. promocional
     4. Ranking Produtos — top 10 com % da receita
     5. Histórico Geral  — agrupado por data com DRE por dia
     6. Promoções & Cupons — ranking de uso, impacto, por pedido

   Equação contábil:
     Receita Bruta − Descontos + Entregas = Receita Líquida

   Nota: pedidos antigos (sem appliedPromos/couponDetail)
   degradam graciosamente — mostram apenas o total do desconto.
════════════════════════════════════════════════════════════ */

function buildReportHTML({ today, allTime, orderHistory, promotions, config, accent, fmt, verifyHash }) {

  /* ── paleta ── */
  const purple = accent;
  const white  = '#ffffff';
  const black  = '#0d0d0f';
  const bg     = '#f5f3ff';
  const card   = '#ffffff';
  const border = '#e4dff5';
  const muted  = '#6b5f8a';
  const faint  = '#f3f0fb';
  const ok     = '#16a34a';
  const danger = '#dc2626';

  const esc   = s => String(s ?? '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const money = v => (typeof fmt === 'function') ? fmt(v) : `R$ ${(+v||0).toFixed(2).replace('.',',')}`;
  const pct   = (v, total) => total > 0 ? (v / total * 100).toFixed(1) + '%' : '0%';

  const payLabel  = { pix:'PIX', card:'Cartão', cash:'Dinheiro' };
  const typeLabel = { delivery:'Delivery', pickup:'Retirada' };
  const promoTypeLabel = { percentage:'% desconto', fixed:'R$ desconto', freeDelivery:'Frete grátis', coupon:'Cupom' };

  const payMeta = {
    pix:  { label:'PIX',
      icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.354 2.275a.9.9 0 011.292 0l2.55 2.55a3.6 3.6 0 005.09 0l.356-.357a.45.45 0 01.636.636l-.357.357a4.5 4.5 0 01-6.364 0L12 3.909l-2.557 2.552a4.5 4.5 0 01-6.364 0l-.357-.357a.45.45 0 01.636-.636l.357.357a3.6 3.6 0 005.089 0l2.55-2.55zm-7.69 9.23a4.5 4.5 0 016.364 0L12 13.057l2.026-2.026a.45.45 0 01.636.636L12.636 13.7a.9.9 0 01-1.272 0l-2.026-2.026a3.6 3.6 0 00-5.09 0l-.356.357a.45.45 0 01-.636-.636l.408-.89zm7.69 3.77a.9.9 0 011.292 0l2.55 2.55a3.6 3.6 0 005.09 0l.356-.357a.45.45 0 01.636.636l-.357.357a4.5 4.5 0 01-6.364 0L12 16.909l-2.557 2.552a4.5 4.5 0 01-6.364 0l-.357-.357a.45.45 0 01.636-.636l.357.357a3.6 3.6 0 005.089 0l2.55-2.55z"/></svg>` },
    card: { label:'Cartão',
      icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 5v9h16V9H4zm2 5h4v2H6v-2z"/></svg>` },
    cash: { label:'Dinheiro',
      icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 2a8 8 0 100 16A8 8 0 0012 4zm1 3v1.28c1.17.4 2 1.5 2 2.72 0 1.64-1.34 3-3 3s-3-1.36-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1c-1.66 0-3-1.36-3-3 0-1.22.83-2.32 2-2.72V7h2zm-1 12v-1.28c-1.17-.4-2-1.5-2-2.72h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1c-1.66 0-3-1.36-3-3 0-1.22.83-2.32 2-2.72V10h2v1.28c1.17.4 2 1.5 2 2.72h-2c0-.55-.45-1-1-1s-1 .45-1 1 .45 1 1 1c1.66 0 3 1.36 3 3 0 1.22-.83 2.32-2 2.72V19h-2z"/></svg>` },
  };

  /* ── agregados do dia ── */
  const raw           = today.rawOrders || [];
  const grossRevenue  = raw.reduce((s,o) => s + (o.subtotal    || 0), 0);
  const totalDiscount = raw.reduce((s,o) => s + (o.discount    || 0), 0);
  const totalDelivery = raw.reduce((s,o) => s + (o.deliveryFee || 0), 0);
  const netRevenue    = today.revenue || 0;
  const ordersWithDiscount = raw.filter(o => (o.discount||0) > 0).length;
  const ordersWithCoupon   = raw.filter(o => o.coupon).length;
  const freeDeliveries     = raw.filter(o => o.deliveryType==='delivery' && (o.deliveryFee||0)===0).length;

  const generatedAt = new Date().toLocaleString('pt-BR', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit',
  });

  /* ════ SEÇÃO 1 — RESUMO CONTÁBIL ════ */

  const dreRows = `
    <tr class="dre-gross">
      <td class="dre-label">Receita Bruta <span class="dre-hint">(Σ subtotais sem descontos)</span></td>
      <td class="dre-value">${money(grossRevenue)}</td>
      <td class="dre-pct">100%</td>
    </tr>
    <tr class="dre-deduct">
      <td class="dre-label">(−) Descontos e Cupons
        <span class="dre-hint">${ordersWithDiscount} pedido(s) com desconto${ordersWithCoupon > 0 ? ` · ${ordersWithCoupon} com cupom` : ''}</span>
      </td>
      <td class="dre-value dre-neg">${totalDiscount > 0 ? '− ' + money(totalDiscount) : money(0)}</td>
      <td class="dre-pct dre-neg">${pct(totalDiscount, grossRevenue)}</td>
    </tr>
    <tr class="dre-add">
      <td class="dre-label">(+) Taxa de Entrega Cobrada
        <span class="dre-hint">${freeDeliveries > 0 ? `${freeDeliveries} entrega(s) grátis por promoção` : 'sem fretes grátis'}</span>
      </td>
      <td class="dre-value dre-pos">+ ${money(totalDelivery)}</td>
      <td class="dre-pct dre-pos">${pct(totalDelivery, grossRevenue)}</td>
    </tr>
    <tr class="dre-net">
      <td class="dre-label"><strong>(=) Receita Líquida</strong>
        <span class="dre-hint">valor efetivamente recebido</span>
      </td>
      <td class="dre-value dre-total"><strong>${money(netRevenue)}</strong></td>
      <td class="dre-pct dre-total">${pct(netRevenue, grossRevenue)}</td>
    </tr>`;

  const payRows = ['pix','card','cash'].map(id => {
    const m = payMeta[id];
    const val = today.byPayment?.[id] ?? 0;
    const p   = netRevenue > 0 ? (val / netRevenue * 100) : 0;
    return `
    <tr class="pay-row">
      <td class="pay-icon-cell"><span class="pay-icon">${m.icon}</span></td>
      <td class="pay-label-cell">${m.label}</td>
      <td class="pay-bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${p.toFixed(1)}%"></div></div></td>
      <td class="pay-pct-cell">${p.toFixed(0)}%</td>
      <td class="pay-value-cell">${money(val)}</td>
    </tr>`;
  }).join('');

  /* ════ SEÇÃO 2 — PEDIDOS DO DIA ════ */

  /* helper: descreve os descontos de um pedido em texto compacto */
  function discountDetail(o) {
    const parts = [];
    // promoções automáticas (novo campo)
    (o.appliedPromos || []).forEach(p => {
      const label = p.type === 'percentage' ? `${p.name} (${p.value}%)` : `${p.name} (− ${money(p.discountAmount)})`;
      parts.push(`<span class="chip chip-promo">${esc(label)}</span>`);
    });
    // frete grátis (novo campo)
    if (o.freeDeliveryPromo) {
      parts.push(`<span class="chip chip-free">${esc(o.freeDeliveryPromo.name)} (frete grátis)</span>`);
    }
    // cupom (novo campo couponDetail, fallback para coupon)
    if (o.couponDetail) {
      const cd = o.couponDetail;
      const label = cd.type === 'percentage'
        ? `🎟 ${cd.code} (${cd.value}% = − ${money(cd.discountAmount)})`
        : `🎟 ${cd.code} (− ${money(cd.discountAmount)})`;
      parts.push(`<span class="chip chip-coupon">${esc(label)}</span>`);
    } else if (o.coupon && !o.couponDetail) {
      parts.push(`<span class="chip chip-coupon">🎟 ${esc(o.coupon)}</span>`);
    }
    if (!parts.length && (o.discount || 0) > 0) {
      // pedido antigo sem snapshot — mostra só o total
      parts.push(`<span class="neg-val">− ${money(o.discount)}</span>`);
    }
    return parts.length ? parts.join(' ') : '<span class="sub-cell">—</span>';
  }

  const orderRows = !raw.length
    ? `<tr><td colspan="9" class="empty-row">Nenhum pedido hoje</td></tr>`
    : raw.map((o, i) => {
        const integrity = (typeof verifyHash === 'function') ? verifyHash(o) : true;
        const hashBadge = o.hash
          ? `<span class="chip ${integrity ? 'chip-ok':'chip-danger'}">${integrity?'✓':'⚠'}</span>` : '';
        const delivCell = o.deliveryType === 'delivery'
          ? ((o.deliveryFee||0) === 0
              ? `<span class="chip chip-free">Grátis</span>`
              : money(o.deliveryFee))
          : `<span class="sub-cell">Retirada</span>`;
        return `
      <tr>
        <td class="idx-cell">${i+1}</td>
        <td class="mono-cell">${esc(o.orderNumber)}</td>
        <td class="time-cell">${esc(o.time||'-')}</td>
        <td>${esc(o.name)}</td>
        <td><span class="chip chip-pay">${esc(payLabel[o.payment]||o.payment)}</span></td>
        <td class="money-cell sub-cell">${money(o.subtotal)}</td>
        <td class="discount-cell">${discountDetail(o)}</td>
        <td class="money-cell sub-cell">${delivCell}</td>
        <td class="money-cell"><strong>${money(o.total)}</strong></td>
        <td>${hashBadge}</td>
      </tr>`;
      }).join('');

  const orderTotalsRow = raw.length ? `
    <tr class="totals-row">
      <td colspan="5" class="totals-label">Totais do Dia</td>
      <td class="money-cell">${money(grossRevenue)}</td>
      <td class="money-cell neg-val">− ${money(totalDiscount)}</td>
      <td class="money-cell">${money(totalDelivery)}</td>
      <td class="money-cell" style="color:${purple}"><strong>${money(netRevenue)}</strong></td>
      <td></td>
    </tr>` : '';

  /* ════ SEÇÃO 3 — ITENS DETALHADOS ════ */

  const itemRows = !raw.length
    ? `<tr><td colspan="8" class="empty-row">Nenhum item hoje</td></tr>`
    : raw.flatMap(o =>
        (o.items||[]).map(item => {
          const hasPromo = item.promoPrice != null && item.originalPrice != null
            && item.promoPrice > 0 && item.promoPrice < item.originalPrice;
          const unitCell = hasPromo
            ? `<span class="orig-price">${money(item.originalPrice)}</span><strong class="neg-val">${money(item.unitPrice)}</strong>`
            : money(item.unitPrice || 0);
          const complCell = (item.complementsTotal||0) > 0
            ? `<span class="pos-val">+ ${money(item.complementsTotal)}</span>`
            : '<span class="sub-cell">—</span>';
          return `
      <tr>
        <td class="mono-cell">${esc(o.orderNumber)}</td>
        <td class="sub-cell">${esc(o.name)}</td>
        <td>${esc(item.name)}</td>
        <td class="center-cell">${item.qty||1}</td>
        <td class="money-cell">${unitCell}</td>
        <td class="money-cell">${complCell}</td>
        <td class="money-cell"><strong>${money(item.total||0)}</strong></td>
        <td class="sub-cell">${item.note ? esc(item.note) : '—'}</td>
      </tr>`;
        })
      ).join('');

  /* ════ SEÇÃO 4 — RANKING PRODUTOS ════ */

  const topRows = !(today.topProducts?.length)
    ? `<tr><td colspan="5" class="empty-row">Sem dados</td></tr>`
    : today.topProducts.map((p, i) => {
        const share = pct(p.total, netRevenue);
        const barW  = netRevenue > 0 ? (p.total / netRevenue * 100).toFixed(1) : 0;
        return `
      <tr>
        <td class="rank-cell">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td>${esc(p.name)}</td>
        <td class="center-cell">${p.qty}</td>
        <td class="money-cell">${money(p.total)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="bar-track" style="flex:1"><div class="bar-fill" style="width:${barW}%"></div></div>
            <span class="sub-cell" style="width:40px;text-align:right">${share}</span>
          </div>
        </td>
      </tr>`;
      }).join('');

  /* ════ SEÇÃO 5 — HISTÓRICO GERAL ════ */

  const allOrders   = orderHistory || [];
  const histByDate  = {};
  allOrders.forEach(o => { const d = o.date||'—'; if (!histByDate[d]) histByDate[d]=[]; histByDate[d].push(o); });
  const sortedDates = Object.keys(histByDate).sort((a,b) => {
    const ms = s => { const [dd,mm,yyyy]=s.split('/'); return new Date(`${yyyy}-${mm}-${dd}`).getTime()||0; };
    return ms(b)-ms(a);
  });

  const histGross    = allOrders.reduce((s,o) => s+(o.subtotal   ||0), 0);
  const histDiscount = allOrders.reduce((s,o) => s+(o.discount   ||0), 0);
  const histDelivery = allOrders.reduce((s,o) => s+(o.deliveryFee||0), 0);
  const histNet      = allOrders.reduce((s,o) => s+(o.total      ||0), 0);

  const histRows = !allOrders.length
    ? `<tr><td colspan="8" class="empty-row">Nenhum pedido no histórico</td></tr>`
    : sortedDates.flatMap(date => {
        const orders      = histByDate[date];
        const dayGross    = orders.reduce((s,o) => s+(o.subtotal   ||0),0);
        const dayDiscount = orders.reduce((s,o) => s+(o.discount   ||0),0);
        const dayDelivery = orders.reduce((s,o) => s+(o.deliveryFee||0),0);
        const dayNet      = orders.reduce((s,o) => s+(o.total      ||0),0);
        const groupRow = `
      <tr class="group-row">
        <td colspan="4" class="group-label">${esc(date)} <span style="font-weight:400;color:${muted}">${orders.length} pedido(s)</span></td>
        <td class="group-label money-cell sub-cell">${money(dayGross)}</td>
        <td class="group-label money-cell neg-val">${dayDiscount>0?'− '+money(dayDiscount):'—'}</td>
        <td class="group-label money-cell pos-val">${dayDelivery>0?'+ '+money(dayDelivery):'—'}</td>
        <td class="group-label money-cell" style="color:${purple}"><strong>${money(dayNet)}</strong></td>
      </tr>`;
        const rows = orders.map(o => `
      <tr>
        <td class="mono-cell">${esc(o.orderNumber)}</td>
        <td class="time-cell">${esc(o.time||'-')}</td>
        <td>${esc(o.name)}</td>
        <td><span class="chip chip-pay">${esc(payLabel[o.payment]||o.payment)}</span></td>
        <td class="money-cell sub-cell">${money(o.subtotal)}</td>
        <td class="money-cell">${(o.discount||0)>0
          ? `<span class="neg-val">− ${money(o.discount)}</span>${o.coupon ? ` <span class="chip chip-coupon" style="font-size:9px">🎟 ${esc(o.coupon)}</span>` : ''}`
          : '<span class="sub-cell">—</span>'}</td>
        <td class="money-cell sub-cell">${(o.deliveryFee||0)>0?money(o.deliveryFee):(o.deliveryType==='delivery'?'<span class="chip chip-free" style="font-size:9px">grátis</span>':'<span class="sub-cell">retirada</span>')}</td>
        <td class="money-cell"><strong>${money(o.total)}</strong></td>
      </tr>`).join('');
        return [groupRow, rows];
      }).join('');

  const histTotalsRow = allOrders.length ? `
    <tr class="totals-row">
      <td colspan="4" class="totals-label">Totais Gerais</td>
      <td class="money-cell">${money(histGross)}</td>
      <td class="money-cell neg-val">− ${money(histDiscount)}</td>
      <td class="money-cell pos-val">+ ${money(histDelivery)}</td>
      <td class="money-cell" style="color:${purple}"><strong>${money(histNet)}</strong></td>
    </tr>` : '';

  /* ════ SEÇÃO 6 — PROMOÇÕES & CUPONS ════ */

  /* 6a — ranking de promoções automáticas (por quantidade de aplicações e desconto gerado) */
  const promoStats = {}; // id → { name, type, value, uses, totalDiscount, orderNumbers }
  allOrders.forEach(o => {
    (o.appliedPromos || []).forEach(p => {
      if (!promoStats[p.id]) promoStats[p.id] = { name:p.name, type:p.type, value:p.value, uses:0, totalDiscount:0, orders:[] };
      promoStats[p.id].uses++;
      promoStats[p.id].totalDiscount += (p.discountAmount||0);
      promoStats[p.id].orders.push(o.orderNumber);
    });
    if (o.freeDeliveryPromo) {
      const fp = o.freeDeliveryPromo;
      if (!promoStats[fp.id]) promoStats[fp.id] = { name:fp.name, type:'freeDelivery', value:0, uses:0, totalDiscount:0, orders:[] };
      promoStats[fp.id].uses++;
      promoStats[fp.id].totalDiscount += (fp.savedAmount||0);
      promoStats[fp.id].orders.push(o.orderNumber);
    }
  });

  const promoRanking = Object.values(promoStats).sort((a,b) => b.uses - a.uses);
  const hasPromoData = promoRanking.length > 0;

  const promoRankRows = !hasPromoData
    ? `<tr><td colspan="5" class="empty-row">Nenhuma promoção automática registrada neste período<br><span style="font-size:10px">Pedidos antigos não possuem este detalhe — disponível a partir dos novos pedidos</span></td></tr>`
    : promoRanking.map((p, i) => {
        const typeTag = promoTypeLabel[p.type] || p.type;
        const valueTxt = p.type === 'percentage' ? `${p.value}%`
          : p.type === 'fixed' ? money(p.value)
          : p.type === 'freeDelivery' ? 'Frete grátis'
          : `${p.value}`;
        const ordersPreview = p.orders.slice(0,6).map(n=>`<span class="chip" style="font-size:9px">#${esc(n)}</span>`).join(' ')
          + (p.orders.length > 6 ? ` <span class="sub-cell">+${p.orders.length-6}</span>` : '');
        return `
      <tr>
        <td class="rank-cell">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td><strong>${esc(p.name)}</strong></td>
        <td><span class="chip chip-promo">${typeTag} · ${valueTxt}</span></td>
        <td class="center-cell"><strong>${p.uses}</strong></td>
        <td class="money-cell neg-val">− ${money(p.totalDiscount)}</td>
        <td class="sub-cell">${ordersPreview}</td>
      </tr>`;
      }).join('');

  /* 6b — ranking de cupons */
  const couponStats = {};
  allOrders.forEach(o => {
    const code = o.couponDetail?.code || o.coupon;
    if (!code) return;
    if (!couponStats[code]) couponStats[code] = {
      code,
      type:          o.couponDetail?.type  || '?',
      value:         o.couponDetail?.value || 0,
      uses:          0,
      totalDiscount: 0,
      orders:        [],
    };
    couponStats[code].uses++;
    couponStats[code].totalDiscount += (o.couponDetail?.discountAmount || o.discount || 0);
    couponStats[code].orders.push(o.orderNumber);
  });

  const couponRanking = Object.values(couponStats).sort((a,b) => b.uses - a.uses);
  const hasCouponData = couponRanking.length > 0;

  const couponRankRows = !hasCouponData
    ? `<tr><td colspan="5" class="empty-row">Nenhum cupom utilizado neste período</td></tr>`
    : couponRanking.map((c, i) => {
        const valueTxt = c.type === 'percentage' ? `${c.value}% de desconto`
          : c.type === 'fixed' ? `− ${money(c.value)}`
          : c.value ? money(c.value) : '—';
        const ordersPreview = c.orders.slice(0,6).map(n=>`<span class="chip" style="font-size:9px">#${esc(n)}</span>`).join(' ')
          + (c.orders.length > 6 ? ` <span class="sub-cell">+${c.orders.length-6}</span>` : '');
        return `
      <tr>
        <td class="rank-cell">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td><span class="chip chip-coupon">🎟 ${esc(c.code)}</span></td>
        <td class="sub-cell">${valueTxt}</td>
        <td class="center-cell"><strong>${c.uses}</strong></td>
        <td class="money-cell neg-val">− ${money(c.totalDiscount)}</td>
        <td class="sub-cell">${ordersPreview}</td>
      </tr>`;
      }).join('');

  /* 6c — promoções cadastradas (inventário) */
  const allPromos = promotions || [];
  const promoInventoryRows = !allPromos.length
    ? `<tr><td colspan="5" class="empty-row">Nenhuma promoção cadastrada</td></tr>`
    : allPromos.map(p => {
        const valueTxt = p.type === 'percentage' ? `${p.value}%`
          : p.type === 'fixed' ? `− ${money(p.value)}`
          : p.type === 'freeDelivery' ? 'Frete grátis'
          : p.type === 'coupon' ? `Cupom: ${p.code || '—'}${p.value ? ` (${p.type==='percentage'?p.value+'%':'− '+money(p.value)})` : ''}`
          : '—';
        const minTxt = (p.minOrder||0) > 0 ? `Mín: ${money(p.minOrder)}` : '—';
        const expTxt = p.expiresAt ? p.expiresAt : '—';
        const stat   = promoStats[p.id] || couponStats[p.code];
        const usesTxt = stat ? `${stat.uses}×` : '0×';
        return `
      <tr>
        <td>${esc(p.name)}</td>
        <td><span class="chip chip-promo">${esc(promoTypeLabel[p.type]||p.type)}</span></td>
        <td>${esc(valueTxt)}</td>
        <td class="sub-cell">${minTxt}</td>
        <td class="sub-cell">${expTxt}</td>
        <td class="center-cell">${usesTxt}</td>
        <td>
          <span class="chip ${p.active ? 'chip-ok' : 'chip-danger'}">${p.active ? 'Ativa' : 'Inativa'}</span>
        </td>
      </tr>`;
      }).join('');

  /* ════ HTML ════ */

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Fechamento ${esc(today.date)} — ${esc(config.restaurantName)}</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:${bg};color:${black};font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{max-width:1040px;margin:0 auto;padding:36px 40px 56px}

    /* HEADER */
    .header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:2.5px solid ${purple};margin-bottom:32px}
    .header-store{font-size:22px;font-weight:800;color:${black};letter-spacing:-.4px;margin-bottom:4px}
    .header-sub{font-size:12px;color:${muted}}
    .header-right{text-align:right;flex-shrink:0}
    .header-badge{font-size:16px;font-weight:800;color:${purple}}
    .header-date{font-size:11px;color:${muted};margin-top:3px}

    /* SECTION */
    .section{margin-bottom:36px}
    .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${purple};margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .section-title::after{content:'';flex:1;height:1px;background:${border}}
    .section-subtitle{font-size:11px;color:${muted};margin-bottom:10px}

    /* KPI */
    .kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
    .kpi-card{background:${card};border:1px solid ${border};border-radius:10px;padding:14px 16px;text-align:center}
    .kpi-value{font-size:26px;font-weight:800;color:${purple};line-height:1.1}
    .kpi-value.sm{font-size:16px}
    .kpi-label{font-size:10px;color:${muted};margin-top:5px;font-weight:500}

    /* DRE */
    .dre-block{background:${card};border:1px solid ${border};border-radius:10px;overflow:hidden;margin-bottom:16px}
    .dre-block table{width:100%;border-collapse:collapse}
    .dre-block td{padding:10px 16px;border-bottom:1px solid ${border};vertical-align:middle}
    .dre-block tr:last-child td{border-bottom:none}
    .dre-label{font-size:12.5px;color:${black}}
    .dre-hint{font-size:10px;color:${muted};margin-left:6px;font-weight:400}
    .dre-value{text-align:right;font-size:13px;font-weight:600;width:130px;white-space:nowrap}
    .dre-pct{text-align:right;font-size:11px;color:${muted};width:56px}
    .dre-gross  td{background:${faint}}
    .dre-deduct td{background:#fdf4ff}
    .dre-add    td{background:#f0fdf4}
    .dre-net    td{background:${purple}0d;border-top:2px solid ${border}!important}
    .dre-neg{color:${danger}!important}
    .dre-pos{color:${ok}!important}
    .dre-total{color:${purple}!important;font-size:14px!important}

    /* PAY BLOCK */
    .pay-block{background:${card};border:1px solid ${border};border-radius:10px;overflow:hidden}
    .pay-block table{width:100%;border-collapse:collapse}
    .pay-row td{padding:10px 14px;border-bottom:1px solid ${border};vertical-align:middle;color:${black}}
    .pay-row:last-child td{border-bottom:none}
    .pay-icon-cell{width:36px}
    .pay-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:${faint};color:${purple}}
    .pay-icon svg{width:13px;height:13px}
    .pay-label-cell{font-weight:600}
    .pay-bar-cell{width:36%;padding-left:16px!important}
    .bar-track{height:5px;background:${faint};border-radius:99px;overflow:hidden}
    .bar-fill{height:100%;background:${purple};border-radius:99px}
    .pay-pct-cell{width:40px;text-align:right;font-size:11px;color:${muted}}
    .pay-value-cell{width:100px;text-align:right;font-weight:700}

    /* DATA TABLES */
    .data-table{width:100%;border-collapse:collapse;background:${card};border:1px solid ${border};border-radius:10px;overflow:hidden}
    .data-table thead tr{background:${purple}}
    .data-table th{padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:${white};letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
    .data-table td{padding:7px 10px;border-bottom:1px solid ${border};font-size:11.5px;vertical-align:middle;color:${black}}
    .data-table tbody tr:last-child td{border-bottom:none}
    .data-table tbody tr:nth-child(even) td{background:${faint}}
    .group-row td{background:${purple}12!important;border-bottom:1px solid ${border};border-top:2px solid ${border}}
    .group-label{font-size:11px;font-weight:700;color:${purple};padding:7px 10px}
    .totals-row td{background:${purple}0a!important;border-top:2px solid ${border}!important}
    .totals-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${muted};text-align:right}

    /* células */
    .idx-cell{width:22px;font-weight:600;color:${muted};font-size:10px}
    .rank-cell{width:30px;font-size:14px;text-align:center}
    .time-cell{width:46px;font-family:monospace;color:${muted};font-size:11px}
    .mono-cell{font-family:monospace;font-size:11px;color:${muted};white-space:nowrap}
    .sub-cell{font-size:11px;color:${muted}}
    .money-cell{text-align:right;white-space:nowrap}
    .center-cell{text-align:center}
    .discount-cell{white-space:normal;min-width:160px;line-height:1.8}
    .empty-row{text-align:center;color:${muted};padding:18px!important;line-height:1.8}
    .neg-val{color:${danger};font-weight:600}
    .pos-val{color:${ok};font-weight:600}
    .orig-price{text-decoration:line-through;color:${muted};font-size:10px;margin-right:3px}

    /* chips */
    .chip{display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;background:${faint};color:${purple};border:1px solid ${border}}
    .chip-pay{background:#ede9fe;color:#6d28d9;border-color:#c4b5fd}
    .chip-ok{background:#f0fdf4;color:${ok};border-color:#bbf7d0}
    .chip-danger{background:#fff1f2;color:${danger};border-color:#fecaca}
    .chip-coupon{background:#fdf4ff;color:#a21caf;border-color:#f0abfc}
    .chip-promo{background:#fefce8;color:#a16207;border-color:#fde68a}
    .chip-free{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}

    .page-break{page-break-before:always;padding-top:28px}

    /* footer */
    .footer{margin-top:40px;padding:11px 16px;background:${faint};border:1px solid ${border};border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${muted}}

    @media print{
      body{background:${white}!important}
      .page{padding:16px 20px}
      .kpi-card,.pay-block,.data-table,.dre-block{border-color:#ddd!important}
      .bar-track{background:#ede9fe!important}
      .data-table tbody tr:nth-child(even) td{background:#faf8ff!important}
      .dre-gross td{background:#fafafa!important}.dre-deduct td{background:#fdf9ff!important}
      .dre-add td{background:#f8fff9!important}.dre-net td{background:#f8f4ff!important}
      .group-row td{background:#f0edff!important}.totals-row td{background:#f8f6ff!important}
      .footer{background:#f5f3ff!important;border-color:#ddd!important}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <header class="header">
    <div>
      <div class="header-store">${esc(config.restaurantName||'Restaurante')}</div>
      <div class="header-sub">${[config.city,config.whatsapp].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="header-right">
      <div class="header-badge">FECHAMENTO DO DIA</div>
      <div class="header-date">${esc(today.date)} &nbsp;·&nbsp; Gerado em ${generatedAt}</div>
    </div>
  </header>

  <!-- ════ 1. RESUMO CONTÁBIL ════ -->
  <section class="section">
    <div class="section-title">1 · Resumo Contábil</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${today.orders}</div><div class="kpi-label">Pedidos Hoje</div></div>
      <div class="kpi-card"><div class="kpi-value sm">${money(grossRevenue)}</div><div class="kpi-label">Receita Bruta</div></div>
      <div class="kpi-card"><div class="kpi-value sm" style="color:${danger}">${money(totalDiscount)}</div><div class="kpi-label">Descontos / Cupons</div></div>
      <div class="kpi-card"><div class="kpi-value sm">${money(netRevenue)}</div><div class="kpi-label">Receita Líquida</div></div>
      <div class="kpi-card"><div class="kpi-value sm">${money(today.avgTicket)}</div><div class="kpi-label">Ticket Médio</div></div>
    </div>
    <div class="dre-block"><table><tbody>${dreRows}</tbody></table></div>
    <div class="pay-block"><table><tbody>${payRows}</tbody></table></div>
  </section>

  <!-- ════ 2. PEDIDOS DO DIA ════ -->
  <section class="section">
    <div class="section-title">2 · Pedidos do Dia</div>
    <table class="data-table">
      <thead><tr>
        <th class="idx-cell">#</th><th>Nº Pedido</th><th>Hora</th><th>Cliente</th><th>Pagamento</th>
        <th style="text-align:right">Subtotal</th><th>Descontos Aplicados</th>
        <th style="text-align:right">Entrega</th><th style="text-align:right">Total</th><th>Hash</th>
      </tr></thead>
      <tbody>${orderRows}${orderTotalsRow}</tbody>
    </table>
  </section>

  <!-- ════ 3. ITENS DETALHADOS ════ -->
  <section class="section page-break">
    <div class="section-title">3 · Itens Detalhados</div>
    <table class="data-table">
      <thead><tr>
        <th>Nº Pedido</th><th>Cliente</th><th>Item</th><th style="text-align:center">Qtd</th>
        <th style="text-align:right">Preço Unit.</th><th style="text-align:right">Complementos</th>
        <th style="text-align:right">Total Item</th><th>Obs.</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </section>

  <!-- ════ 4. RANKING PRODUTOS ════ -->
  <section class="section">
    <div class="section-title">4 · Ranking de Produtos</div>
    <table class="data-table">
      <thead><tr>
        <th class="rank-cell">#</th><th>Produto</th>
        <th style="text-align:center">Qtd Vendida</th>
        <th style="text-align:right">Faturamento</th><th>% da Receita Líquida</th>
      </tr></thead>
      <tbody>${topRows}</tbody>
    </table>
  </section>

  <!-- ════ 5. HISTÓRICO GERAL ════ -->
  <section class="section page-break">
    <div class="section-title">5 · Histórico Geral</div>
    <div class="section-subtitle">
      ${allOrders.length} pedido(s) &nbsp;·&nbsp;
      Bruto: <strong>${money(histGross)}</strong> &nbsp;·&nbsp;
      Descontos: <strong style="color:${danger}">− ${money(histDiscount)}</strong> &nbsp;·&nbsp;
      Entregas: <strong style="color:${ok}">+ ${money(histDelivery)}</strong> &nbsp;·&nbsp;
      Líquido: <strong style="color:${purple}">${money(histNet)}</strong>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Nº Pedido</th><th>Hora</th><th>Cliente</th><th>Pagamento</th>
        <th style="text-align:right">Subtotal</th>
        <th style="text-align:right">Desconto / Cupom</th>
        <th style="text-align:right">Entrega</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${histRows}${histTotalsRow}</tbody>
    </table>
  </section>

  <!-- ════ 6. PROMOÇÕES & CUPONS ════ -->
  <section class="section page-break">
    <div class="section-title">6 · Promoções &amp; Cupons</div>

    <!-- 6a: ranking de promoções automáticas -->
    <div class="section-subtitle">Ranking de Promoções Automáticas — por nº de aplicações no histórico</div>
    <table class="data-table" style="margin-bottom:20px">
      <thead><tr>
        <th class="rank-cell">#</th><th>Nome da Promoção</th><th>Tipo / Valor</th>
        <th style="text-align:center">Usos</th>
        <th style="text-align:right">Desconto Gerado</th>
        <th>Pedidos</th>
      </tr></thead>
      <tbody>${promoRankRows}</tbody>
    </table>

    <!-- 6b: ranking de cupons -->
    <div class="section-subtitle">Ranking de Cupons Utilizados</div>
    <table class="data-table" style="margin-bottom:20px">
      <thead><tr>
        <th class="rank-cell">#</th><th>Código</th><th>Benefício</th>
        <th style="text-align:center">Usos</th>
        <th style="text-align:right">Desconto Gerado</th>
        <th>Pedidos</th>
      </tr></thead>
      <tbody>${couponRankRows}</tbody>
    </table>

    <!-- 6c: inventário de promoções cadastradas -->
    <div class="section-subtitle">Todas as Promoções Cadastradas</div>
    <table class="data-table">
      <thead><tr>
        <th>Nome</th><th>Tipo</th><th>Benefício</th>
        <th>Pedido Mín.</th><th>Expira em</th>
        <th style="text-align:center">Usos</th><th>Status</th>
      </tr></thead>
      <tbody>${promoInventoryRows}</tbody>
    </table>
  </section>

  <footer class="footer">
    <span>Cardápio Digital Pro &nbsp;·&nbsp; Relatório Completo de Fechamento</span>
    <span>${esc(config.restaurantName||'')} &nbsp;·&nbsp; ${esc(today.date)}</span>
  </footer>

</div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;
}