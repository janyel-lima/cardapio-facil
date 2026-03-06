/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/address.js  v1.4
   Mixin Alpine — endereço de entrega no fluxo de checkout.

   ╔══════════════════════════════════════════════════════════════╗
   ║  BUG CRÍTICO CORRIGIDO v1.4                                  ║
   ║                                                              ║
   ║  PROBLEMA: No final do arquivo original, dois Object.assign  ║
   ║  adicionavam getters a appAddress:                           ║
   ║                                                              ║
   ║    Object.assign(appAddress, {                               ║
   ║      get currentDeliveryFeeResult() { ... },                 ║
   ║    });                                                       ║
   ║    Object.assign(appAddress, {                               ║
   ║      get storeAddressFormatted() { ... },                    ║
   ║    });                                                       ║
   ║                                                              ║
   ║  Object.assign NÃO copia descritores — ele INVOCA o getter   ║
   ║  imediatamente (com this = appAddress, onde this.checkout    ║
   ║  é undefined) e grava o valor resultante como propriedade    ║
   ║  estática. Quando app.js faz:                                ║
   ║    Object.defineProperties(component,                        ║
   ║      Object.getOwnPropertyDescriptors(appAddress))           ║
   ║  ... ele encontra um valor morto, não um getter reativo.     ║
   ║                                                              ║
   ║  RESULTADO: currentDeliveryFeeResult sempre retornava o      ║
   ║  snapshot {fee:0, zone:null} tirado no boot → deliveryFee,   ║
   ║  deliveryFeeKnown, deliveryOutOfRange nunca atualizavam.     ║
   ║                                                              ║
   ║  SOLUÇÃO: todo o objeto em um único literal. Getters         ║
   ║  declarados com `get foo(){}` dentro do literal são          ║
   ║  preservados como descritores por                            ║
   ║  Object.getOwnPropertyDescriptors — Alpine pode então        ║
   ║  rastreá-los reativamente via Proxy.                         ║
   ╚══════════════════════════════════════════════════════════════╝
═══════════════════════════════════════════════════════════════ */

