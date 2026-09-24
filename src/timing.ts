import type * as vscode from 'vscode';

export class DiffOpenTiming {
  readonly startedAt = performance.now();

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly id: number,
    name: string
  ) {
    output.appendLine(`[${id}] ${new Date().toISOString()} Open ${name}`);
  }

  mark(stage: string): void {
    this.record(stage, performance.now() - this.startedAt);
  }

  measure(stage: string, startedAt: number): void {
    this.record(stage, performance.now() - startedAt);
  }

  record(stage: string, durationMs: number): void {
    this.output.appendLine(
      `[${this.id}] ${stage}: ${durationMs.toFixed(1)} ms (since open ${(performance.now() - this.startedAt).toFixed(1)} ms)`
    );
  }
}
