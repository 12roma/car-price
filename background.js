// Background Service Worker (MV3)
// GA4 Measurement Protocol requests are sent here to avoid page-origin CORS.

const GA_MESSAGE_TYPE = 'ENCAR_GA_SEND';

chrome.runtime.onInstalled.addListener(() => {
  // 초기 설치 시 아무것도 하지 않음
});

function isGADebugMessage(message) {
  return Boolean(message && message.body && message.body.events && message.body.events[0] && message.body.events[0].params && message.body.events[0].params.debug_mode === true);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== GA_MESSAGE_TYPE) {
    return undefined;
  }

  const { url, body, eventName } = message;
  const debugEnabled = isGADebugMessage(message);
  if (typeof url !== 'string' || !url || !body || typeof eventName !== 'string') {
    sendResponse({ ok: false, error: 'invalid ga payload' });
    return false;
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(response => {
    if (debugEnabled) {
      console.log('[GA RESPONSE]', response.status);
    }
    if (!response.ok) {
      if (debugEnabled) {
        console.warn('[GA ERROR]', new Error(`http_${response.status}`));
      }
      sendResponse({ ok: false, error: `http_${response.status}`, status: response.status });
      return;
    }

    sendResponse({ ok: true, status: response.status });
  }).catch(error => {
    if (debugEnabled) {
      console.warn('[GA ERROR]', error);
    }
    sendResponse({ ok: false, error: 'network_error' });
  });

  return true;
});