const appAddress = {

  // ── Endereço estruturado ─────────────────────────────────────
  deliveryAddress: {
    rua: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: '', cep: '',
  },

  // Coordenadas confirmadas pelo pin do mapa
  deliveryCoords: null,   // { lat, lng } | null

  // ── Rota de entrega ──────────────────────────────────────────
  // IMPORTANTE: declarados aqui no literal raiz para que o proxy
  // do Alpine os rastreie desde o boot. Criá-los dinamicamente
  // dentro de fetchDeliveryRoute() os tornaria invisíveis ao
  // sistema reativo.
  deliveryRouteKm:      null,   // km real (OSRM) ou Haversine×1.35
  deliveryRouteFailed:  false,  // true → fallback Haversine
  deliveryRouteLoading: false,  // spinner enquanto calcula

  // ── UI state ─────────────────────────────────────────────────
  cartStep:         'items',
  addressMapStatus: '',
  addressGeocoding: false,
  addressMapReady:  false,

  // Leaflet internals (não reativos)
  _map:    null,
  _marker: null,


  // ════════════════════════════════════════════════════════════
  // GETTERS — TODOS DECLARADOS AQUI NO LITERAL
  //
  // ⚠️  NUNCA mova getters para Object.assign() abaixo deste
  //     objeto. Object.assign() invoca o getter imediatamente
  //     e salva o VALOR como propriedade estática, quebrando
  //     toda a reatividade. Se precisar adicionar getters,
  //     inclua-os aqui, dentro do literal.
  // ════════════════════════════════════════════════════════════

  get deliveryAddressFormatted() {
    const { rua, numero, complemento, bairro, cidade, uf, cep } = this.deliveryAddress;
    return [
      rua && numero ? `${rua}, ${numero}` : rua,
      complemento,
      bairro,
      cidade && uf ? `${cidade} — ${uf}` : cidade,
      cep,
    ].filter(Boolean).join(' · ') || '—';
  },

  get deliveryAddressValid() {
    const { rua, numero, bairro, cidade } = this.deliveryAddress;
    return !!(rua.trim() && numero.trim() && bairro.trim() && cidade.trim());
  },

  get deliveryPayload() {
    return {
      type:    this.checkout?.deliveryType ?? 'delivery',
      address: { ...this.deliveryAddress },
      coords:  this.deliveryCoords ? { ...this.deliveryCoords } : null,
      label:   this.deliveryAddressFormatted,
    };
  },

  // ── Endereço formatado da loja ───────────────────────────────
  //
  // FIX v1.4: estava em Object.assign() separado — destruído.
  // Movido para cá.
  get storeAddressFormatted() {
    const c = this.config;
    if (!c) return '';
    return [
      c.storeRua && c.storeNumero ? `${c.storeRua}, ${c.storeNumero}` : c.storeRua,
      c.storeComplemento,
      c.storeBairro,
      c.storeCidade && c.storeUf ? `${c.storeCidade} — ${c.storeUf}` : c.storeCidade,
      c.storeCep,
    ].filter(Boolean).join(' · ') || '';
  },

  // ── Taxa atual com base na rota calculada ────────────────────
  //
  // FIX v1.4: estava em Object.assign() separado — destruído.
  // Movido para cá.
  //
  // Consumido por:
  //   cart.js → deliveryFee, deliveryFeeKnown, deliveryOutOfRange
  //   cart.html → badge de zona, valor exibido
  //
  // Quando deliveryRouteKm é null (sem coords / ainda calculando)
  // retorna a taxa flat como placeholder para não exibir NaN.
  get currentDeliveryFeeResult() {
    const isPickup = this.checkout?.deliveryType === 'pickup';

    console.debug('[address] currentDeliveryFeeResult avaliado', {
      deliveryType:    this.checkout?.deliveryType ?? '(undefined)',
      deliveryRouteKm: this.deliveryRouteKm,
      zonesCount:      this.config?.deliveryZones?.length ?? 0,
      deliveryFeeFlat: this.config?.deliveryFee ?? 0,
      isPickup,
    });

    if (isPickup) {
      return { fee: 0, zone: null, outOfRange: false };
    }

    const km = this.deliveryRouteKm;

    if (km == null) {
      const flat = Number(this.config?.deliveryFee ?? 0);
      console.debug('[address] currentDeliveryFeeResult → km null, retornando flat', { flat });
      return { fee: flat, zone: null, outOfRange: false };
    }

    const result = this.deliveryFeeForKm(km);
    console.debug('[address] currentDeliveryFeeResult → resultado final', result);
    return result;
  },


  // ════════════════════════════════════════════════════════════
  // MÉTODOS DE CÁLCULO
  // ════════════════════════════════════════════════════════════

  // Resolve taxa para uma distância em km usando as zonas.
  // Number() defensivo: dados do Firestore podem chegar como string.
  deliveryFeeForKm(km) {
    const zones = this.config?.deliveryZones;

    if (!zones?.length || km == null) {
      const flat = Number(this.config?.deliveryFee ?? 0);
      console.debug('[address] deliveryFeeForKm → sem zonas, taxa flat', { km, flat });
      return { fee: flat, zone: null, outOfRange: false };
    }

    const sorted = [...zones].sort((a, b) => Number(a.maxKm) - Number(b.maxKm));
    const zone   = sorted.find(z => km <= Number(z.maxKm));

    if (zone) {
      console.debug('[address] deliveryFeeForKm → zona encontrada', {
        km,
        zoneLabel: zone.label,
        maxKm:     Number(zone.maxKm),
        fee:       Number(zone.fee),
      });
      return { fee: Number(zone.fee), zone, outOfRange: false };
    }

    const outFee = this.config?.deliveryFeeOutOfRange;
    console.debug('[address] deliveryFeeForKm → fora de área', {
      km,
      lastZoneMaxKm: sorted[sorted.length - 1]?.maxKm,
      outFee,
    });
    return {
      fee:        outFee != null ? Number(outFee) : null,
      zone:       null,
      outOfRange: outFee == null,
    };
  },

  // URL Google Maps loja → cliente (gestor de pedidos)
  omMapsRouteUrl(order) {
    const c  = order?.delivery?.coords;
    const sL = this.config?.storeLat;
    const sG = this.config?.storeLng;
    if (!c || !sL || !sG) return null;
    return `https://www.google.com/maps/dir/${sL},${sG}/${c.lat},${c.lng}`;
  },

  // Distância + tempo estimado (gestor de pedidos)
  omCalcDistance(order) {
    const c    = order?.delivery?.coords;
    const sLat = this.config?.storeLat;
    const sLng = this.config?.storeLng;
    if (!c?.lat || !c?.lng || !sLat || !sLng) return null;

    const ROAD_FACTOR = 1.35;
    const R  = 6371;
    const dL = (c.lat - sLat) * Math.PI / 180;
    const dG = (c.lng - sLng) * Math.PI / 180;
    const a  = Math.sin(dL / 2) ** 2
             + Math.cos(sLat * Math.PI / 180)
             * Math.cos(c.lat  * Math.PI / 180)
             * Math.sin(dG / 2) ** 2;
    const km       = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const streetKm = km * ROAD_FACTOR;

    const fmtKm  = d => d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace('.', ',')} km`;
    const fmtMin = m => {
      if (m < 1)  return '< 1 min';
      if (m < 60) return `~${Math.ceil(m)} min`;
      const h = Math.floor(m / 60); const mm = Math.ceil(m % 60);
      return `~${h}h${mm > 0 ? mm + ' min' : ''}`;
    };

    return {
      km, streetKm,
      label:       fmtKm(km),
      streetLabel: fmtKm(streetKm),
      color: km <= 2 ? '#22c55e' : km <= 5 ? '#f59e0b' : '#ef4444',
      moto:  { time: (streetKm / 30) * 60,  label: fmtMin((streetKm / 30)  * 60) },
      carro: { time: (streetKm / 25) * 60,  label: fmtMin((streetKm / 25)  * 60) },
      pe:    { time: (streetKm / 5)  * 60,  label: fmtMin((streetKm / 5)   * 60) },
    };
  },


  // ════════════════════════════════════════════════════════════
  // FETCH DE ROTA (OSRM + fallback Haversine)
  // ════════════════════════════════════════════════════════════

  async fetchDeliveryRoute() {
    const c    = this.deliveryCoords;
    const sLat = this.config?.storeLat;
    const sLng = this.config?.storeLng;

    console.debug('[address] fetchDeliveryRoute iniciado', {
      deliveryCoords: c,
      storeLat:       sLat,
      storeLng:       sLng,
      hasCoords:      !!(c?.lat && c?.lng),
      hasStoreCoords: !!(sLat && sLng),
      deliveryType:   this.checkout?.deliveryType,
      zonesCount:     this.config?.deliveryZones?.length ?? 0,
    });

    if (!c?.lat || !c?.lng) {
      console.warn('[address] fetchDeliveryRoute abortado: deliveryCoords ausente ou inválido', c);
      this.deliveryRouteKm     = null;
      this.deliveryRouteFailed = false;
      return;
    }

    if (!sLat || !sLng) {
      console.warn('[address] fetchDeliveryRoute abortado: config.storeLat/storeLng não configurado', { sLat, sLng });
      this.deliveryRouteKm     = null;
      this.deliveryRouteFailed = false;
      return;
    }

    this.deliveryRouteLoading = true;
    this.deliveryRouteFailed  = false;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${c.lng},${c.lat}?overview=false`;
      console.debug('[address] OSRM request →', url);

      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 6000);
      const res        = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();

      console.debug('[address] OSRM response', { code: data.code, routesCount: data.routes?.length });

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        throw new Error(`OSRM sem rota: code=${data.code}`);
      }

      const kmResult = data.routes[0].distance / 1000;
      this.deliveryRouteKm = kmResult;

      console.info('[address] OSRM sucesso ✓', {
        routeKm:   kmResult,
        feeResult: this.deliveryFeeForKm(kmResult),
      });

    } catch (err) {
      this.deliveryRouteFailed = true;

      const R  = 6371;
      const dL = (c.lat - sLat) * Math.PI / 180;
      const dG = (c.lng - sLng) * Math.PI / 180;
      const a  = Math.sin(dL / 2) ** 2
               + Math.cos(sLat * Math.PI / 180)
               * Math.cos(c.lat * Math.PI / 180)
               * Math.sin(dG / 2) ** 2;
      const haversineKm    = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      this.deliveryRouteKm = haversineKm * 1.35;

      console.warn('[address] OSRM falhou → Haversine×1.35', {
        error:       err?.message || String(err),
        haversineKm: this.deliveryRouteKm,
        feeResult:   this.deliveryFeeForKm(this.deliveryRouteKm),
      });

      this.logWarn?.('OSRM indisponível — usando Haversine×1.35 como fallback', {
        source: 'fetchDeliveryRoute', error: err?.message || String(err),
      }, 'address');

    } finally {
      this.deliveryRouteLoading = false;
      console.debug('[address] fetchDeliveryRoute finalizado', {
        deliveryRouteKm:     this.deliveryRouteKm,
        deliveryRouteFailed: this.deliveryRouteFailed,
        feeResult:           this.currentDeliveryFeeResult,
      });
    }
  },


  // ════════════════════════════════════════════════════════════
  // NAVEGAÇÃO DE PASSOS
  // ════════════════════════════════════════════════════════════

  cartGoToAddress() {
    this._loadSavedAddress();
    this.cartStep = 'address';
    this.logInfo?.('Checkout avançou para etapa de endereço', {
      deliveryType:    this.checkout?.deliveryType,
      hadSavedAddress: !!this.deliveryAddress.rua,
    }, 'address');
    requestAnimationFrame(() => setTimeout(() => this._mapInit(), 60));
  },

  cartConfirmAddress() {
    if (!this.deliveryAddressValid) {
      this.logWarn?.('Tentativa de confirmar endereço incompleto', {
        rua:    !!this.deliveryAddress.rua,
        numero: !!this.deliveryAddress.numero,
        bairro: !!this.deliveryAddress.bairro,
        cidade: !!this.deliveryAddress.cidade,
      }, 'address');
      return;
    }
    this._saveAddress();
    this._mapDestroy();

    this.checkout.address    = this.deliveryAddressFormatted;
    this.checkout.complement = this.deliveryAddress.complemento || '';

    console.debug('[address] cartConfirmAddress', {
      label:     this.deliveryAddressFormatted,
      hasCoords: !!this.deliveryCoords,
      routeKm:   this.deliveryRouteKm,
      feeResult: this.currentDeliveryFeeResult,
    });

    this.logInfo?.('Endereço confirmado — avançando para pagamento', {
      label: this.deliveryAddressFormatted, hasCoords: !!this.deliveryCoords,
    }, 'address');
    this.cartStep = 'payment';
  },

  cartBackToItems() {
    this._mapDestroy();
    this.logInfo?.('Usuário voltou para etapa de itens', {}, 'address');
    this.cartStep = 'items';
  },

  cartBackToAddress() {
    this.cartStep = 'address';
    this.logInfo?.('Usuário voltou para etapa de endereço', {}, 'address');
    requestAnimationFrame(() => setTimeout(() => this._mapInit(), 60));
  },

  cartResetAddress() {
    this.logInfo?.('Endereço e etapas do carrinho resetados', {
      hadCoords: !!this.deliveryCoords, label: this.deliveryAddressFormatted,
    }, 'address');
    this.deliveryAddress      = { rua:'', numero:'', complemento:'', bairro:'', cidade:'', uf:'', cep:'' };
    this.deliveryCoords       = null;
    this.deliveryRouteKm      = null;
    this.deliveryRouteFailed  = false;
    this.deliveryRouteLoading = false;
    this.cartStep             = 'items';
    this.addressMapStatus     = '';
    this.addressMapReady      = false;
    this.checkout.address     = '';
    this.checkout.complement  = '';
    this._mapDestroy();
  },


  // ════════════════════════════════════════════════════════════
  // LEAFLET — ciclo de vida
  // ════════════════════════════════════════════════════════════

  _mapInit() {
    if (this._map) { this._map.invalidateSize(); return; }

    if (typeof L === 'undefined') {
      this.addressMapStatus = '⚠️ Mapa indisponível — verifique os scripts no index.html';
      this.logError?.('Leaflet não encontrado', { source: '_mapInit', type: 'dependencyMissing' }, 'address');
      return;
    }

    const el = document.getElementById('delivery-map');
    if (!el) {
      this.logError?.('Container #delivery-map não encontrado no DOM', {
        source: '_mapInit', type: 'domError', cartStep: this.cartStep,
      }, 'address');
      return;
    }

    const defaultCenter = this.deliveryCoords
      ? [this.deliveryCoords.lat, this.deliveryCoords.lng]
      : [-9.7514, -36.6605];

    try {
      this._map = L.map(el, { zoomControl: false })
        .setView(defaultCenter, this.deliveryCoords ? 17 : 14);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '©OpenStreetMap contributors',
      }).addTo(this._map);

      L.control.zoom({ position: 'bottomright' }).addTo(this._map);

      if (typeof L.Control !== 'undefined' && L.Control.Geocoder) {
        L.Control.geocoder({
          defaultMarkGeocode: false,
          placeholder: 'Buscar rua ou bairro…',
          position: 'topleft',
          collapsed: false,
        }).on('markgeocode', (e) => {
          const { lat, lng } = e.geocode.center;
          this._map.flyTo([lat, lng], 18);
          this._reverseGeocode(lat, lng);
        }).addTo(this._map);
      }

      this._map.on('click', (e) => {
        this._reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      if (this.deliveryCoords) {
        this._placeMarker(this.deliveryCoords.lat, this.deliveryCoords.lng, false);
        this.addressMapStatus = '📍 Último endereço carregado — confirme ou ajuste';
        this.addressMapReady  = true;
      } else {
        this.addressMapStatus = 'Toque no mapa, arraste o pin ou use o GPS';
      }

    } catch (e) {
      this.logError?.(e.message || 'Erro ao inicializar mapa Leaflet', {
        stack: e.stack || null, source: '_mapInit', type: 'leafletInitError',
      }, 'address');
      this.addressMapStatus = '❌ Erro ao inicializar o mapa';
    }
  },

  _mapDestroy() {
    if (this._map) {
      this._map.remove();
      this._map    = null;
      this._marker = null;
      this.addressMapReady = false;
    }
  },

  _placeMarker(lat, lng, fly = true) {
    if (!this._map) return;
    if (this._marker) {
      this._marker.setLatLng([lat, lng]);
    } else {
      this._marker = L.marker([lat, lng], { draggable: true }).addTo(this._map);
      this._marker.on('dragend', () => {
        const pos = this._marker.getLatLng();
        this._reverseGeocode(pos.lat, pos.lng);
      });
    }
    if (fly) this._map.flyTo([lat, lng], 18, { duration: 1.1 });
  },


  // ════════════════════════════════════════════════════════════
  // GEOCODIFICAÇÃO
  // ════════════════════════════════════════════════════════════

  async _reverseGeocode(lat, lng) {
    this._placeMarker(lat, lng);
    this.addressGeocoding = true;
    this.addressMapReady  = false;
    this.addressMapStatus = '⏳ Identificando endereço…';

    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } },
      );
      const data = await res.json();

      if (data?.address) {
        const a = data.address;
        this.deliveryAddress.rua    = a.road || a.pedestrian || a.path || '';
        this.deliveryAddress.numero = a.house_number || '';
        this.deliveryAddress.bairro = a.suburb || a.neighbourhood || a.quarter || a.village || '';
        this.deliveryAddress.cidade = a.city || a.town || a.municipality || 'Arapiraca';
        this.deliveryAddress.uf     = a.state_code || (a.state ? a.state.slice(0,2).toUpperCase() : 'AL');
        this.deliveryAddress.cep    = (a.postcode || '').replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2');

        this.deliveryCoords   = { lat, lng };
        this.addressMapReady  = true;
        this.addressMapStatus = '✅ Endereço identificado — confirme os dados';
        this._saveAddress();

        console.debug('[address] _reverseGeocode OK', {
          coords:    { lat, lng },
          label:     this.deliveryAddressFormatted,
          storeLat:  this.config?.storeLat,
          storeLng:  this.config?.storeLng,
          zones:     this.config?.deliveryZones?.length ?? 0,
        });

        this.logInfo?.('Geocodificação reversa bem-sucedida', {
          coords: { lat, lng }, label: this.deliveryAddressFormatted,
        }, 'address');

        await this.fetchDeliveryRoute();

      } else {
        this.addressMapStatus = '⚠️ Não encontrado — preencha manualmente';
        this.addressMapReady  = true;
        console.warn('[address] Nominatim sem resultado', { lat, lng });
      }

    } catch (e) {
      this.addressMapStatus = '❌ Sem conexão — preencha os campos manualmente';
      this.addressMapReady  = true;
      console.error('[address] _reverseGeocode erro', e);
      this.logError?.(e.message || 'Falha na requisição ao Nominatim', {
        stack: e.stack || null, lat, lng, source: '_reverseGeocode', type: 'fetchError',
      }, 'address');
    } finally {
      this.addressGeocoding = false;
    }
  },

  addressUseGPS() {
    if (!navigator.geolocation) {
      this.addressMapStatus = '⚠️ GPS não disponível neste dispositivo';
      return;
    }
    this.addressGeocoding = true;
    this.addressMapStatus = '🛰️ Aguardando GPS…';

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        console.debug('[address] GPS obtido', { lat: coords.latitude, lng: coords.longitude });
        this._reverseGeocode(coords.latitude, coords.longitude);
      },
      (err) => {
        this.addressGeocoding = false;
        this.addressMapStatus = '❌ Permissão de localização negada';
        console.warn('[address] GPS negado', { code: err.code, message: err.message });
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  },


  // ════════════════════════════════════════════════════════════
  // PERSISTÊNCIA LOCAL
  // ════════════════════════════════════════════════════════════

  _saveAddress() {
    try {
      localStorage.setItem('cdp_deliveryAddress', JSON.stringify({
        address: this.deliveryAddress,
        coords:  this.deliveryCoords,
      }));
    } catch (e) {
      this.logWarn?.('Falha ao salvar endereço no localStorage', {
        error: e.message, source: '_saveAddress', type: 'storageError',
      }, 'address');
    }
  },

  async _loadSavedAddress() {
    try {
      const raw = localStorage.getItem('cdp_deliveryAddress');
      if (!raw) return;
      const { address, coords } = JSON.parse(raw);
      if (address) Object.assign(this.deliveryAddress, address);
      if (coords)  this.deliveryCoords = coords;

      this.checkout.address    = this.deliveryAddressFormatted;
      this.checkout.complement = this.deliveryAddress.complemento || '';

      console.debug('[address] Endereço restaurado do localStorage', {
        label: this.deliveryAddressFormatted, hasCoords: !!coords,
      });

      this.logInfo?.('Endereço anterior restaurado do localStorage', {
        label: this.deliveryAddressFormatted, hasCoords: !!coords,
      }, 'address');

      if (coords) await this.fetchDeliveryRoute();

    } catch (e) {
      this.logWarn?.('Falha ao ler endereço salvo do localStorage', {
        error: e.message, source: '_loadSavedAddress', type: 'storageError',
      }, 'address');
    }
  },

};


