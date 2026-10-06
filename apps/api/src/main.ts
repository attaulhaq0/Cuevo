import { parseServerConfig } from '@cuevo/config';
import { createApp } from './app';
const config = parseServerConfig(process.env, 'api');
const { app, close } = await createApp(config);
await app.listen(config.apiPort, config.localDemoMode === 'INTEGRATION_PRESENTATION' ? '127.0.0.1' : '0.0.0.0');
console.log(`Cuevo API listening on ${config.apiPort}`);
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
