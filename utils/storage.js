// Repository Layer: chrome.storage.local CRUD
// 향후 Supabase 교체 지점 - 인터페이스만 유지하면 됨
var StorageRepo = (() => {
  function storageKey(carId) {
    return ENCAR.STORAGE_KEY_PREFIX + carId;
  }

  function readLocal(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(key === null ? result : result[key]);
      });
    });
  }

  function writeLocal(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve();
      });
    });
  }

  function getGARepository() {
    const repo = typeof globalThis !== 'undefined' ? globalThis.GaRepository : null;
    if (isGADebugEnabled()) {
      console.debug('[GA TRACE] getGARepository check', {
        hasGlobal: Boolean(repo),
        hasIsReady: Boolean(repo && typeof repo.isReady === 'function'),
        isReady: Boolean(repo && typeof repo.isReady === 'function' && repo.isReady())
      });
    }
    if (!repo) {
      debugGALog('[GA SKIP]', { reason: 'globalThis.GaRepository missing' });
      return null;
    }
    if (typeof repo.isReady !== 'function') {
      debugGALog('[GA SKIP]', { reason: 'repo.isReady missing' });
      return null;
    }
    if (!repo.isReady()) {
      debugGALog('[GA SKIP]', { reason: 'repo.isReady false' });
      return null;
    }
    return repo;
  }

  function isGADebugEnabled() {
    const config = typeof globalThis !== 'undefined' ? globalThis.GAConfig : null;
    return Boolean(config && typeof config.isDebugEnabled === 'function' && config.isDebugEnabled());
  }

  function debugGALog(label, payload) {
    if (!isGADebugEnabled()) return;
    console.log(label, payload);
  }

  function fireAndForgetGA(invoke) {
    debugGALog('[GA TRACE] fireAndForgetGA start', {
      hasInvoke: typeof invoke === 'function'
    });
    try {
      debugGALog('[GA TRACE] fireAndForgetGA invoking', {});
      const result = invoke();
      if (result && typeof result.catch === 'function') {
        debugGALog('[GA TRACE] fireAndForgetGA promise', {
          hasCatch: true
        });
        result.catch(error => {
          debugGALog('[GA TRACE] fireAndForgetGA catch', {
            hasError: Boolean(error)
          });
          console.warn('[GA] event call failed', error);
        });
      } else {
        debugGALog('[GA TRACE] fireAndForgetGA promise', {
          hasCatch: false
        });
      }
    } catch (error) {
      console.warn('[GA] event call failed', error);
    }
  }

  async function sanitizeAndPersistVehicle(id, vehicle) {
    const { vehicle: sanitizedVehicle, changed, removedCount } = PricePolicy.sanitizeVehicleHistory(vehicle);
    if (changed) {
      console.warn('[MIGRATION] invalid price history removed:', {
        carId: sanitizedVehicle && sanitizedVehicle.carId ? sanitizedVehicle.carId : id,
        before: Array.isArray(vehicle && vehicle.history) ? vehicle.history.length : 0,
        after: Array.isArray(sanitizedVehicle && sanitizedVehicle.history) ? sanitizedVehicle.history.length : 0,
        removed: removedCount
      });
      await _save(id, sanitizedVehicle);
    }
    return sanitizedVehicle;
  }

  /**
   * 차량 1건 조회
   */
  async function getVehicle(carId) {
    const vehicle = await new Promise((resolve, reject) => {
      const key = storageKey(carId);
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(result[key] || null);
      });
    });
    return sanitizeAndPersistVehicle(carId, vehicle);
  }

  /**
   * 전체 차량 목록 조회
   */
  async function getAllVehicles() {
    const vehicles = await new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (items) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        const vehicles = Object.entries(items)
          .filter(([k]) => k.startsWith(ENCAR.STORAGE_KEY_PREFIX))
          .map(([k, v]) => ({
            id: k.replace(ENCAR.STORAGE_KEY_PREFIX, ''),
            vehicle: v
          }));
        resolve(vehicles);
      });
    });

    return Promise.all(vehicles.map(({ id, vehicle }) => sanitizeAndPersistVehicle(id, vehicle)));
  }

  /**
   * 차량 upsert: 신규 생성 또는 기존 병합 후 저장
   * @param {Object} incoming - extractor가 반환한 vehicle data
   * @returns {Promise<Object>} 저장된 vehicle
   */
  async function upsertVehicle(incoming) {
    const lookupId = incoming.carId || incoming.fallbackKey;
    if (!lookupId) throw new Error('carId 또는 fallbackKey 필요');

    const existing = await getVehicle(lookupId);
    const previousStatus = existing && existing.status ? existing.status : null;
    const previousLatestPrice = existing ? PricePolicy.getLatestPrice(existing.history) : null;
    const hadPreviousValidPrice = PricePolicy.isValidVehiclePrice(previousLatestPrice);

    let vehicle;
    if (!existing) {
      vehicle = MergePolicy.createVehicle(incoming);
    } else {
      vehicle = MergePolicy.mergeVehicle(existing, incoming);
    }

    vehicle = (await sanitizeAndPersistVehicle(lookupId, vehicle)) || vehicle;
    let didPriceChange = false;

    // history append 판단
    if (incoming.price !== null && incoming.price !== undefined) {
      const normalizedIncomingPrice = PricePolicy.normalizeStoredPrice(incoming.price);
      if (!PricePolicy.isValidVehiclePrice(normalizedIncomingPrice)) {
        console.warn('[PRICE] invalid skipped:', incoming.price, incoming.rawPriceText || null);
      } else {
        const today = PricePolicy.todayStr();
        if (PricePolicy.shouldAppendHistory(vehicle.history, normalizedIncomingPrice, today)) {
          didPriceChange = hadPreviousValidPrice && previousLatestPrice !== normalizedIncomingPrice;
          const record = PricePolicy.makeHistoryRecord(normalizedIncomingPrice, incoming.sourceType);
          vehicle = { ...vehicle, history: [...vehicle.history, record] };
        }
      }
    }

    const latestPrice = PricePolicy.getLatestPrice(vehicle.history);
    vehicle = {
      ...vehicle,
      price: PricePolicy.isValidVehiclePrice(latestPrice) ? latestPrice : null
    };

    // status ACTIVE로 갱신
    vehicle = StatusPolicy.markActive(vehicle);

    await _save(lookupId, vehicle);
    const saved = vehicle;
    debugGALog('[GA TRACE] after save', {
      carId: saved && saved.carId ? saved.carId : null,
      sourceType: incoming.sourceType,
      price: saved && typeof saved.price === 'number' ? saved.price : null,
      hasRepo: !!getGARepository()
    });

    const gaRepo = getGARepository();
    if (!gaRepo) {
      debugGALog('[GA SKIP]', {
        reason: 'repository unavailable',
        carId: lookupId,
        sourceType: incoming.sourceType
      });
    }
    const currentLatestPrice = PricePolicy.getLatestPrice(vehicle.history);
    if (gaRepo && PricePolicy.isValidVehiclePrice(currentLatestPrice)) {
      debugGALog('[GA CALL] trackPriceObserved', {
        carId: lookupId,
        sourceType: incoming.sourceType,
        price: currentLatestPrice
      });
      fireAndForgetGA(() => gaRepo.trackPriceObserved(vehicle, incoming.sourceType));
    }

    if (gaRepo && didPriceChange) {
      debugGALog('[GA CALL] trackPriceChanged', {
        carId: lookupId,
        sourceType: incoming.sourceType,
        previousPrice: previousLatestPrice,
        currentPrice: currentLatestPrice
      });
      fireAndForgetGA(() => gaRepo.trackPriceChanged(vehicle, previousLatestPrice, incoming.sourceType));
    }

    if (gaRepo && previousStatus && previousStatus !== vehicle.status) {
      debugGALog('[GA CALL] trackStatusChanged', {
        carId: lookupId,
        sourceType: incoming.sourceType,
        previousStatus,
        currentStatus: vehicle.status
      });
      fireAndForgetGA(() => gaRepo.trackStatusChanged(vehicle, previousStatus));
    }

    return vehicle;
  }

  /**
   * 추출 실패 시 MISSING 처리
   */
  async function markVehicleMissing(carId) {
    const existing = await getVehicle(carId);
    if (!existing) return null;
    const previousStatus = existing.status || null;
    const updated = StatusPolicy.markMissing(existing);
    await _save(carId, updated);
    const gaRepo = getGARepository();
    if (!gaRepo) {
      debugGALog('[GA SKIP]', {
        reason: 'repository unavailable',
        carId,
        sourceType: 'MISSING_SWEEP'
      });
    }
    if (gaRepo && previousStatus && previousStatus !== updated.status) {
      debugGALog('[GA CALL] trackStatusChanged', {
        carId,
        sourceType: 'MISSING_SWEEP',
        previousStatus,
        currentStatus: updated.status
      });
      fireAndForgetGA(() => gaRepo.trackStatusChanged(updated, previousStatus));
    }
    return updated;
  }

  /**
   * 최근 방문순 차량 목록 (lastSeenAt 내림차순)
   * @param {number} limit
   */
  async function getRecentVehicles(limit) {
    const all = await getAllVehicles();
    const now = Date.now();
    return all
      .map(v => ({ ...v, status: StatusPolicy.evaluateStatus(v, now) }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, limit || 20);
  }

  function _save(id, vehicle) {
    return writeLocal({ [storageKey(id)]: vehicle });
  }

  return {
    getVehicle,
    getAllVehicles,
    upsertVehicle,
    markVehicleMissing,
    getRecentVehicles,
    sanitizeAndPersistVehicle
  };
})();

if (typeof window !== 'undefined') {
  window.StorageRepo = StorageRepo;
}

if (typeof globalThis !== 'undefined') {
  globalThis.StorageRepo = StorageRepo;
}
