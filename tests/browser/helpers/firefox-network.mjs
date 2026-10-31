import assert from 'node:assert/strict';

// Standard BiDi network commands share the Marionette-created session. Input
// stays in Marionette, which can control the real extension browsing context.
export async function connectFirefoxNetwork(address) {
  const endpoint = new URL(address);
  assert.equal(endpoint.protocol, 'ws:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname));
  const socket = new WebSocket(address),
    pending = new Map(),
    failures = [];
  let sequence = 0,
    routeHandler,
    responseHandler,
    intercept,
    closing = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(Error('Firefox BiDi connection timed out'));
    }, 10000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(Error('Firefox BiDi connection failed'));
      },
      { once: true },
    );
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error('Firefox BiDi command timed out: ' + method));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(Error('Firefox BiDi connection closed'));
    }
    pending.clear();
  });
  const bytes = (value) =>
    value.type === 'base64' ? Buffer.from(value.value, 'base64').toString() : value.value;
  const handle = async (message) => {
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.type === 'error') {
        const error = Error(`${message.error}: ${message.message}`);
        error.code = message.error;
        entry.reject(error);
      } else entry.resolve(message.result);
      return;
    }
    const params = message.params;
    if (message.method === 'network.beforeRequestSent' && params.isBlocked) {
      try {
        const response = await routeHandler({
          url: params.request.url,
          method: params.request.method,
          isNavigation: !!params.navigation,
        });
        if (!response) {
          await send('network.continueRequest', { request: params.request.request });
          return;
        }
        assert.equal(typeof response.body, 'string');
        const status = response.status ?? 200;
        assert.ok(Number.isSafeInteger(status) && status >= 100 && status <= 599);
        await send('network.provideResponse', {
          request: params.request.request,
          statusCode: status,
          headers: [
            {
              name: 'Content-Type',
              value: { type: 'string', value: response.contentType ?? 'application/json' },
            },
          ],
          body: { type: 'string', value: response.body },
        });
      } catch (error) {
        // A held suggestion request can be canceled when its provider changes.
        if (!closing && error.code !== 'no such request') {
          failures.push(error.message);
          await send('network.failRequest', { request: params.request.request }).catch(() => {});
        }
      }
    }
    if (message.method === 'network.responseCompleted' && responseHandler) {
      const header = params.response.headers.find(
        (header) => header.name.toLowerCase() === 'content-type',
      );
      await responseHandler({
        url: params.request.url,
        status: params.response.status,
        contentType: header ? bytes(header.value) : null,
        text: async () =>
          bytes(
            (
              await send('network.getData', {
                request: params.request.request,
                dataType: 'response',
              })
            ).bytes,
          ),
      });
    }
    if (message.method === 'network.fetchError' && responseHandler)
      await responseHandler({
        url: params.request.url,
        status: 0,
        contentType: null,
        failure: params.errorText,
      });
  };
  socket.addEventListener('message', (event) => {
    void handle(JSON.parse(event.data)).catch((error) => {
      if (!closing) failures.push(error.message);
    });
  });
  await send('session.subscribe', {
    events: ['network.beforeRequestSent', 'network.responseCompleted', 'network.fetchError'],
  });
  await send('network.addDataCollector', { dataTypes: ['response'], maxEncodedDataSize: 20000000 });
  return {
    async route(handler) {
      assert.equal(typeof handler, 'function');
      routeHandler = handler;
      if (!intercept) {
        await send('network.setCacheBehavior', { cacheBehavior: 'bypass' });
        intercept = (await send('network.addIntercept', { phases: ['beforeRequestSent'] }))
          .intercept;
      }
    },
    observe(handler) {
      assert.equal(typeof handler, 'function');
      responseHandler = handler;
    },
    errors: () => [...failures],
    close() {
      closing = true;
      socket.close();
    },
  };
}
