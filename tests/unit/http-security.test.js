const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../../backend/src/app');

test('HTTP origin rejection blocks the request before guest writes', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const healthy = await fetch(`${url}/api/health`);
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), { ok: true });
    const denied = await fetch(`${url}/api/guest/bootstrap`, {
      method: 'POST', headers: { Origin: 'https://untrusted.invalid' }
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { message: 'Origin not allowed' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
