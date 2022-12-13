import { log } from "../deps/easyts/log/mod.ts";
export interface ServiceOptions {
  test: boolean;
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
   * not run ncat listen
   */
  noncat?: boolean;
}
export interface Env {
  rootPassword: string;
  slaveName: string;
  slavePassword: string;
}
export class Service {
  protected env_: Env;
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
  async ncat(port: number) {
    if (this.opts.noncat) {
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
}
