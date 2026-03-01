const appUtils = {
  uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },
  djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h |= 0; }
    return (h >>> 0).toString(16).padStart(8, '0');
  },
  nextOrderNumber() {
    this.orderCounter++;
    const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
    return `${date}-${String(this.orderCounter).padStart(4,'0')}`;
  },
  formatMoney(val) {
    if (val == null || isNaN(val)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(val);
  },
  formatDatetime(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(iso));
  },
  showToast(message, type = 'success', icon = '✓') {
    clearTimeout(this._toastTimer);
    this.toast = { visible: true, message, type, icon };
    this._toastTimer = setTimeout(() => { this.toast.visible = false; }, 2800);
  },
  saveSetting(key, value) { try { localStorage.setItem('menuSetting_' + key, JSON.stringify(value)); } catch(e) {} },
  loadSetting(key, fallback) {
    try { const val = localStorage.getItem('menuSetting_' + key); return val !== null ? JSON.parse(val) : fallback; } catch(e) { return fallback; }
  },
  setTheme(theme) {
    this.currentTheme = theme; this.customAccent = theme.accent;
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-hover', theme.hover);
    document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
    document.documentElement.style.setProperty('--accent-light', `rgba(${theme.rgb}, 0.12)`);
    this.saveSetting('theme', theme.id); this.saveSetting('customAccent', theme.accent);
  },
  applyCustomColor(hex) {
    const rgb = this.hexToRgb(hex); const darker = this.darkenHex(hex, 0.15);
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-hover', darker);
    document.documentElement.style.setProperty('--accent-rgb', rgb);
    document.documentElement.style.setProperty('--accent-light', `rgba(${rgb}, 0.12)`);
    this.currentTheme = { id:'custom', name:'Custom', accent:hex };
    this.saveSetting('theme', 'custom'); this.saveSetting('customAccent', hex);
  },
  hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  },
  darkenHex(hex, amount) {
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0, Math.round(r*(1-amount))); g = Math.max(0, Math.round(g*(1-amount))); b = Math.max(0, Math.round(b*(1-amount)));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
};