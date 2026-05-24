// Auto harness runner for Encar LIST/DETAIL pages. DOM-only, no fetch.
(function () {
  'use strict';

  if (window.__encarPriceTrackingHarnessInit) return;
  window.__encarPriceTrackingHarnessInit = true;

  const MIN_DEBOUNCE_MS = 500;
  const processed = new Set();
  let debounceTimer = null;
  let running = false;

  function log(scope, message, value) {
    if (value !== undefined) {
      console.log(`[HARNESS][${scope}] ${message}`, value);
    } else {
      console.log(`[HARNESS][${scope}] ${message}`);
    }
  }

  function logError(error) {
    const message = error && error.message ? error.message : String(error);
    console.log(`[HARNESS][ERROR] ${message}`);
  }

  function pageType(url) {
    const href = url || location.href;
    if (/\/dc\/dc_carsearchlist\.do/i.test(href) || /carsearchlist/i.test(href)) return 'LIST';
    if (/\/cars\/detail\/\d+/i.test(href) || /[?&]carid=\d+/i.test(href)) return 'DETAIL';
    return 'OTHER';
  }

  function scheduleRun(reason) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      run(reason).catch(logError);
    }, MIN_DEBOUNCE_MS);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function run(reason) {
    if (running) return;
    const type = pageType(location.href);
    if (type === 'OTHER') return;

    const key = `${type}:${location.href}`;
    if (processed.has(key)) return;

    running = true;
    processed.add(key); // 실행 시작 시점에 등록하여 mutation 재진입 차단
    try {
      if (type === 'LIST') {
        await runListHarness();
      } else if (type === 'DETAIL') {
        await runDetailHarness();
      }
    } finally {
      running = false;
    }
  }

  async function runListHarness() {
    const rootCandidates = ListExtractor.countRootCandidates
      ? ListExtractor.countRootCandidates(document)
      : 0;
    log('LIST', `root candidates: ${rootCandidates}`);

    let vehicles = ListExtractor.extractListVehicles(document);
    log('LIST', `extracted count: ${vehicles.length}`);
    if (vehicles.length === 0) {
      await delay(700);
      vehicles = ListExtractor.extractListVehicles(document);
      log('LIST', `retry extraction count: ${vehicles.length}`);
    }
    if (vehicles.length === 0) {
      log('LIST', `document readyState: ${document.readyState}`);
      log('LIST', `body child count: ${document.body ? document.body.children.length : 0}`);
      return false;
    }

    const first = vehicles[0];
    log('LIST', 'first item:', first);

    if (!first.carId) throw new Error('LIST first item has no carId');
    if (!Number.isInteger(first.price) || first.price <= 0) throw new Error('LIST first item price parse failed');
    if (!first.url) throw new Error('LIST first item has no detail URL');

    for (const vehicle of vehicles) {
      const saved = await StorageManager.upsertVehicle(vehicle);
      TodayPricePanel.renderOrUpdateListItem(
        { ...saved, priceElement: vehicle.priceElement, cardElement: vehicle.cardElement },
        { logger: log, priceElement: vehicle.priceElement, cardElement: vehicle.cardElement }
      );
    }

    await runStorageHarness(first);
    await runPriceHarness(first.carId);
    return true;
  }

  async function runDetailHarness() {
    const { vehicle, error } = DetailExtractor.extractDetailVehicle(document, location.href);
    if (error) throw new Error(`DETAIL extraction failed: ${error}`);
    if (!vehicle) throw new Error('DETAIL extraction returned null vehicle');

    log('DETAIL', `carId: ${vehicle.carId}`);
    log('DETAIL', `price: ${vehicle.price}`);

    if (!Number.isInteger(vehicle.price) || vehicle.price <= 0) {
      throw new Error('DETAIL price parse failed');
    }

    const saved = await StorageManager.upsertVehicle(vehicle);
    TodayPricePanel.renderOrUpdateDetail(saved, { logger: log });
    await runStorageHarness(vehicle);
    await runPriceHarness(vehicle.carId);
    return true;
  }

  async function runStorageHarness(incoming) {
    const saved = await StorageManager.getVehicle(incoming.carId);
    if (!saved) throw new Error(`storage missing vehicle_${incoming.carId}`);

    const length = Array.isArray(saved.history) ? saved.history.length : 0;
    log('STORAGE', `history length: ${length}`);
    if (length < 1) throw new Error('storage history length is less than 1');

    const dedup = await StorageManager.verifyDedup(incoming.carId, incoming);
    log('STORAGE', `dedup check: ${dedup.pass ? 'PASS' : 'FAIL'}`);
    if (!dedup.pass) throw new Error('storage dedup check failed');
  }

  async function runPriceHarness(carId) {
    const saved = await StorageManager.getVehicle(carId);
    const diff = PriceParser.getPriceDiff(saved && saved.history);
    log('PRICE', `diff: ${PriceParser.formatDiff(diff)}`);
  }

  function installSpaWatcher() {
    const notify = () => {
      log('SPA', 'navigation detected');
      scheduleRun('navigation');
    };

    const wrap = original => function (...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };

    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', notify);
  }

  function installMutationWatcher() {
    const observer = new MutationObserver(() => scheduleRun('mutation'));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  installSpaWatcher();
  installMutationWatcher();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleRun('load'));
  } else {
    scheduleRun('load');
  }
})();
