import { parentPort } from 'node:worker_threads';
import * as XLSX from 'xlsx';
import { workbookReadOptions } from './parse-options';

if (parentPort) {
  const port = parentPort;
  port.on('message', (bytes: Uint8Array) => {
    try {
      const startedAt = performance.now();
      const workbook = XLSX.read(bytes, workbookReadOptions);
      port.postMessage({ type: 'parsed', workbook, durationMs: performance.now() - startedAt });
    } catch (error) {
      port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  port.postMessage({ type: 'ready' });
}
