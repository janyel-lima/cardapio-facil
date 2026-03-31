/**
 * ════════════════════════════════════════════════════════════
 *  include.js  —  A Forma Suprema de Include
 * ════════════════════════════════════════════════════════════
 *
 *  ① Declarativo  →  <div data-include="partial.html"></div>
 *  ② Alpine       →  <div x-data="include('partial.html')" x-html="content"></div>
 *  ③ Imperativo   →  await include('#container', 'partial.html', opts?)
 *
 *  opts: { position, cache, onLoad, onError }
 * ════════════════════════════════════════════════════════════
 *
 *  POR QUE importNode E NÃO innerHTML:
 *
 *  O fluxo original era:
 *    rawHtml → DOMParser → doc.body.innerHTML → container.innerHTML
 *
 *  Durante a serialização (doc.body.innerHTML), o browser escapa
 *  caracteres especiais em atributos:
 *    x-show="count > 0"  →  x-show="count &gt; 0"
 *
 *  Na re-inserção (container.innerHTML), Alpine avalia "count &gt; 0"
 *  como JavaScript → SyntaxError silencioso → aba em branco,
 *  x-show congelado, x-for vazio.
 *
 *  Com importNode o fluxo é:
 *    rawHtml → DOMParser → importNode → container.appendChild
 *
 *  Sem serialização intermediária, os atributos chegam ao Alpine
 *  exatamente como foram escritos.
 *
 *  REGRA CENTRAL DE ALPINE (mantida do original):
 *  • Dentro de escopo Alpine existente → insere e não chama initTree
 *  • Fora de qualquer escopo Alpine    → chama initTree manualmente
 * ════════════════════════════════════════════════════════════
 */

