/* ═══════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — logger.js
   Logger de Erros do Sistema com persistência Dexie,
   exportação JSON e integração por e-mail (mailto:).
═══════════════════════════════════════════════════════ */

/* ── Constantes ─────────────────────────────────────────── */
const LOG_EMAIL  = 'janyel.lima2809@outlook.com';
const LOG_LEVELS = { error: 0, warn: 1, info: 2 };

const LOG_SEVERITY_META = {
  error: { label: 'Erro',   emoji: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  warn:  { label: 'Aviso',  emoji: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)'  },
  info:  { label: 'Info',   emoji: '🔵', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)'  },
};

/* ── Bootstrap: instala interceptors globais ─────────────── */
// Deve ser chamado UMA VEZ antes do Alpine inicializar o componente.
// Usa uma fila (window._logQueue) para guardar erros capturados ANTES de
// o componente Alpine estar pronto. O appLogger drena a fila em loadLogs().
(function _installGlobalInterceptors() {
  if (window._loggerInstalled) return;
  window._loggerInstalled = true;
  window._logQueue = [];

  // Erros síncronos não capturados
  window.onerror = function (message, source, lineno, colno, error) {
    window._logQueue.push({
      severity: 'error',
      message:  String(message),
      context: {
        source:   source  || 'unknown',
        line:     lineno  || 0,
        column:   colno   || 0,
        stack:    error?.stack || null,
        type:     'uncaughtError',
      },
    });
  };

  // Promises rejeitadas sem catch
  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    window._logQueue.push({
      severity: 'error',
      message:  reason instanceof Error ? reason.message : String(reason),
      context: {
        stack:    reason instanceof Error ? reason.stack : null,
        type:     'unhandledRejection',
        source:   'Promise',
      },
    });
  });

  // Erros de carregamento de recursos (scripts, imagens, etc.)
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window) {
      const el = event.target;
      window._logQueue.push({
        severity: 'warn',
        message:  `Falha ao carregar recurso: ${el.src || el.href || el.tagName}`,
        context: {
          tag:     el.tagName || 'UNKNOWN',
          src:     el.src    || el.href || null,
          type:    'resourceError',
        },
      });
    }
  }, true /* capture phase */);
})();

