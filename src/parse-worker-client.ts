import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type * as XLSX from 'xlsx';

interface ParseResult {
  workbook: XLSX.WorkBook;
  durationMs: number;
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'parsed'; workbook: XLSX.WorkBook; durationMs: number }
  | { type: 'error'; message: string };

export class WorkbookParserWorker implements vscode.Disposable {
  private worker?: Worker;
  private ready = false;
  private pending?: { resolve: (result: ParseResult) => void; reject: (error: Error) => void };
  private disposed = false;

  constructor(extensionUri: vscode.Uri, private readonly output: vscode.OutputChannel) {
    const startedAt = performance.now();
    try {
      const worker = new Worker(vscodeUriPath(extensionUri));
      worker.unref();
      this.worker = worker;
      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'ready') {
          this.ready = true;
          output.appendLine(`Parser worker ready: ${(performance.now() - startedAt).toFixed(1)} ms`);
          return;
        }
        const pending = this.pending;
        this.pending = undefined;
        if (!pending) { return; }
        if (message.type === 'parsed') {
          pending.resolve({ workbook: message.workbook, durationMs: message.durationMs });
        } else {
          pending.reject(new Error(message.message));
        }
      });
      worker.on('error', (error) => this.fail(error));
      worker.on('exit', (code) => {
        if (!this.disposed && this.worker === worker) {
          this.fail(new Error(`Parser worker exited with code ${code}`));
        }
      });
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  tryParse(bytes: Uint8Array): Promise<ParseResult> | undefined {
    const worker = this.worker;
    if (!worker || !this.ready || this.pending) { return undefined; }
    return new Promise<ParseResult>((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        worker.postMessage(bytes);
      } catch (error) {
        this.pending = undefined;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    this.pending?.reject(new Error('Parser worker disposed'));
    this.pending = undefined;
    if (this.worker) {
      void this.worker.terminate();
      this.worker = undefined;
    }
  }

  private fail(error: Error): void {
    this.ready = false;
    this.pending?.reject(error);
    this.pending = undefined;
    if (this.worker) {
      void this.worker.terminate();
      this.worker = undefined;
    }
    this.output.appendLine(`Parser worker unavailable: ${error.message}`);
  }
}

function vscodeUriPath(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, 'dist', 'parse-worker.js');
}
