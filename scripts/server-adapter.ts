import { createServerAdapter } from '@whatwg-node/server';
import { fetch } from './fetch.js';

const serverAdapter = createServerAdapter(fetch);

export default serverAdapter;
