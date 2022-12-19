import { Cron } from "../deps/croner/croner.js";
import { log } from "../deps/easyts/log/mod.ts";
import { Chan, ReadChannel } from "../deps/easyts/mod.ts";
import { Backup, BackupOptions } from "./backup.ts";
import { Mutex } from "../deps/easyts/sync/mod.ts";
export interface ServiceOptions extends BackupOptions {
  /**
   * server-id
   */
  id: number;
  /**
   * server-id file
   */
  file: string;
  /**
   * ncat listen
   */
  ncat?: number;

  /**
   * 執行備份的時間 cron
   */
  backup?: string;

  /**
   * 如果爲 true 立刻執行一次備份
   */
  backupNow?: boolean;

  /**
   * master 地址
   */
  master?: string;
}
export interface Env {
  rootPassword: string;
  slaveName: string;
  slavePassword: string;
}
export class Service {
  protected env_: Env;
  protected mutex_ = new Mutex();
  constructor(readonly opts: ServiceOptions) {
    this.env_ = {
      rootPassword: Deno.env.get("MYSQL_ROOT_PASSWORD")!,
      slaveName: Deno.env.get("MYSQL_SLAVE_NAME")!,
      slavePassword: Deno.env.get("MYSQL_SLAVE_PASSWORD")!,
    };
  }
  serve(): Promise<void> | void {
    throw new Error(
      `class ${this.constructor.name} not implemented function: serve(): Promise<void> | void`,
    );
  }
  run<T extends Deno.RunOptions = Deno.RunOptions>(opts: T) {
    log.debug("run", opts.cmd);
    if (this.opts.test) {
      return;
    }
    return Deno.run(opts);
  }
  bash(...strs: Array<string>) {
    const bash = strs.join("");
    return this.run({
      cmd: ["bash", "-c", bash],
    });
  }
  gosu(user: string, ...strs: Array<string>) {
    const bash = strs.join("");
    return this.run({
      cmd: ["gosu", user, "bash", "-c", bash],
    });
  }
  runMysqd() {
    log.info("run mariadbd");
    return this.run({
      cmd: ["docker-entrypoint.sh", "mariadbd"],
    });
  }
  /**
   * 等待 mysql 就緒
   */
  async waitMysqld() {
    log.info("wait mysqld");
    const env = this.env_;
    const p = await this.bash(
      `until mysql -h 127.0.0.1 --user=root --password="${env.rootPassword}" -e "SELECT 1"; do sleep 1; done`,
    );
    if (p) {
      const s = await p.status();
      if (!s.success) {
        throw new Error("waitMysqld not success");
      }
    }
  }
  /**
   * 創建 slave 用戶
   */
  async createSlave() {
    const env = this.env_;
    log.info(
      `create slave: name=${env.slaveName} password=${env.slavePassword}`,
    );
    const p = await this.bash(
      `mysql -h 127.0.0.1 --user=root --password="${env.rootPassword}" -e "`,
      `CREATE USER IF NOT EXISTS '${this.env_.slaveName}'@'%' IDENTIFIED BY '${env.slavePassword}';`,
      `GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${this.env_.slaveName}'@'%';`,
      `FLUSH PRIVILEGES;`,
      `"`,
    );
    if (p) {
      const s = await p.status();
      if (!s.success) {
        throw new Error("createSlave not success");
      }
    }
  }
  /**
   * 啓動完整備份
   */
  async ncat(createSlave: boolean) {
    const opts = this.opts;
    const port = opts.ncat ?? 0;
    if (port == 0) {
      return;
    }
    try {
      if (createSlave) {
        await this.waitMysqld();
        // 創建 slave
        await this.createSlave();
      }

      let dely = 0;
      while (true) {
        try {
          await this.waitMysqld();
          await this._ncat(port);
          dely = 0;
          if (opts.test) {
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
  async _ncat(port: number) {
    if (port == 0) {
      return;
    }
    log.info("ncat listen:", port);
    const env = this.env_;
    const p = this.gosu(
      "mysql",
      `ncat --listen --keep-open --send-only --max-conns=1 ${port} -c "`,
      `mariabackup --backup --slave-info --stream=xbstream --host=127.0.0.1 --user='root' --password='${env.rootPassword}'`,
      `"`,
    );
    if (p) {
      const s = await p.status();
      if (!s.success) {
        throw new Error("ncat not success");
      }
    }
  }
  async writeServerID() {
    const opts = this.opts;
    if (opts.id < 1 || opts.file == "") {
      return;
    }
    let file = opts.file;
    if (!file.endsWith(".cnf")) {
      file += ".cnf";
    }
    log.info(`write server-id '${opts.id}' to '${file}'`);
    if (opts.test) {
      return;
    }
    await Deno.mkdir("/etc/mysql/conf.d", { recursive: true, mode: 0o775 });
    await Deno.writeTextFile(
      `/etc/mysql/conf.d/${file}`,
      `[mysqld]
server-id=${opts.id}
`,
      {
        mode: 0o664,
      },
    );
  }
  backup() {
    const opts = this.opts;
    const cron = opts.backup ?? "";
    if (cron == "") {
      return;
    }
    log.info(`cron backup: "${cron}"`);
    const c = new Chan<number>(1);
    new Cron(cron, () => {
      c.tryWrite(1);
    });
    this._backup(c);
  }
  private async _backup(c: ReadChannel<number>) {
    const opts = this.opts;
    const backup = new Backup(opts);
    const m = this.mutex_;
    for await (const _ of c) {
      try {
        await m.lock();
        await backup.serve();
      } catch (e) {
        log.error("backup error:", e);
      } finally {
        m.unlock();
      }
    }
  }
}