; (function (global) {
    'use strict';

    if (global.__includeLoaded) return;
    global.__includeLoaded = true;

    /* ── Shared state ─────────────────────────────────────────── */
    const _cache = new Map();
    const _scripts = new Set();
    const _styles = new Set();

    document.querySelectorAll('script[src]')
        .forEach(s => _scripts.add(_abs(s.src)));
    document.querySelectorAll('link[rel="stylesheet"][href]')
        .forEach(l => _styles.add(_abs(l.href)));

    /* ── Utilities ────────────────────────────────────────────── */
    function _abs(url) {
        return new URL(url, location.href).href;
    }

    async function _fetch(url, useCache = true) {
        const abs = _abs(url);
        if (useCache && _cache.has(abs)) return _cache.get(abs);
        const res = await fetch(abs);
        if (!res.ok) throw new Error(`[include] HTTP ${res.status} → ${abs}`);
        const html = await res.text();
        if (useCache) _cache.set(abs, html);
        return html;
    }

    /* ══════════════════════════════════════════════════════════
     *  PARSE — sem double-parse, sem corrupção de atributos
     * ══════════════════════════════════════════════════════════
     *
     *  Retorna:
     *  • styles  — elementos <link rel="stylesheet"> e <style>
     *  • scripts — elementos <script> (externos e inline)
     *  • nodes   — nós do body prontos para importNode
     *
     *  Scripts e styles são removidos dos nodes ANTES de retornar,
     *  para que não sejam inseridos junto com o conteúdo.
     *  Eles são injetados separadamente por _injectStyles e
     *  _injectScripts, que controlam duplicatas e ordem.
     * ══════════════════════════════════════════════════════════ */
    function _parse(rawHtml) {
        const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

        // Coleta styles de todo o documento (head ou body)
        const styles = [...doc.querySelectorAll('link[rel="stylesheet"], style')];

        // Coleta scripts de todo o documento (head, body e dentro de <template>)
        const scripts = [...doc.querySelectorAll('script')];
        doc.querySelectorAll('template').forEach(tmpl => {
            if (tmpl.content) {
                scripts.push(...tmpl.content.querySelectorAll('script'));
            }
        });

        // Remove scripts e styles do body (serão injetados separadamente)
        // Não removemos do head pois já não estarão nos nodes do body
        doc.body.querySelectorAll('script, link[rel="stylesheet"], style')
            .forEach(n => n.remove());

        // Retorna os nós do body (não a string innerHTML)
        // importNode os copiará para o documento atual sem serialização
        return { styles, scripts, nodes: [...doc.body.childNodes] };
    }

    /* ── Styles ───────────────────────────────────────────────── */
    function _injectStyles(styles) {
        styles.forEach(el => {
            if (el.tagName === 'LINK') {
                const href = _abs(el.getAttribute('href'));
                if (_styles.has(href)) return;
                _styles.add(href);
                const clone = el.cloneNode(true);
                clone.setAttribute('href', href);
                document.head.appendChild(clone);
            } else {
                // <style> inline: injeta sempre (sem dedup por conteúdo)
                document.head.appendChild(document.importNode(el, true));
            }
        });
    }

    /* ── Scripts ──────────────────────────────────────────────── */
    function _isDev(el) {
        const src = (el.getAttribute('src') || '').toLowerCase();
        const code = (el.textContent || '').toLowerCase();
        return [
            'livereload', 'live-reload', 'live_reload',
            'browsersync', 'browser-sync', '_cacheoverride',
            'webpack-dev-server', 'vite/client', '@vite',
            '__vite_ping', 'hot-update', 'hmr',
            'websocket', 'sockjs',
        ].some(p => src.includes(p) || code.includes(p));
    }

    function _loadExternal(el) {
        return new Promise((resolve, reject) => {
            const src = _abs(el.getAttribute('src'));
            if (_scripts.has(src)) { resolve(); return; }
            _scripts.add(src);
            const s = document.createElement('script');
            [...el.attributes].forEach(a => s.setAttribute(a.name, a.value));
            s.src = src;
            s.removeAttribute('defer');
            s.onload = resolve;
            s.onerror = () => reject(new Error(`[include] Falha ao carregar: ${src}`));
            document.head.appendChild(s);
        });
    }

    function _runInline(el) {
        return new Promise(resolve => {
            const code = (el.textContent || '').trim();
            if (!code) { resolve(); return; }
            let blobUrl;
            try {
                blobUrl = URL.createObjectURL(
                    new Blob([code], { type: 'text/javascript' })
                );
            } catch (_) {
                try { (0, eval)(code); } catch (e) {
                    console.warn('[include] inline script falhou:', e);
                }
                resolve(); return;
            }
            const s = document.createElement('script');
            [...el.attributes].forEach(a => {
                if (a.name !== 'src') s.setAttribute(a.name, a.value);
            });
            s.src = blobUrl;
            s.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
            s.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
            document.head.appendChild(s);
        });
    }

    async function _injectScripts(scripts) {
        for (const el of scripts) {
            if (_isDev(el)) continue;
            const src = (el.getAttribute('src') || '').trim();
            if (src) {
                await _loadExternal(el);
            } else if (el.textContent.trim()) {
                await _runInline(el);
            }
        }
    }

    /* ── Aguarda Alpine ───────────────────────────────────────── */
    function _waitAlpine() {
        return new Promise(resolve => {
            if (window.Alpine && window.Alpine.__initialized) {
                resolve(window.Alpine); return;
            }
            document.addEventListener('alpine:initialized',
                () => resolve(window.Alpine), { once: true });
            const t0 = Date.now();
            const poll = setInterval(() => {
                if (window.Alpine && window.Alpine.__initialized) {
                    clearInterval(poll); resolve(window.Alpine);
                } else if (Date.now() - t0 > 10_000) {
                    clearInterval(poll); resolve(null);
                }
            }, 50);
        });
    }

    /* ══════════════════════════════════════════════════════════
     *  INIT ALPINE — lógica original preservada
     * ══════════════════════════════════════════════════════════
     *
     *  • Dentro de escopo Alpine → MutationObserver já cuidou
     *  • Fora de escopo Alpine  → initTree manual
     * ══════════════════════════════════════════════════════════ */
    async function _initAlpine(container) {
        const Alpine = await _waitAlpine();
        if (!Alpine || typeof Alpine.initTree !== 'function') return;

        const insideAlpineTree =
            !!container.closest('[x-data]') ||
            container.hasAttribute('x-data');

        if (insideAlpineTree) return;

        const targets = container.children.length
            ? [...container.children]
            : [container];

        targets.forEach(el => {
            try { Alpine.initTree(el); }
            catch (e) { console.warn('[include] Alpine.initTree falhou:', el, e); }
        });
    }

    /* ══════════════════════════════════════════════════════════
     *  INSERÇÃO — importNode em vez de innerHTML
     * ══════════════════════════════════════════════════════════
     *
     *  importNode(node, deep=true) copia um nó de outro Document
     *  para o documento atual sem serializar/deserializar.
     *  Atributos como x-show="count > 0" chegam intactos ao Alpine.
     * ══════════════════════════════════════════════════════════ */
    function _insert(container, nodes, position) {
        const frag = document.createDocumentFragment();
        nodes.forEach(n => frag.appendChild(document.importNode(n, true)));

        if (position === 'append') {
            container.appendChild(frag);
        } else if (position === 'prepend') {
            container.insertBefore(frag, container.firstChild);
        } else {
            // replace: limpa o container antes
            container.innerHTML = '';
            container.appendChild(frag);
        }
    }

    /* ══════════════════════════════════════════════════════════
     *  MOTOR CENTRAL
     * ══════════════════════════════════════════════════════════ */
    async function _run(container, url, opts = {}) {
        const {
            position = 'replace',
            cache = true,
            onLoad = null,
            onError = null,
        } = opts;

        try {
            const rawHtml = await _fetch(url, cache);
            const { styles, scripts, nodes } = _parse(rawHtml);

            // 1. Injeta CSS no <head> (sem duplicatas)
            _injectStyles(styles);

            // 2. Insere HTML via importNode (sem double-parse, sem corrupção)
            _insert(container, nodes, position);

            // 3. Executa scripts em ordem (externos primeiro se tiver src,
            //    inline via blob URL para não bloquear o parser)
            await _injectScripts(scripts);

            // 4. Inicializa Alpine se necessário
            await _initAlpine(container);

            if (typeof onLoad === 'function') await onLoad(container);

            return container;

        } catch (err) {
            console.error('[include]', err);
            if (typeof onError === 'function') { onError(err); return null; }
            throw err;
        }
    }

    /* ══════════════════════════════════════════════════════════
     *  API PÚBLICA
     * ══════════════════════════════════════════════════════════ */
    async function include(target, url, opts = {}) {
        const el = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (!el) {
            const err = new Error(
                `[include] Container não encontrado: "${target}"`
            );
            if (opts.onError) { opts.onError(err); return null; }
            throw err;
        }
        return _run(el, url, opts);
    }

    /* ① Declarativo — scan de [data-include] ─────────────────── */
    include.scan = (root = document) => {
        const nodes = root.querySelectorAll('[data-include]');
        return Promise.all([...nodes].map(el => _run(el,
            el.getAttribute('data-include'), {
            position: el.getAttribute('data-include-position') || 'replace',
            cache: el.getAttribute('data-include-cache') !== 'false',
        }
        )));
    };

    include.preload = (...urls) => Promise.all(
        urls.map(u => _fetch(u, true).catch(console.warn))
    );
    include.clearCache = () => _cache.clear();

    /* ── Expõe internals ──────────────────────────────────────── */
    include._fetch = _fetch;
    include._parse = _parse;
    include._insert = _insert;
    include._injectStyles = _injectStyles;
    include._injectScripts = _injectScripts;
    include._waitAlpine = _waitAlpine;
    include._initAlpine = _initAlpine;

    /* ② Alpine.data('include') ───────────────────────────────── */
    function _registerAlpine() {
        if (!window.Alpine || typeof Alpine.data !== 'function') return;
        if (Alpine.data.__includeRegistered) return;
        Alpine.data.__includeRegistered = true;

        Alpine.data('include', (url, opts = {}) => ({
            content: '',
            async init() {
                try {
                    const useCache = opts.cache !== false;
                    const rawHtml = await _fetch(url, useCache);
                    // Modo Alpine.data usa x-html → só pode passar string.
                    // Aqui mantemos innerHTML para compatibilidade com x-html.
                    // Para fragments com Alpine directives, prefira data-include.
                    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
                    const styles = [...doc.querySelectorAll('link[rel="stylesheet"], style')];
                    const scripts = [...doc.querySelectorAll('script')];
                    doc.body.querySelectorAll('script, link[rel="stylesheet"], style')
                        .forEach(n => n.remove());
                    _injectStyles(styles);
                    this.content = doc.body.innerHTML;
                    this.$nextTick(async () => {
                        await _injectScripts(scripts);
                        await _initAlpine(this.$el);
                    });
                } catch (err) {
                    console.error('[include] Alpine mode falhou:', url, err);
                }
            },
        }));
    }

    document.addEventListener('alpine:init', _registerAlpine);
    if (window.Alpine) _registerAlpine();

    /* ① Auto-scan no DOMContentLoaded ────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => include.scan());
    } else {
        include.scan();
    }

    global.include = include;

}(window));