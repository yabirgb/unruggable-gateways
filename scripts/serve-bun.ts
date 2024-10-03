import { USER_CONFIG } from './environment.js';
import serverAdapter from './server-adapter.js';

Bun.serve({
  fetch: (request) => {
    return serverAdapter.fetch(request);
  },
  port: USER_CONFIG.PORT,
});
