// deno-lint-ignore-file no-explicit-any
import { Logger } from "./deps/easyts/log/mod.ts";
export interface LogOptions {
  info?: Logger;
}
export class Log {
  enable = true;
  readonly opts?: LogOptions;
  constructor(opts?: LogOptions) {
    const {
      info = new Logger({
        prefix: "info",
      }),
    } = opts ?? {};
    this.opts = {
      info,
    };
  }

  info(...vals: Array<any>) {
    if (this.enable) {
      this.opts?.info?.log(...vals);
    }
  }
}
export const log = new Log();