/* ══════════════════════════════════════════════════════════════
   VERIFICAÇÃO DE SANIDADE — executa ao carregar o módulo.

   Confirma que currentDeliveryFeeResult e storeAddressFormatted
   são getters reais (não valores estáticos) em appAddress.

   Se esta verificação falhar, significa que alguém moveu um
   getter para Object.assign() novamente — retorne-o ao literal.
══════════════════════════════════════════════════════════════ */
(function _sanityCheckAddressGetters() {
  const critical = [
    'currentDeliveryFeeResult',
    'storeAddressFormatted',
    'deliveryAddressFormatted',
  ];

  let allOk = true;
  critical.forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(appAddress, key);
    if (!desc) {
      console.error(`[address] ❌ CRÍTICO: "${key}" não existe em appAddress`);
      allOk = false;
    } else if (typeof desc.get !== 'function') {
      console.error(
        `[address] ❌ CRÍTICO: "${key}" NÃO é getter (tipo: ${typeof desc.value}). ` +
        'Foi movido para Object.assign()? Object.assign invoca e destrói getters. ' +
        'Mova-o de volta para o literal do objeto.',
        desc,
      );
      allOk = false;
    } else {
      console.debug(`[address] ✓ getter "${key}" OK`);
    }
  });

  if (allOk) {
    console.info('[address] ✅ Todos os getters críticos verificados com sucesso.');
  }
})();