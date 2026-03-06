/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/storeMap.js  v1.1
   Mixin Alpine — mapa interativo do endereço da loja no painel admin.

   INTEGRAÇÃO:
   ─ app.js: adicione antes do return component:
       Object.defineProperties(component, Object.getOwnPropertyDescriptors(appStoreMap));

   ─ app.js (watcher adminTab já existente): adicione dentro do callback:
       if (tab === 'store') {
         this.$nextTick(() => this.storeMapOpen());
       } else {
         this.storeMapDestroy();
       }

   ─ index.html: mesmos scripts do Leaflet já usados pelo address.js
       <link  rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
       <link  rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css"/>
       <script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script>

   COMPORTAMENTO:
   ─ Clique no mapa ou arrastar o pin → reverse geocode → preenche config.storeXxx + coords
   ─ Botão GPS → navigator.geolocation → mesmo fluxo
   ─ Campos manuais de lat/lng → botão "Ir para coordenadas" → centraliza mapa + coloca pin
   ─ Mapa destruído ao sair da aba para não vazar listeners
═══════════════════════════════════════════════════════════════ */

const appStoreMap = {

  // ── UI state ────────────────────────────────────────────────────────────
  storeMapStatus:    '',
  storeMapReady:     false,
  storeMapGeocoding: false,

  // Leaflet internals (não reativos — prefixo _ evita proxy do Alpine)
  _storeMap:           null,
  _storeMarker:        null,
  _storeAutoSaveTimer: null,   // debounce handle para _storeAddressPatch


  // ══════════════════════════════════════════════════════════════
  // CICLO DE VIDA
  // ══════════════════════════════════════════════════════════════

  /** Abre/inicializa o mapa da loja. Chame via $nextTick após a aba 'store' ficar visível. */
  storeMapOpen() {
    // Se já existe, apenas invalida o tamanho (layout mudou enquanto estava oculto)
    if (this._storeMap) {
      this._storeMap.invalidateSize();
      return;
    }

    if (typeof L === 'undefined') {
      this.storeMapStatus = '⚠️ Leaflet não carregado — adicione os scripts no index.html';
      this.logError('Leaflet não encontrado ao inicializar mapa da loja', {
        source: 'storeMapOpen', type: 'dependencyMissing',
      }, 'storeMap');
      return;
    }

    const el = document.getElementById('store-map');
    if (!el) {
      this.logError('Container #store-map não encontrado no DOM', {
        source: 'storeMapOpen', type: 'domError',
      }, 'storeMap');
      return;
    }

    // Centro inicial: coords salvas ou centro de Arapiraca
    const hasCoords = this.config?.storeLat && this.config?.storeLng;
    const center    = hasCoords
      ? [this.config.storeLat, this.config.storeLng]
      : [-9.7514, -36.6605];

    try {
      this._storeMap = L.map(el, { zoomControl: false }).setView(center, hasCoords ? 17 : 14);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '©OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(this._storeMap);

      L.control.zoom({ position: 'bottomright' }).addTo(this._storeMap);

      // Controle de busca por texto (Nominatim)
      if (L.Control?.Geocoder) {
        L.Control.geocoder({
          defaultMarkGeocode: false,
          placeholder: 'Buscar endereço da loja…',
          position:    'topleft',
          collapsed:   false,
        }).on('markgeocode', (e) => {
          const { lat, lng } = e.geocode.center;
          this._storeMap.flyTo([lat, lng], 18);
          this._storeReverseGeocode(lat, lng);
        }).addTo(this._storeMap);
      }

      // Clique no mapa → coloca/move pin + reverse geocode
      this._storeMap.on('click', (e) => {
        this._storeReverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      // Pin inicial se já houver coordenadas salvas
      if (hasCoords) {
        this._storePlaceMarker(this.config.storeLat, this.config.storeLng, false);
        this.storeMapStatus = '📍 Coordenadas salvas carregadas — ajuste se necessário';
        this.storeMapReady  = true;
        this.logInfo('Mapa da loja iniciado com coords existentes', {
          lat: this.config.storeLat, lng: this.config.storeLng,
        }, 'storeMap');
      } else {
        this.storeMapStatus = 'Clique no mapa, arraste o pin ou use o GPS para definir o local';
        this.logInfo('Mapa da loja iniciado sem coordenadas', { center }, 'storeMap');
      }

    } catch (e) {
      this.storeMapStatus = '❌ Erro ao inicializar o mapa';
      this.logError(e.message || String(e), {
        stack: e.stack || null, source: 'storeMapOpen', type: 'leafletInitError',
      }, 'storeMap');
    }
  },

  /** Remove o mapa e libera recursos. Chame ao sair da aba 'store'. */
  storeMapDestroy() {
    if (this._storeMap) {
      this._storeMap.remove();
      this._storeMap    = null;
      this._storeMarker = null;
      this.storeMapReady = false;
    }
  },


  // ══════════════════════════════════════════════════════════════
  // PIN
  // ══════════════════════════════════════════════════════════════

  _storePlaceMarker(lat, lng, fly = true) {
    if (!this._storeMap) return;

    if (this._storeMarker) {
      this._storeMarker.setLatLng([lat, lng]);
    } else {
      this._storeMarker = L.marker([lat, lng], { draggable: true }).addTo(this._storeMap);
      this._storeMarker.on('dragend', () => {
        const pos = this._storeMarker.getLatLng();
        this.logInfo('Pin da loja arrastado', { lat: pos.lat, lng: pos.lng }, 'storeMap');
        this._storeReverseGeocode(pos.lat, pos.lng);
      });
    }

    if (fly) this._storeMap.flyTo([lat, lng], 18, { duration: 1.0 });
  },

  /**
   * Navega o mapa para as coordenadas digitadas manualmente nos campos
   * config.storeLat / config.storeLng sem fazer reverse geocode.
   * Útil quando o admin sabe as coords mas não quer sobrescrever os campos de endereço.
   */
  storeMapGoToCoords() {
    const lat = parseFloat(this.config?.storeLat);
    const lng = parseFloat(this.config?.storeLng);
    if (isNaN(lat) || isNaN(lng)) {
      this.showToast('Coordenadas inválidas', 'error', '⚠️');
      return;
    }
    if (!this._storeMap) this.storeMapOpen();
    this._storePlaceMarker(lat, lng);
    this.storeMapStatus = '📍 Posição atualizada pelas coordenadas digitadas';
    this.storeMapReady  = true;
    this.logInfo('Mapa da loja centralizado por coords manuais', { lat, lng }, 'storeMap');
  },


  // ══════════════════════════════════════════════════════════════
  // GEOCODIFICAÇÃO
  // ══════════════════════════════════════════════════════════════

  async _storeReverseGeocode(lat, lng) {
    this._storePlaceMarker(lat, lng);
    this.storeMapGeocoding = true;
    this.storeMapReady     = false;
    this.storeMapStatus    = '⏳ Identificando endereço…';

    // Salva coords imediatamente — o endereço é bonus
    this.config.storeLat = parseFloat(lat.toFixed(6));
    this.config.storeLng = parseFloat(lng.toFixed(6));

    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } },
      );
      const data = await res.json();

      if (data?.address) {
        const a = data.address;
        this.config.storeRua         = a.road || a.pedestrian || a.path || '';
        this.config.storeNumero      = a.house_number || '';
        this.config.storeComplemento = '';
        this.config.storeBairro      = a.suburb || a.neighbourhood || a.quarter || a.village || '';
        this.config.storeCidade      = a.city || a.town || a.municipality || '';
        this.config.storeUf          = a.state_code || (a.state ? a.state.slice(0, 2).toUpperCase() : '');
        this.config.storeCep         = (a.postcode || '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');

        this.storeMapStatus = '✅ Endereço identificado — salvando…';
        this.storeMapReady  = true;

        this.logInfo('Reverse geocode da loja bem-sucedido', {
          lat, lng, label: this.storeAddressFormatted,
        }, 'storeMap');

        // Auto-save silencioso: persiste apenas os campos de endereço + coords
        this._storeAddressPatch();

      } else {
        this.storeMapStatus = '⚠️ Endereço não encontrado — preencha manualmente';
        this.storeMapReady  = true;
        // Persiste ao menos as coordenadas mesmo sem endereço textual
        this._storeAddressPatch();
        this.logWarn('Nominatim sem resultado para coords da loja', {
          lat, lng, source: '_storeReverseGeocode',
        }, 'storeMap');
      }

    } catch (e) {
      this.storeMapStatus = '❌ Sem conexão — preencha os campos manualmente';
      this.storeMapReady  = true;
      // Persiste coords mesmo sem reverse geocode (pode salvar endereço parcial)
      this._storeAddressPatch();
      this.logError(e.message || String(e), {
        stack: e.stack || null, lat, lng, source: '_storeReverseGeocode', type: 'fetchError',
      }, 'storeMap');
    } finally {
      this.storeMapGeocoding = false;
    }
  },


  // ══════════════════════════════════════════════════════════════
  // PERSISTÊNCIA — patch silencioso (sem toast, sem audit)
  // ══════════════════════════════════════════════════════════════

  /**
   * Faz merge no Firestore apenas dos campos de endereço + coords da loja.
   * Debounced em 1,2s para absorver drags rápidos sem gerar writes excessivos.
   * Não exibe toast nem cria entrada no auditLog — é um rascunho automático.
   * O saveConfig() oficial (botão "Salvar Configurações") sobrescreve tudo
   * com audit completo e é o save canônico.
   */
  _storeAddressPatch() {
    clearTimeout(this._storeAutoSaveTimer);
    this._storeAutoSaveTimer = setTimeout(async () => {
      if (!this.dbReady) return;
      try {
        const patch = {
          storeLat:         this.config.storeLat         ?? null,
          storeLng:         this.config.storeLng         ?? null,
          storeRua:         this.config.storeRua         ?? '',
          storeNumero:      this.config.storeNumero      ?? '',
          storeComplemento: this.config.storeComplemento ?? '',
          storeBairro:      this.config.storeBairro      ?? '',
          storeCidade:      this.config.storeCidade      ?? '',
          storeUf:          this.config.storeUf          ?? '',
          storeCep:         this.config.storeCep         ?? '',
        };

        await firestoreDb
          .collection('config')
          .doc('main')
          .set(patch, { merge: true });

        this.storeMapStatus = '✅ Endereço identificado e salvo';
        this.logInfo('Patch de endereço da loja salvo no Firestore', {
          lat: patch.storeLat, lng: patch.storeLng,
          label: this.storeAddressFormatted,
          source: '_storeAddressPatch',
        }, 'storeMap');

      } catch (e) {
        this.storeMapStatus = '⚠️ Endereço identificado — salve manualmente';
        this.logError(e.message || String(e), {
          stack: e.stack || null, source: '_storeAddressPatch', type: 'dbWriteError',
        }, 'storeMap');
      }
    }, 1200);
  },

  /**
   * Botão GPS do admin — obtém posição atual e preenche os campos da loja.
   * Substitui o handler inline que estava no HTML da store tab.
   */
  storeMapUseGPS() {
    if (!navigator.geolocation) {
      this.storeMapStatus = '⚠️ GPS não disponível neste dispositivo';
      this.logWarn('navigator.geolocation indisponível na store tab', {
        source: 'storeMapUseGPS',
      }, 'storeMap');
      return;
    }

    this.storeMapGeocoding = true;
    this.storeMapStatus    = '🛰️ Aguardando GPS…';

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.logInfo('GPS da loja obtido', {
          lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy,
        }, 'storeMap');
        // Garante que o mapa está inicializado antes de colocar o pin
        if (!this._storeMap) {
          this.storeMapOpen();
          // Pequeno delay para o Leaflet terminar o layout antes de flyTo
          setTimeout(() => this._storeReverseGeocode(coords.latitude, coords.longitude), 200);
        } else {
          this._storeReverseGeocode(coords.latitude, coords.longitude);
        }
      },
      (err) => {
        this.storeMapGeocoding = false;
        this.storeMapStatus    = '❌ Permissão de localização negada';
        this.logWarn('GPS negado na store tab', {
          code: err.code, message: err.message, source: 'storeMapUseGPS',
        }, 'storeMap');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  },
};