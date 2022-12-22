import { Cron } from "../deps/croner/croner.js";
import { log } from "../deps/easyts/log/mod.ts";
import {
  cloneDB,
  createSlave,
  ncat,
  startSlave,
  waitMysqld,
  watchSlave,
  writeServerID,
} from "../utils/utils.ts";
import { Backup } from "./backup.ts";
import { Chan, Completer, ReadChannel } from "../deps/easyts/mod.ts";
import { Mutex } from "../deps/easyts/sync/mod.ts";
interface Options {
  root: string;
  rootPassword: string;
  slave: string;
  slavePassword: string;

  serverID: bigint;
  /**
   * master 地址，表示自己爲 slave，如果 爲空字符串則表示自己是 master
   */
  master: string;
  /**
   * 設置 從 master 的 ncat 端口 clone 數據
   */
  masterNcat: number;

  /**
   * ncat 端口
   */
  ncat: number;

  /**
   * 自動備份週期
   */
  backupCron: string;
  /**
   * 如果爲 true 在服務就緒後立刻執行一次備份
   */
  backupNow: boolean;
  /**
   * 保留多少個完整備份 <1 不限制
   */
  backupFull: number;
  /**
   * 保留多少個增量備份 <1 不限制
   */
  backupInc: number;
  /**
   * 備份存儲檔案夾
   */
  backupDir: string;
}
export class Service {
  private locker_ = new Mutex();
  private opts: Options;
  constructor() {
    const env = Deno.env;
    const rootPassword = env.get("MYSQL_ROOT_PASSWORD") ?? "";
    if (rootPassword == "") {
      throw new Error(
        `unknow root password, please set environment variable 'MYSQL_ROOT_PASSWORD' `,
      );
    }
    const slave = env.get("MYSQL_SLAVE_NAME") ?? "";
    const slavePassword = env.get("MYSQL_SLAVE_PASSWORD") ?? "";

    const master = env.get("MASTER_ADDR")?.toLowerCase() ?? "";
    let str = env.get("MASTER_NCAT") ?? "3307";
    let masterNcat = 0;
    if (str != "") {
      masterNcat = parseInt(str);
      if (
        !Number.isSafeInteger(masterNcat) || masterNcat < 1 ||
        masterNcat > 65535
      ) {
        throw new Error(`not supported master ncat port: ${str}`);
      }
    }

    str = env.get("NCAT_PORT") ?? "";
    let ncat = 0;
    if (str != "") {
      ncat = parseInt(str);
      if (!Number.isSafeInteger(ncat) || ncat < 0 || ncat > 65535) {
        throw new Error(`not supported ncat port: ${str}`);
      }
    }

    const backupCron = env.get("BACKUP_CRON") ?? "";
    if (backupCron != "") {
      new Cron(backupCron, {
        maxRuns: 0,
      });
    }
    str = env.get("BACKUP_FULL") ?? "";
    let backupFull = 0;
    if (str != "") {
      backupFull = parseInt(str);
      if (!Number.isSafeInteger(backupFull)) {
        throw new Error(`not supported BACKUP_FULL: ${str}`);
      }
    }
    str = env.get("BACKUP_INC") ?? "";
    let backupInc = 0;
    if (str != "") {
      backupInc = parseInt(str);
      if (!Number.isSafeInteger(backupInc)) {
        throw new Error(`not supported backupInc: ${str}`);
      }
    }
    const backupDir = env.get("BACKUP_DIR") ?? "/backup";
    this.opts = {
      root: "root",
      rootPassword: rootPassword,
      slave: slave,
      slavePassword: slavePassword,
      serverID: BigInt(env.get("SERVER_ID") ?? "0"),
      master: master,
      masterNcat: masterNcat,
      backupCron: backupCron,
      backupNow: env.get("BACKUP_NOW") === "1",
      backupFull: backupFull,
      backupInc: backupInc,
      backupDir: backupDir,
      ncat: ncat,
    };
  }
  async serve() {
    await this._prepare();
    // 運行 mysqld 服務
    this._mysqld();

    // 執行一些設置
    await this._setting();
    const opts = this.opts;
    if (opts.backupNow) {
      const backup = await this.backup();
      await backup.create();
    }
    if (opts.backupCron) {
      log.info("backup cron", opts.backupCron);
      const ch = new Chan<number>(1);
      new Cron(opts.backupCron, () => ch.tryWrite(1));
      this._backup(ch);
    }
    if (opts.ncat > 0) {
      ncat(opts.ncat, opts.root, opts.rootPassword);
    }

    if (opts.master != "") { // 監控 slave 錯誤
      // 監聽同步錯誤
      await watchSlave(opts.root, opts.rootPassword, 60);

      await this.locker_.lock();
      // 關閉進程
      const p = this.process_!;
      this.process_ = undefined;
      p.kill();
      await this.done_.wait();
      try {
        const backup = await this.backup();
        await backup.complete();
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
          throw e;
        }
      }

      // 記錄錯誤
      const f = await Deno.open("/var/lib/mysql/slave_error", {
        mode: 0o664,
        create: true,
        write: true,
      });
      f.close();

      Deno.exit(1);
    }
  }

  private async _backup(ch: ReadChannel<number>) {
    const locker = this.locker_;
    for await (const _ of ch) {
      try {
        await locker.lock();
        const backup = await this.backup();
        await backup.create();
      } catch (e) {
        log.error("backup error:", e);
      } finally {
        locker.unlock();
      }
    }
  }
  private backup_?: Completer<Backup>;
  async backup(): Promise<Backup> {
    let c = this.backup_;
    if (c) {
      return c.promise;
    }
    c = new Completer<Backup>();
    this.backup_ = c;
    try {
      const opts = this.opts;
      const v = new Backup({
        dir: opts.backupDir,
        full: opts.backupFull,
        inc: opts.backupInc,
        user: opts.root,
        password: opts.rootPassword,
      });
      await v.init();
      c.resolve(v);
    } catch (e) {
      this.backup_ = undefined;
      c.reject(e);
    }
    return c.promise;
  }
  private process_?: Deno.Process;
  private done_ = new Chan<void>();
  async _mysqld() {
    log.info("run mariadbd");
    const p = Deno.run({
      cmd: ["docker-entrypoint.sh", "mariadbd"],
    });
    this.process_ = p;
    try {
      await p.status();
    } catch (e) {
      if (this.process_ != p) {
        return;
      }
      throw e;
    } finally {
      p.close();
      this.done_.close();
    }
  }
  private async _prepare() {
    const opts = this.opts;
    if (opts.serverID > 0n) { // 爲主從寫如 server id
      await writeServerID(opts.serverID);
    }
    if (opts.master != "") { // 從庫從主庫拷貝
      await cloneDB(opts.master, opts.masterNcat);
    }
  }
  private async _setting() {
    const opts = this.opts;
    await waitMysqld(opts.root, opts.rootPassword);

    if (opts.master == "") { // master
      // 創建 slave 用戶
      if (opts.slave != "" && opts.slavePassword != "") {
        await createSlave(
          opts.root,
          opts.rootPassword,
          opts.slave,
          opts.slavePassword,
        );
      }
    } else { // slave
      await startSlave(opts.master, opts.root, opts.rootPassword);
    }
  }
}