/* ═══════════════════════════════════════════════════════════
   Módulo Alpine
═══════════════════════════════════════════════════════════ */
const appLogger = {

  /* ── Estado reativo ─────────────────────────────────────── */
  errorLogs:          [],   // DEVE ser [] no estado inicial
  logFilter:          'all', // 'all' | 'error' | 'warn' | 'info' | 'unresolved'
  logSearch:          '',
  // logDetailId REMOVIDO — expand/collapse é x-data local em cada card HTML,
  // assim todos nascem fechados e o estado não vaza entre trocas de aba.
  logClearConfirm:    false,
  _logSessionErrors:  0,

  /* ── Getters reativos ───────────────────────────────────── */
  get filteredLogs() {
    const logs  = Array.isArray(this.errorLogs) ? this.errorLogs : [];
    const q     = (this.logSearch || '').toLowerCase().trim();
    const f     = this.logFilter;

    return logs
      .filter(l => {
        if (f === 'unresolved') return !l.resolved;
        if (f !== 'all')        return l.severity === f;
        return true;
      })
      .filter(l => {
        if (!q) return true;
        const hay = [l.message, l.context?.source, l.context?.type, l.module].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  get logStats() {
    const logs  = Array.isArray(this.errorLogs) ? this.errorLogs : [];
    const today = new Date().toLocaleDateString('pt-BR');
    return {
      total:      logs.length,
      errors:     logs.filter(l => l.severity === 'error').length,
      warns:      logs.filter(l => l.severity === 'warn').length,
      infos:      logs.filter(l => l.severity === 'info').length,
      unresolved: logs.filter(l => !l.resolved).length,
      today:      logs.filter(l => {
        try { return new Date(l.timestamp).toLocaleDateString('pt-BR') === today; } catch { return false; }
      }).length,
    };
  },

  /* ── Gravação de Logs ───────────────────────────────────── */

  /**
   * logError(message, context?, module?)
   * Registra um erro crítico. Persiste no Dexie e adiciona ao array reativo.
   */
  async logError(message, context = {}, module = 'app') {
    return this._writeLog('error', message, context, module);
  },

  async logWarn(message, context = {}, module = 'app') {
    return this._writeLog('warn', message, context, module);
  },

  async logInfo(message, context = {}, module = 'app') {
    return this._writeLog('info', message, context, module);
  },

  /**
   * Método principal de gravação. Chamado internamente.
   */
  async _writeLog(severity, message, context = {}, module = 'app') {
    try {
      // Coleta contexto de ambiente automaticamente
      const env = _buildEnvSnapshot();

      const entry = {
        id:        _generateLogId(),
        severity,
        message:   String(message).slice(0, 2000), // limite de segurança
        module:    String(module || 'app'),
        context:   _sanitizeContext(context),
        env,
        timestamp: Date.now(),
        resolved:  false,
        sessionId: this.sessionId || null,
      };

      // Persiste no Dexie
      await db.errorLogs.add(entry);

      // Atualiza array reativo via push (sem quebrar referência)
      if (Array.isArray(this.errorLogs)) {
        this.errorLogs.push({ ...entry });
        this._logSessionErrors++;
      }

      // Erros críticos mostram toast discreto
      if (severity === 'error' && typeof this.showToast === 'function') {
        this.showToast(`Erro registrado: ${String(message).slice(0, 60)}`, 'error', '🔴');
      }

      return entry.id;
    } catch (persistErr) {
      // Nunca lançar de dentro do logger — apenas console
      console.error('[appLogger._writeLog] Falha ao persistir log:', persistErr);
      return null;
    }
  },

  /* ── Carregamento ───────────────────────────────────────── */

  /**
   * loadLogs(): chamado por loadAllData() após Dexie estar pronto.
   * Drena a fila de erros pré-Alpine e carrega logs históricos.
   */
  async loadLogs() {
    try {
      const rows = await db.errorLogs.orderBy('timestamp').toArray();
      if (Array.isArray(this.errorLogs)) {
        this.errorLogs.splice(0, this.errorLogs.length, ...rows);
      }

      // Drena fila de erros capturados antes do Alpine estar pronto
      const queue = window._logQueue || [];
      window._logQueue = [];
      for (const item of queue) {
        await this._writeLog(item.severity, item.message, item.context, 'window.onerror');
      }
    } catch (e) {
      console.error('[loadLogs] Erro ao carregar logs:', e);
    }
  },

  /* ── Gestão de Logs ─────────────────────────────────────── */

  async markLogResolved(id) {
    try {
      await db.errorLogs.update(id, { resolved: true });
      const idx = this.errorLogs.findIndex(l => l.id === id);
      if (idx !== -1) this.errorLogs.splice(idx, 1, { ...this.errorLogs[idx], resolved: true });
    } catch (e) {
      console.error('[markLogResolved]', e);
    }
  },

  async markAllLogsResolved() {
    try {
      const unresolvedIds = this.errorLogs.filter(l => !l.resolved).map(l => l.id);
      for (const id of unresolvedIds) await db.errorLogs.update(id, { resolved: true });
      this.errorLogs.forEach((l, i) => {
        if (!l.resolved) this.errorLogs.splice(i, 1, { ...l, resolved: true });
      });
      this.showToast('Todos os logs marcados como resolvidos.', 'success', '✅');
    } catch (e) {
      console.error('[markAllLogsResolved]', e);
    }
  },

  async deleteLog(id) {
    try {
      await db.errorLogs.delete(id);
      const idx = this.errorLogs.findIndex(l => l.id === id);
      if (idx !== -1) this.errorLogs.splice(idx, 1);
    } catch (e) {
      console.error('[deleteLog]', e);
    }
  },

  async clearAllLogs() {
    try {
      await db.errorLogs.clear();
      this.errorLogs.splice(0);
      this.logClearConfirm = false;
      this.showToast('Todos os logs apagados.', 'success', '🗑️');
    } catch (e) {
      this.showToast('Erro ao limpar logs.', 'error', '❌');
      console.error('[clearAllLogs]', e);
    }
  },

  /* ── Exportação ─────────────────────────────────────────── */

  exportLogsJSON(scope = 'all') {
    try {
      const logs = scope === 'filtered' ? this.filteredLogs : this.errorLogs.slice();
      const payload = {
        exportedAt:      new Date().toISOString(),
        exportedBy:      'Cardápio Digital Pro — Sys Logs',
        restaurantName:  this.config?.restaurantName || 'N/A',
        totalLogs:       logs.length,
        stats:           this.logStats,
        logs:            logs.sort((a, b) => b.timestamp - a.timestamp),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `syslogs_${_dateSlug()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.showToast(`${logs.length} logs exportados.`, 'success', '💾');
    } catch (e) {
      this.showToast('Erro ao exportar logs.', 'error', '❌');
      console.error('[exportLogsJSON]', e);
    }
  },

  /* ── E-mail (mailto:) ───────────────────────────────────── */

  /**
   * emailLog(log): abre o cliente de e-mail com um log específico formatado.
   */
  emailLog(log) {
    if (!log) return;
    const meta    = LOG_SEVERITY_META[log.severity] || LOG_SEVERITY_META.error;
    const ts      = _formatTs(log.timestamp);
    const subject = encodeURIComponent(
      `[${meta.emoji} ${meta.label.toUpperCase()}] ${log.message.slice(0, 80)} — ${ts}`
    );

    const body = _buildEmailBody({
      title:    '🔴 Relatório de Erro — Cardápio Digital Pro',
      sections: [
        { heading: '📋 IDENTIFICAÇÃO',       lines: [
          `ID:          ${log.id}`,
          `Severidade:  ${meta.emoji} ${meta.label}`,
          `Módulo:      ${log.module || 'N/A'}`,
          `Timestamp:   ${ts}`,
          `Resolvido:   ${log.resolved ? 'Sim ✅' : 'Não ❌'}`,
          `Sessão:      ${log.sessionId || 'N/A'}`,
        ]},
        { heading: '💬 MENSAGEM',             lines: [log.message] },
        { heading: '🔍 CONTEXTO',             lines: [JSON.stringify(log.context, null, 2)] },
        { heading: '🖥️ AMBIENTE NO MOMENTO',  lines: [JSON.stringify(log.env, null, 2)] },
      ],
      restaurant: this.config?.restaurantName,
    });

    window.open(`mailto:${LOG_EMAIL}?subject=${subject}&body=${body}`, '_blank');
  },

  /**
   * emailAllLogs(): envia um sumário de todos os logs não resolvidos.
   */
  emailAllLogs() {
    const logs = this.errorLogs.filter(l => !l.resolved);
    if (!logs.length) {
      this.showToast('Nenhum log não resolvido para enviar.', 'info', 'ℹ️');
      return;
    }

    const subject = encodeURIComponent(
      `[Sys Logs] ${logs.length} log(s) não resolvido(s) — ${this.config?.restaurantName || 'Cardápio Digital'} — ${_dateSlug()}`
    );

    const logLines = logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20) // limite seguro para mailto:
      .map((l, i) => {
        const meta = LOG_SEVERITY_META[l.severity] || LOG_SEVERITY_META.error;
        return [
          `[${i + 1}] ${meta.emoji} ${meta.label} — ${_formatTs(l.timestamp)}`,
          `    Módulo: ${l.module || 'N/A'}`,
          `    Mensagem: ${l.message.slice(0, 200)}`,
          l.context?.source ? `    Fonte: ${l.context.source}` : null,
          l.context?.stack  ? `    Stack: ${String(l.context.stack).slice(0, 300)}` : null,
          '',
        ].filter(Boolean).join('\n');
      }).join('\n');

    const body = _buildEmailBody({
      title:    '📊 Sumário de Logs — Cardápio Digital Pro',
      sections: [
        { heading: '📈 ESTATÍSTICAS',   lines: [
          `Total geral:         ${this.logStats.total}`,
          `Não resolvidos:      ${this.logStats.unresolved}`,
          `Erros:               ${this.logStats.errors}`,
          `Avisos:              ${this.logStats.warns}`,
          `Informações:         ${this.logStats.infos}`,
          `Hoje:                ${this.logStats.today}`,
        ]},
        { heading: '🔴 LOGS NÃO RESOLVIDOS (máx. 20)', lines: [logLines] },
      ],
      restaurant: this.config?.restaurantName,
    });

    window.open(`mailto:${LOG_EMAIL}?subject=${subject}&body=${body}`, '_blank');
  },

  /* ── Helpers visuais expostos ao HTML ───────────────────── */

  logSeverityMeta(severity) {
    return LOG_SEVERITY_META[severity] || LOG_SEVERITY_META.info;
  },

  /** Timestamp absoluto: "28/01/2025 14:32:07" */
  formatLogTimestamp(ts) {
    return _formatTs(ts);
  },

  /** Tempo relativo: "há 2 minutos", "há 3 horas" — usa Day.js relativeTime */
  formatLogRelativeTime(ts) {
    return _relativeTs(ts);
  },

  formatLogContext(ctx) {
    if (!ctx) return 'N/A';
    try { return JSON.stringify(ctx, null, 2); } catch { return String(ctx); }
  },
};

/* ═══════════════════════════════════════════════════════════
   Helpers privados (fora do objeto Alpine)
═══════════════════════════════════════════════════════════ */

/* ── Day.js bootstrap ────────────────────────────────────────
   Day.js é carregado via <script> no index.html (antes de logger.js).
   O plugin relativeTime é registrado aqui uma única vez.
   Fallback para Date nativo caso Day.js não esteja disponível.
─────────────────────────────────────────────────────────── */
(function _bootstrapDayjs() {
  if (typeof dayjs === 'undefined') return;
  // relativeTime: "há 2 minutos", "há 3 horas", etc.
  if (dayjs.extend && typeof window.dayjs_plugin_relativeTime !== 'undefined') {
    dayjs.extend(window.dayjs_plugin_relativeTime);
  }
  // locale pt-BR
  if (typeof window.dayjs_locale_pt_br !== 'undefined') {
    dayjs.locale('pt-br');
  }
})();

function _generateLogId() {
  return 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function _dateSlug() {
  if (typeof dayjs !== 'undefined') return dayjs().format('YYYYMMDDHHmm');
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join('');
}

/**
 * Formata timestamp em string legível.
 * Usa Day.js quando disponível; fallback para Intl.
 */
function _formatTs(ts) {
  if (!ts) return 'N/A';
  try {
    if (typeof dayjs !== 'undefined') {
      return dayjs(ts).format('DD/MM/YYYY HH:mm:ss');
    }
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return String(ts); }
}

/**
 * Retorna tempo relativo: "há 2 minutos", "há 3 horas".
 * Requer Day.js + plugin relativeTime carregados.
 * Fallback para string ISO se plugin não estiver disponível.
 */
function _relativeTs(ts) {
  if (!ts) return 'N/A';
  try {
    if (typeof dayjs !== 'undefined' && typeof dayjs(ts).fromNow === 'function') {
      return dayjs(ts).fromNow();
    }
    // fallback: diff manual em português
    const diff = Date.now() - Number(ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `há ${hrs}h`;
    return `há ${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}

function _buildEnvSnapshot() {
  try {
    return {
      url:        window.location.href,
      userAgent:  navigator.userAgent,
      platform:   navigator.platform || 'N/A',
      language:   navigator.language,
      online:     navigator.onLine,
      screenW:    screen.width,
      screenH:    screen.height,
      colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      capturedAt: typeof dayjs !== 'undefined' ? dayjs().toISOString() : new Date().toISOString(),
    };
  } catch { return {}; }
}

function _sanitizeContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return { raw: String(ctx) };
  try {
    // JSON round-trip remove referências circulares e proxies do Alpine
    return JSON.parse(JSON.stringify(ctx));
  } catch {
    return { raw: '[não serializável]' };
  }
}

function _buildEmailBody({ title, sections, restaurant }) {
  const sep = '─'.repeat(60);
  const lines = [
    title,
    sep,
    `Restaurante:  ${restaurant || 'N/A'}`,
    `Gerado em:    ${new Date().toLocaleString('pt-BR')}`,
    `Sistema:      Cardápio Digital Pro`,
    '',
  ];

  for (const s of sections) {
    lines.push(sep);
    lines.push(s.heading);
    lines.push('');
    lines.push(...s.lines.filter(Boolean));
    lines.push('');
  }

  lines.push(sep);
  lines.push('Este e-mail foi gerado automaticamente pelo sistema.');
  lines.push('Por favor, não responda diretamente a esta mensagem.');

  return encodeURIComponent(lines.join('\n'));
}