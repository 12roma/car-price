// Content Orchestrator: 페이지 판별 → 추출 → 저장 → UI 흐름 조율
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // 중복 실행 방지
  // ─────────────────────────────────────────────
  if (window.__encarTrackerInit) return;
  window.__encarTrackerInit = true;

  let _lastProcessedUrl = '';
  let _debounceTimer = null;
  let _observer = null;
  let _isProcessing = false;
  let _needsRerun = false;
  let _lastProcessStartedAt = 0;
  let _lastDetailProcessedUrl = '';
  let _lastDetailProcessedCarId = '';
  let _lastDetailProcessedAt = 0;
  const DETAIL_RETRY_DELAY_MS = 300;
  const DETAIL_RETRY_MAX = 30;
  const SAME_URL_PROCESS_THROTTLE_MS = 1000;
  const DETAIL_SAME_CAR_THROTTLE_MS = 2000;

  // ─────────────────────────────────────────────
  // 진입점
  // ─────────────────────────────────────────────
  function init() {
    resetGAPageSession();
    processCurrentPage();
    PageDetector.watchNavigation(onUrlChange);
    watchDomChanges();
  }

  function onUrlChange(newUrl) {
    if (newUrl === _lastProcessedUrl) return;
    resetGAPageSession();
    scheduledProcess();
  }

  function scheduledProcess() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(processCurrentPage, ENCAR.DEBOUNCE_MS);
  }

  function isGADebugEnabled() {
    const config = globalThis.GAConfig;
    return Boolean(config && typeof config.isDebugEnabled === 'function' && config.isDebugEnabled());
  }

  function logGADebug(label, payload) {
    if (!isGADebugEnabled()) return;
    console.log(label, payload);
  }

  function logGADetailSeen(label, payload) {
    if (!isGADebugEnabled()) return;
    console.log(label, payload);
  }

  function logGAListSeen(label, payload) {
    if (!isGADebugEnabled()) return;
    console.log(label, payload);
  }

  // ─────────────────────────────────────────────
  // 페이지별 처리
  // ─────────────────────────────────────────────
  async function processCurrentPage() {
    if (_isProcessing) {
      _needsRerun = true;
      return;
    }

    const url = location.href;
    const now = Date.now();

    if (url === _lastProcessedUrl && now - _lastProcessStartedAt < SAME_URL_PROCESS_THROTTLE_MS) {
      return;
    }

    _isProcessing = true;
    _lastProcessStartedAt = now;
    try {
      const pageType = PageDetector.getCurrentPageType(url);
      console.log('[LIST] page detected', { pageType, url });

      if (pageType === 'LIST') {
        await processListPage(url);
      } else if (pageType === 'DETAIL') {
        console.log('[DETAIL_UI] page detected', { url });
        await processDetailPage(url);
      }
      // OTHER: 아무것도 하지 않음
    } finally {
      _isProcessing = false;
      if (_needsRerun) {
        _needsRerun = false;
        scheduledProcess();
      }
    }
  }

  async function processListPage(url) {
    _lastProcessedUrl = url;

    const cards = Extractor.findVehicleCards(document);
    console.log('[LIST] cards found:', cards.length);
    console.log('[LIST_UI] cards found:', cards.length);

    const { vehicles, error } = Extractor.extractListVehicles(document);
    if (error === ENCAR.EXTRACT_ERRORS.NO_CARD_ROOT) {
      // DOM이 아직 렌더링 중일 수 있으므로 retry
      await retryOnce(processListPage, url);
      return;
    }

    for (const v of vehicles) {
      try {
        Overlay.ensureListPlaceholder(v);
      } catch (_) {
        // placeholder failure should not block extraction/save flow
      }
    }

    for (const v of vehicles) {
      console.log('[LIST] extracted:', v);
      const gaRepo = globalThis.GaRepository;
      const hasRepo = Boolean(gaRepo);
      const repoReady = Boolean(gaRepo && typeof gaRepo.isReady === 'function' && gaRepo.isReady());
      const hasCarId = Boolean(v && v.carId);
      const hasValidPrice = Boolean(v && PricePolicy.isValidVehiclePrice(v.price));

      if (repoReady && hasCarId && hasValidPrice) {
        logGAListSeen('[GA CALL] trackSeenFromList', {
          carId: v.carId,
          sourceType: ENCAR.SOURCE.LIST,
          price: v.price,
          status: v.status || null
        });
        try {
          const seenResult = gaRepo.trackSeenFromList(v, {
            sourceType: ENCAR.SOURCE.LIST,
            eventSource: 'list_page',
            pageType: 'LIST'
          });
          if (seenResult && typeof seenResult.catch === 'function') {
            seenResult.catch(() => {});
          }
        } catch (_) {
          // seen event must never block list rendering
        }
      } else {
        logGAListSeen('[GA SKIP] trackSeenFromList precondition', {
          hasRepo,
          repoReady,
          hasCarId,
          hasValidPrice,
          carId: v && v.carId ? v.carId : null,
          price: v && typeof v.price === 'number' ? v.price : null
        });
      }
      if (!v.price) continue; // 가격 없으면 저장 생략
      try {
        const saved = await StorageRepo.upsertVehicle(v);
        Overlay.renderOrUpdateListItem({ ...saved, cardElement: v.cardElement, priceElement: v.priceElement });
      } catch (e) {
        // 개별 저장 실패는 무시하고 계속
      }
    }
  }

  async function processDetailPage(url, attempt = 0) {
    _lastProcessedUrl = url;

    const { vehicle, error } = Extractor.extractDetailVehicle(document, url);
    if (error === ENCAR.EXTRACT_ERRORS.NO_PRICE && !vehicle) {
      console.warn('[DETAIL_UI] price target not found', { url, attempt });
      if (attempt < DETAIL_RETRY_MAX - 1) {
        await retryDetailPage(url, attempt + 1);
      }
      return;
    }
    if (!vehicle) return;
    const detailKey = String(vehicle.carId || vehicle.fallbackKey || '');
    const now = Date.now();
    if (
      attempt === 0
      && detailKey
      && url === _lastDetailProcessedUrl
      && detailKey === _lastDetailProcessedCarId
      && now - _lastDetailProcessedAt < DETAIL_SAME_CAR_THROTTLE_MS
    ) {
      return;
    }
    console.log('[DETAIL_UI] carId detected', detailKey || null);

    try {
      Overlay.ensureDetailPlaceholder(vehicle);
    } catch (_) {
      // placeholder failure should not block extraction/save flow
    }

    if (!PricePolicy.isValidVehiclePrice(vehicle.price)) {
      Overlay.renderOrUpdate({
        ...vehicle,
        history: [],
        lastSeenAt: Date.now()
      });
      return;
    }

    try {
      const saved = await StorageRepo.upsertVehicle(vehicle);
      _lastDetailProcessedUrl = url;
      _lastDetailProcessedCarId = detailKey;
      _lastDetailProcessedAt = now;
      const gaRepo = globalThis.GaRepository;
      if (
        gaRepo
        && typeof gaRepo.isReady === 'function'
        && gaRepo.isReady()
        && saved
        && saved.carId
        && PricePolicy.isValidVehiclePrice(saved.price)
      ) {
        logGADetailSeen('[GA CALL] trackSeenFromDetail', {
          carId: saved.carId,
          sourceType: ENCAR.SOURCE.DETAIL,
          price: saved.price,
          status: saved.status || null
        });
        try {
          const seenResult = gaRepo.trackSeenFromDetail(saved, true);
          if (seenResult && typeof seenResult.catch === 'function') {
            seenResult.catch(() => {});
          }
        } catch (_) {
          // seen event must never block detail rendering
        }
      }
      Overlay.renderOrUpdate({ ...saved, priceElement: vehicle.priceElement });
    } catch (e) {
      Overlay.renderOrUpdate({
        ...vehicle,
        history: vehicle.price ? [PricePolicy.makeHistoryRecord(vehicle.price, ENCAR.SOURCE.DETAIL)] : [],
        lastSeenAt: Date.now()
      });
    }
  }

  // ─────────────────────────────────────────────
  // Retry (DOM 지연 렌더링 대비)
  // ─────────────────────────────────────────────
  function retryOnce(fn, ...args) {
    return new Promise(resolve => {
      setTimeout(async () => {
        await fn(...args);
        resolve();
      }, ENCAR.RETRY_DELAY_MS);
    });
  }

  function retryDetailPage(url, attempt) {
    return new Promise(resolve => {
      setTimeout(async () => {
        if (location.href !== url) {
          resolve();
          return;
        }
        await processDetailPage(url, attempt);
        resolve();
      }, DETAIL_RETRY_DELAY_MS);
    });
  }

  // ─────────────────────────────────────────────
  // DOM 변경 감시 (SPA 재렌더 대응)
  // ─────────────────────────────────────────────
  function watchDomChanges() {
    if (_observer) _observer.disconnect();

    _observer = new MutationObserver((mutations) => {
      const url = location.href;
      const pageType = PageDetector.getCurrentPageType(url);

      if (pageType === 'LIST') {
        if (!hasMeaningfulListMutations(mutations)) return;
        scheduledProcess();
        return;
      }

      if (pageType === 'DETAIL') {
        if (!hasMeaningfulListMutations(mutations)) return;
        scheduledProcess();
        return;
      }

      if (url !== _lastProcessedUrl) {
        scheduledProcess();
      }
    });

    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function resetGAPageSession() {
    try {
      const repo = globalThis.GaRepository;
      if (!repo || typeof repo.resetPageSession !== 'function') return;
      repo.resetPageSession();
    } catch (_) {
      // GA page-session reset must never block page processing
    }
  }

  function hasMeaningfulListMutations(mutations) {
    return mutations.some(mutation => {
      if (hasNonTrackerNodes(mutation.addedNodes)) return true;
      if (hasNonTrackerNodes(mutation.removedNodes)) return true;
      return false;
    });
  }

  function hasNonTrackerNodes(nodeList) {
    return Array.from(nodeList || []).some(node => !isTrackerNode(node));
  }

  function isTrackerNode(node) {
    if (!node) return false;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return Boolean(node.parentElement && isTrackerElement(node.parentElement));
    }
    return isTrackerElement(node);
  }

  function isTrackerElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(
      el.closest('[data-encar-price-tracker="true"]') ||
      el.closest('.encar-price-tracker') ||
      el.matches('.encar-price-tracker') ||
      el.matches('.encar-price-tracker-list-ui') ||
      el.id === ENCAR.OVERLAY_ID ||
      el.closest(`#${ENCAR.OVERLAY_ID}`) ||
      el.id === 'ept-list-tooltip' ||
      el.closest('#ept-list-tooltip')
    );
  }

  // ─────────────────────────────────────────────
  // 시작
  // ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
