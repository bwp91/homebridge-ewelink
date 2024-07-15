import { createRequire } from 'module';
import ewelinkPlatform from './platform.js';

const require = createRequire(import.meta.url);
const plugin = require('../package.json');

export default (hb) => hb.registerPlatform(plugin.alias, ewelinkPlatform);
