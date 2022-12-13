import { log } from "../deps/easyts/log/mod.ts";
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
    const ncat = this.opts.ncat;
    if (!ncat) {
      return;
    }
    try {
      // 等待 mysql 就緒
      await this.waitMysqld();
      // 創建 slave
      await this.createSlave();

      // 執行備份
      this.backup();

      let dely = 0;
      while (true) {
        try {
          await this.waitMysqld();
          await this.ncat(ncat);
          dely = 0;
          if (this.opts.test) {
            break;
          }
        } catch (e) {
          if (dely == 0) {
            dely = 100;
          } else {
            dely *= 2;
            if (dely > 5000) {
              dely = 5000;
            }
          }
          log.error(`ncat error:`, e, `, retry on ${dely}ms`);
          await new Promise((resolve) => setTimeout(resolve, dely));
        }
      }
    } catch (e) {
      log.fail(e);
      Deno.exit(1);
    }
  }
}
