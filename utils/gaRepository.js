// GA4 Measurement Protocol — analytics-only event layer (never blocks storage flow)
const GaRepository = (() => {
  'use strict';

  // ── State ──
  let _measurementId = null;
  let _apiSecret = null;
  let _initialized = false;
  let _clientId = null;
  let _debugEnabled = false;

  // ── Dedupe ──
  const _seenListCarIds = new Set();
  const _seenDetailCarIds = new Set();
  const _OBSERVED_COOLDOWN_MS = 60 * 1000;
  const _observedLastSent = new Map(); // car_id → timestamp

  // ── Constants ──
  const PARAM_SOURCE = 'event_source'; // GA4 reserves 'source', use event_source
  const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
  const CLIENT_ID_KEY = 'ga_client_id';
  const MAX_STR_LEN = 100;
  const DAY_MS = 86400000;
  const GA_MESSAGE_TYPE = 'ENCAR_GA_SEND';

  // Fields that must never be sent to GA4
  const FORBIDDEN = new Set([
    'vehicleNo', 'url', 'title', 'fallbackKey',
    'priceElement', 'cardElement', 'sourceType'
  ]);

  const NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;
  const ALWAYS_LOG_EVENTS = new Set(['car_seen_from_detail', 'car_seen_from_list']);

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  function init(config) {
    if (!config) {
      console.warn('[GA] init blocked: config missing');
      return;
    }
    if (typeof config.getConfigStatus === 'function') {
      const status = config.getConfigStatus();
      if (!status.ready) {
        console.warn('[GA] init blocked:', status.reason);
        return;
      }
    }
    if (!config.measurementId || !config.apiSecret) {
      console.warn('[GA] init blocked: measurementId/apiSecret missing');
      return;
    }
    _measurementId = config.measurementId;
    _apiSecret = config.apiSecret;
    _debugEnabled = Boolean(config.debugEnabled);
    _initialized = true;
    _ensureClientId().catch(() => {});
  }

  function isReady() {
    return _initialized && Boolean(_measurementId) && Boolean(_apiSecret);
  }

  function getReadyStatus() {
    if (!_initialized) {
      return {
        ready: false,
        reason: 'repository not initialized'
      };
    }
    if (!_measurementId) {
      return {
        ready: false,
        reason: 'measurementId missing'
      };
    }
    if (!_apiSecret) {
      return {
        ready: false,
        reason: 'apiSecret missing'
      };
    }
    return {
      ready: true,
      reason: 'ready'
    };
  }

  function resetPageSession() {
    _seenListCarIds.clear();
    _seenDetailCarIds.clear();
  }

  function sendGAEvent(eventName, params) {
    if (_debugEnabled || ALWAYS_LOG_EVENTS.has(eventName)) {
      console.log('[GA EVENT]', {
        eventName,
        params: _cleanParams(params || {})
      });
    }
    return _send(eventName, params || {});
  }

  async function trackPriceObserved(vehicle, sourceType) {
    const v = _stripForbidden(vehicle);
    const carId = _carId(v);
    if (_debugEnabled) {
      console.log('[GA EVENT] trackPriceObserved entered', {
        carId,
        sourceType: _str(sourceType),
        price: _latestPrice(v)
      });
    }
    if (!carId) return;

    const now = Date.now();
    const lastSent = _observedLastSent.get(carId);
    if (lastSent && now - lastSent < _OBSERVED_COOLDOWN_MS) return;
    _observedLastSent.set(carId, now);

    const price = _latestPrice(v);
    await sendGAEvent('car_price_observed', {
      car_id: carId,
      price_manwon: _toManwon(price),
      [PARAM_SOURCE]: _str(sourceType),
      price_range: _toPriceRange(price),
      year: _int(v.year),
      mileage_bucket: _toMileageBucket(v.mileage),
      is_first_observation: Array.isArray(v.history) && v.history.length === 1,
      days_since_first_seen: _daysSince(v.firstSeenAt)
    });
  }

  async function trackPriceChanged(vehicle, priceBeforeWon, sourceType) {
    const v = _stripForbidden(vehicle);
    const carId = _carId(v);
    if (!carId) return;

    const normBefore = _normalize(priceBeforeWon);
    const priceAfterWon = _latestPrice(v);
    if (normBefore === priceAfterWon) return; // guard: no real change

    const beforeM = _toManwon(normBefore);
    const afterM = _toManwon(priceAfterWon);
    const diffM = (beforeM !== null && afterM !== null) ? afterM - beforeM : null;
    const pct = (beforeM && diffM !== null) ? _float1((diffM / beforeM) * 100) : null;

    await sendGAEvent('car_price_changed', {
      car_id: carId,
      price_before_manwon: beforeM,
      price_after_manwon: afterM,
      price_diff_manwon: diffM,
      price_diff_pct: pct,
      direction: diffM !== null ? (diffM < 0 ? 'down' : 'up') : null,
      [PARAM_SOURCE]: _str(sourceType),
      price_range_after: _toPriceRange(priceAfterWon),
      year: _int(v.year),
      days_since_first_seen: _daysSince(v.firstSeenAt)
    });
  }

  async function trackStatusChanged(vehicle, statusBefore) {
    const v = _stripForbidden(vehicle);
    const carId = _carId(v);
    if (!carId) return;
    if (statusBefore === v.status) return;

    const price = _latestPrice(v);
    await sendGAEvent('car_status_changed', {
      car_id: carId,
      status_before: _str(statusBefore),
      status_after: _str(v.status),
      missing_count: _int(v.missingCount),
      days_since_first_seen: _daysSince(v.firstSeenAt),
      last_price_manwon: _toManwon(price),
      price_range: _toPriceRange(price)
    });
  }

  async function trackSeenFromList(vehicle, context) {
    const v = _stripForbidden(vehicle);
    const carId = _carId(v);
    if (_debugEnabled || ALWAYS_LOG_EVENTS.has('car_seen_from_list')) {
      console.log('[GA EVENT] trackSeenFromList entered', {
        carId,
        price: _latestPrice(v) || _normalize(v && v.price),
        status: _str(v && v.status)
      });
    }
    if (!carId) return;

    const rawPrice = _normalize(v.price);
    const price = _latestPrice(v) || rawPrice;
    if (!_isValidPrice(price)) {
      if (_debugEnabled || ALWAYS_LOG_EVENTS.has('car_seen_from_list')) {
        console.log('[GA SKIP] list invalid price', {
          carId,
          price: _normalize(price)
        });
      }
      return;
    }
    if (_seenListCarIds.has(carId)) {
      if (_debugEnabled || ALWAYS_LOG_EVENTS.has('car_seen_from_list')) {
        console.log('[GA SKIP] list dedupe', {
          carId,
          eventName: 'car_seen_from_list'
        });
      }
      return;
    }
    _seenListCarIds.add(carId);
    const meta = context && typeof context === 'object' ? context : {};
    await sendGAEvent('car_seen_from_list', {
      car_id: carId,
      price: _normalize(price),
      status: _str(v.status),
      event_source: _str(meta.eventSource || 'list_page'),
      source_type: _str(meta.sourceType || 'LIST'),
      page_type: _str(meta.pageType || 'LIST'),
      year: _int(v.year)
    });
  }

  async function trackSeenFromDetail(vehicle, isFirstDetailVisit) {
    const v = _stripForbidden(vehicle);
    const carId = _carId(v);
    if (!carId) return;

    if (_seenDetailCarIds.has(carId)) {
      if (_debugEnabled || ALWAYS_LOG_EVENTS.has('car_seen_from_detail')) {
        console.log('[GA SKIP] detail dedupe', {
          carId,
          eventName: 'car_seen_from_detail'
        });
      }
      return;
    }
    _seenDetailCarIds.add(carId);

    const price = _latestPrice(v);
    await sendGAEvent('car_seen_from_detail', {
      car_id: carId,
      source_type: 'DETAIL',
      price: _normalize(price),
      status: _str(v.status),
      event_source: 'detail_page',
      year: _int(v.year),
      mileage_bucket: _toMileageBucket(v.mileage),
      is_first_detail_visit: Boolean(isFirstDetailVisit),
      days_since_first_seen: _daysSince(v.firstSeenAt)
    });
  }

  // ─────────────────────────────────────────────
  // Internal: send
  // ─────────────────────────────────────────────

  async function _send(eventName, params) {
    if (!isReady()) return;
    if (!NAME_RE.test(eventName)) {
      console.warn('[GA] invalid event name', eventName);
      return;
    }
    try {
      const clientId = await _ensureClientId();
      const url = `${GA_ENDPOINT}?measurement_id=${_measurementId}&api_secret=${_apiSecret}`;
      const cleanParams = _cleanParams(params);
      if (_debugEnabled) {
        cleanParams.debug_mode = true;
      }
      const body = {
        client_id: clientId,
        non_personalized_ads: true,
        events: [{ name: eventName, params: cleanParams }]
      };
      if (_debugEnabled || ALWAYS_LOG_EVENTS.has(eventName)) {
        console.log('[GA SEND]', {
          eventName,
          params: cleanParams
        });
      }
      const dispatched = await _sendViaBackground({
        type: GA_MESSAGE_TYPE,
        eventName,
        url,
        body
      });
      if (!dispatched && _debugEnabled) {
        console.warn('[GA] background dispatch unavailable', eventName);
      }
    } catch (e) {
      if (_debugEnabled) console.warn('[GA ERROR]', e);
    }
  }

  function _sendViaBackground(message) {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        resolve(false);
        return;
      }

      try {
        chrome.runtime.sendMessage(message, response => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) {
            if (_debugEnabled) console.warn('[GA ERROR]', runtimeError);
            resolve(false);
            return;
          }

          if ((_debugEnabled || ALWAYS_LOG_EVENTS.has(message.eventName)) && response && typeof response.status === 'number') {
            console.log('[GA RESPONSE]', response.status);
          }

          if (!response || response.ok !== true) {
            if (response && response.error) {
              if (_debugEnabled) console.warn('[GA ERROR]', new Error(response.error));
            }
            resolve(false);
            return;
          }

          resolve(true);
        });
      } catch (e) {
        if (_debugEnabled) console.warn('[GA ERROR]', e);
        resolve(false);
      }
    });
  }

  // ─────────────────────────────────────────────
  // Internal: client ID
  // ─────────────────────────────────────────────

  function _ensureClientId() {
    if (_clientId) return Promise.resolve(_clientId);
    return _chromeGet(CLIENT_ID_KEY).then(existing => {
      if (existing) { _clientId = existing; return existing; }
      const id = _uuid();
      _clientId = id;
      return _chromeSet({ [CLIENT_ID_KEY]: id }).then(() => id);
    }).catch(() => {
      _clientId = _uuid();
      return _clientId;
    });
  }

  function _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `ga_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function _chromeGet(key) {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(null); return;
      }
      chrome.storage.local.get(key, result => {
        resolve(result && result[key] != null ? result[key] : null);
      });
    });
  }

  function _chromeSet(items) {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(); return;
      }
      chrome.storage.local.set(items, () => resolve());
    });
  }

  // ─────────────────────────────────────────────
  // Internal: sanitize & converters
  // ─────────────────────────────────────────────

  function _stripForbidden(vehicle) {
    if (!vehicle) return vehicle;
    const clean = { ...vehicle };
    FORBIDDEN.forEach(k => { delete clean[k]; });
    return clean;
  }

  function _carId(v) {
    // Only carId — fallbackKey contains URL (forbidden)
    const id = v && v.carId;
    return id ? String(id).slice(0, MAX_STR_LEN) : null;
  }

  function _normalize(price) {
    if (typeof PricePolicy !== 'undefined') return PricePolicy.normalizeStoredPrice(price);
    return typeof price === 'number' ? price : null;
  }

  function _isValidPrice(price) {
    if (typeof PricePolicy !== 'undefined') return PricePolicy.isValidVehiclePrice(price);
    return typeof price === 'number' && Number.isFinite(price) && price > 0;
  }

  function _latestPrice(v) {
    if (!v) return null;
    if (typeof PricePolicy !== 'undefined' && Array.isArray(v.history) && v.history.length > 0) {
      return PricePolicy.getLatestPrice(v.history);
    }
    return _normalize(v.price);
  }

  function _toManwon(priceWon) {
    const norm = _normalize(priceWon);
    if (!_isValidPrice(norm)) return null;
    return Math.round(norm / 10000);
  }

  function _toPriceRange(priceWon) {
    const m = _toManwon(priceWon);
    if (m === null) return 'unknown';
    if (m < 500) return 'under_500';
    if (m <= 1000) return '500_to_1000';
    if (m <= 2000) return '1000_to_2000';
    if (m <= 3000) return '2000_to_3000';
    return 'over_3000';
  }

  function _toMileageBucket(rawMileage) {
    if (!rawMileage) return 'unknown';
    const km = parseInt(String(rawMileage).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(km)) return 'unknown';
    if (km < 30000) return 'under_3';
    if (km <= 50000) return '3_to_5';
    if (km <= 100000) return '5_to_10';
    return 'over_10';
  }

  function _daysSince(timestampMs) {
    if (!timestampMs) return null;
    const diff = Math.floor((Date.now() - timestampMs) / DAY_MS);
    return diff >= 0 ? diff : null;
  }

  function _str(v) {
    if (v == null) return null;
    return String(v).slice(0, MAX_STR_LEN);
  }

  function _int(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : null;
  }

  function _float1(v) {
    const n = Math.round(Number(v) * 10) / 10;
    return Number.isFinite(n) ? n : null;
  }

  function _cleanParams(params) {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
      if (!NAME_RE.test(k)) { console.warn('[GA] invalid param name', k); continue; }
      if (v === null || v === undefined) continue;
      if (typeof v === 'string') {
        const s = v.slice(0, MAX_STR_LEN);
        if (s) out[k] = s;
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      } else if (typeof v === 'boolean') {
        out[k] = v;
      }
    }
    return out;
  }

  return {
    init,
    isReady,
    getReadyStatus,
    resetPageSession,
    sendGAEvent,
    trackPriceObserved,
    trackPriceChanged,
    trackStatusChanged,
    trackSeenFromList,
    trackSeenFromDetail
  };
})();

if (typeof window !== 'undefined') {
  window.GaRepository = GaRepository;
  try {
    window.__ENCAR_GA_CONTENT_SCRIPT_LOADED__ = true;
  } catch (_) {
    // isolated world debug marker is best-effort only
  }
}

globalThis.GaRepository = GaRepository;
globalThis.GARepository = GaRepository;

if (typeof globalThis !== 'undefined' && globalThis.GAConfig && globalThis.GAConfig.isDebugEnabled && globalThis.GAConfig.isDebugEnabled()) {
  console.log('[GA4] gaRepository loaded');
  try {
    window.postMessage({
      source: 'encar-price-tracker',
      type: 'GA_REPOSITORY_LOADED'
    }, '*');
  } catch (_) {
    // page bridge is best-effort only
  }
}

try {
  if (typeof globalThis !== 'undefined' && globalThis.GAConfig && globalThis.GAConfig.isConfigured && globalThis.GAConfig.isConfigured()) {
    GaRepository.init(globalThis.GAConfig);
  } else if (typeof globalThis !== 'undefined' && globalThis.GAConfig && typeof globalThis.GAConfig.getConfigStatus === 'function') {
    const status = globalThis.GAConfig.getConfigStatus();
    console.warn('[GA] config not ready:', status.reason);
  }
} catch (error) {
  console.warn('[GA] repository init failed', error);
}
