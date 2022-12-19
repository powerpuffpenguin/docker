import { log } from "../deps/easyts/log/mod.ts";
import { Backup } from "./backup.ts";
import { Service } from "./service.ts";
export class Master extends Service {
  async serve() {
    try {
      await this.writeServerID();

      const p = this.runMysqd();

      this._serve();
      const s = await p?.status();
      if (s && !s.success) {
        throw new Error("runMysqd not success");
      }
    } catch (e) {
      log.fail(e);
      Deno.exit(1);
    }
  }
  private async _serve() {
    const opts = this.opts;
    if (opts.backupNow) {
      await new Backup(opts).serve();
    }
    this.ncat(true);
    this.backup();
  }
}
