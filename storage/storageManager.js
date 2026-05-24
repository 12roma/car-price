// chrome.storage.local wrapper for harness vehicle records.
const StorageManager = (() => {
  const PREFIX = 'vehicle_';

  function keyFor(carId) {
    return `${PREFIX}${carId}`;
  }

  function getTodayKey(checkedAt) {
    return PriceParser.getTodayKey(checkedAt);
  }

  function getChromeStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getVehicle(carId) {
    const storage = getChromeStorage();
    if (!storage) return Promise.resolve(null);

    const key = keyFor(carId);
    return new Promise((resolve, reject) => {
      storage.get(key, result => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[key] || null);
      });
    });
  }

  function saveVehicle(vehicle) {
    const storage = getChromeStorage();
    if (!storage) return Promise.resolve(vehicle);

    const key = keyFor(vehicle.carId);
    return new Promise((resolve, reject) => {
      storage.set({ [key]: vehicle }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(vehicle);
      });
    });
  }

  function makeHistoryRecord(incoming, checkedAt) {
    return {
      price: incoming.price,
      checkedAt,
      source: incoming.source || incoming.sourceType
    };
  }

  function normalizePriceValue(price) {
    if (!Number.isFinite(price)) return price;
    return price > 0 && price < 100000 ? price * 10000 : price;
  }

  function normalizeTimestamp(value) {
    if (!value) return null;
    if (typeof value === 'number') return new Date(value).toISOString();
    return value;
  }

  function normalizeExisting(existing) {
    if (!existing) return null;
    const history = Array.isArray(existing.history)
      ? existing.history.map(item => ({
        price: normalizePriceValue(item.price),
        checkedAt: item.checkedAt || normalizeTimestamp(item.timestamp) || item.date || new Date().toISOString(),
        source: item.source || 'LIST'
      }))
      : [];

    return {
      ...existing,
      firstSeenAt: normalizeTimestamp(existing.firstSeenAt) || new Date().toISOString(),
      lastSeenAt: normalizeTimestamp(existing.lastSeenAt) || new Date().toISOString(),
      missingCount: existing.missingCount || 0,
      source: {
        fromList: Boolean(existing.source && existing.source.fromList),
        fromDetail: Boolean(existing.source && existing.source.fromDetail),
        searchKey: existing.source && existing.source.searchKey ? existing.source.searchKey : null
      },
      history
    };
  }

  function shouldAppendHistory(history, incoming, checkedAt) {
    const date = getTodayKey(checkedAt);
    const source = incoming.source || incoming.sourceType;
    return !history.some(item => (
      item.price === incoming.price &&
      getTodayKey(item.checkedAt) === date &&
      item.source === source
    ));
  }

  function mergeVehicle(existing, incoming, checkedAt) {
    const source = incoming.source || incoming.sourceType;
    const isDetail = source === 'DETAIL';
    const history = Array.isArray(existing.history) ? existing.history.slice() : [];

    if (incoming.price && shouldAppendHistory(history, incoming, checkedAt)) {
      history.push(makeHistoryRecord(incoming, checkedAt));
    }

    return {
      ...existing,
      carId: existing.carId || incoming.carId,
      title: isDetail && incoming.title ? incoming.title : (existing.title || incoming.title || ''),
      url: incoming.url || existing.url,
      mileage: isDetail && incoming.mileage ? incoming.mileage : (existing.mileage || incoming.mileage || null),
      year: isDetail && incoming.year ? incoming.year : (existing.year || incoming.year || null),
      status: 'ACTIVE',
      lastSeenAt: checkedAt,
      missingCount: 0,
      source: {
        fromList: Boolean(existing.source && existing.source.fromList) || source === 'LIST',
        fromDetail: Boolean(existing.source && existing.source.fromDetail) || source === 'DETAIL',
        searchKey: existing.source && existing.source.searchKey ? existing.source.searchKey : null
      },
      history
    };
  }

  function createVehicle(incoming, checkedAt) {
    const source = incoming.source || incoming.sourceType;
    const history = incoming.price ? [makeHistoryRecord(incoming, checkedAt)] : [];

    return {
      carId: incoming.carId,
      title: incoming.title || '',
      url: incoming.url || '',
      status: 'ACTIVE',
      firstSeenAt: checkedAt,
      lastSeenAt: checkedAt,
      missingCount: 0,
      mileage: incoming.mileage || null,
      year: incoming.year || null,
      source: {
        fromList: source === 'LIST',
        fromDetail: source === 'DETAIL',
        searchKey: null
      },
      history
    };
  }

  async function upsertVehicle(incoming, now) {
    if (!incoming || !incoming.carId) throw new Error('carId is required');
    if (!incoming.price) throw new Error('price is required');

    const checkedAt = now ? new Date(now).toISOString() : new Date().toISOString();
    const existing = normalizeExisting(await getVehicle(incoming.carId));
    const vehicle = existing
      ? mergeVehicle(existing, incoming, checkedAt)
      : createVehicle(incoming, checkedAt);

    return saveVehicle(vehicle);
  }

  async function verifyDedup(carId, incoming) {
    const before = await getVehicle(carId);
    const beforeLength = before && before.history ? before.history.length : 0;
    await upsertVehicle(incoming);
    const after = await getVehicle(carId);
    const afterLength = after && after.history ? after.history.length : 0;
    return {
      pass: beforeLength === afterLength,
      beforeLength,
      afterLength,
      vehicle: after
    };
  }

  return { getVehicle, upsertVehicle, verifyDedup, shouldAppendHistory };
})();
