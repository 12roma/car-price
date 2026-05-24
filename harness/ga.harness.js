suite('GARepository - detail seen dedupe', () => {
  function resetGAState() {
    chrome.storage.local._items = {};
    GaRepository.init({
      measurementId: 'G-TEST123456',
      apiSecret: 'test-secret',
      debugEnabled: false,
      getConfigStatus() {
        return { ready: true, reason: 'ready' };
      }
    });
    GaRepository.resetPageSession();
  }

  function makeVehicle(carId, price) {
    return {
      carId,
      price,
      status: 'ACTIVE',
      year: 2024,
      history: [
        { price, checkedAt: Date.now(), source: 'DETAIL' }
      ]
    };
  }

  test('DETAIL 최초 진입은 1회 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    assertEqual(messages.length, 1);
    assertEqual(messages[0].eventName, 'car_seen_from_detail');
  });

  test('같은 페이지 재호출은 추가 전송 없음', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    assertEqual(messages.length, 1);
  });

  test('다른 DETAIL 차량 이동 시 다시 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    await GaRepository.trackSeenFromDetail(makeVehicle('41731561', 61000000), true);
    assertEqual(messages.length, 2);
    assertEqual(messages[1].eventName, 'car_seen_from_detail');
  });

  test('page-session reset 후 같은 차량도 다시 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    GaRepository.resetPageSession();
    await GaRepository.trackSeenFromDetail(makeVehicle('41731560', 60000000), true);
    assertEqual(messages.length, 2);
  });
});

suite('GARepository - list seen dedupe', () => {
  function resetGAState() {
    chrome.storage.local._items = {};
    GaRepository.init({
      measurementId: 'G-TEST123456',
      apiSecret: 'test-secret',
      debugEnabled: false,
      getConfigStatus() {
        return { ready: true, reason: 'ready' };
      }
    });
    GaRepository.resetPageSession();
  }

  function makeVehicle(carId, price) {
    return {
      carId,
      price,
      status: 'ACTIVE',
      year: 2024,
      history: [
        { price, checkedAt: Date.now(), source: 'LIST' }
      ]
    };
  }

  test('LIST 최초 진입 시 정상 carId/price 차량만 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });
    await GaRepository.trackSeenFromList({ carId: null, price: 31500000 }, {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });
    await GaRepository.trackSeenFromList({ carId: '41334915', price: null }, {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });

    assertEqual(messages.length, 1);
    assertEqual(messages[0].eventName, 'car_seen_from_list');
  });

  test('LIST 같은 차량 재호출은 추가 전송 없음', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });
    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });

    assertEqual(messages.length, 1);
  });

  test('다른 LIST 차량은 다시 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });
    await GaRepository.trackSeenFromList(makeVehicle('41334915', 32500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });

    assertEqual(messages.length, 2);
    assertEqual(messages[1].eventName, 'car_seen_from_list');
  });

  test('page-session reset 후 같은 LIST 차량도 다시 전송', async () => {
    resetGAState();
    const messages = [];
    chrome.runtime.sendMessage = (message, callback) => {
      messages.push(message);
      callback({ ok: true, status: 204 });
    };

    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });
    GaRepository.resetPageSession();
    await GaRepository.trackSeenFromList(makeVehicle('41334914', 31500000), {
      sourceType: 'LIST',
      eventSource: 'list_page',
      pageType: 'LIST'
    });

    assertEqual(messages.length, 2);
  });
});
