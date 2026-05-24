// GA4 Measurement Protocol config
const GAConfig = (() => {
  const PLACEHOLDER_MEASUREMENT_ID = 'G-XXXXXXXXXX';
  const PLACEHOLDER_API_SECRET = 'YOUR_GA4_API_SECRET';
  const DEFAULT_MEASUREMENT_ID = 'G-7HGPY6PP12';

  function isDebugEnabled() {
    try {
      const search = typeof location !== 'undefined' ? String(location.search || '') : '';
      if (search.includes('gaDebug=1')) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('gaDebug') === 'true') return true;
    } catch (_) {
      // debug flag lookup should never break config loading
    }
    return false;
  }

  const config = {
    // Replace these placeholders with the real GA4 Measurement Protocol credentials.
    measurementId: DEFAULT_MEASUREMENT_ID,
    apiSecret: 'EoEQSsRVR6uNkgrtSfS_2A',
    endpoint: 'https://www.google-analytics.com/mp/collect',
    clientIdStorageKey: 'ga_client_id',
    debugEnabled: isDebugEnabled(),
    enabled: true
  };

  function getConfigStatus() {
    if (config.enabled === false) {
      return {
        ready: false,
        reason: 'config disabled',
        measurementIdStatus: 'skipped',
        apiSecretStatus: 'skipped'
      };
    }

    const measurementId = typeof config.measurementId === 'string' ? config.measurementId.trim() : '';
    const apiSecret = typeof config.apiSecret === 'string' ? config.apiSecret.trim() : '';

    if (!measurementId) {
      return {
        ready: false,
        reason: 'measurementId missing',
        measurementIdStatus: 'missing',
        apiSecretStatus: apiSecret ? 'present' : 'missing'
      };
    }

    if (measurementId === PLACEHOLDER_MEASUREMENT_ID) {
      return {
        ready: false,
        reason: 'measurementId placeholder',
        measurementIdStatus: 'placeholder',
        apiSecretStatus: apiSecret && apiSecret !== PLACEHOLDER_API_SECRET ? 'present' : 'placeholder'
      };
    }

    if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
      return {
        ready: false,
        reason: 'measurementId invalid',
        measurementIdStatus: 'invalid',
        apiSecretStatus: apiSecret ? 'present' : 'missing'
      };
    }

    if (!apiSecret) {
      return {
        ready: false,
        reason: 'apiSecret missing',
        measurementIdStatus: 'present',
        apiSecretStatus: 'missing'
      };
    }

    if (apiSecret === PLACEHOLDER_API_SECRET) {
      return {
        ready: false,
        reason: 'apiSecret placeholder',
        measurementIdStatus: 'present',
        apiSecretStatus: 'placeholder'
      };
    }

    return {
      ready: true,
      reason: 'ready',
      measurementIdStatus: 'present',
      apiSecretStatus: 'present'
    };
  }

  function isConfigured() {
    return getConfigStatus().ready;
  }

  return {
    ...config,
    isConfigured,
    isDebugEnabled,
    getConfigStatus
  };
})();

if (typeof window !== 'undefined') {
  window.GAConfig = GAConfig;
  window.GA4_CONFIG = GAConfig;
}

if (typeof globalThis !== 'undefined') {
  globalThis.GAConfig = GAConfig;
  globalThis.GA4_CONFIG = GAConfig;
}
