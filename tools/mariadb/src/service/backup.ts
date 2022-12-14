import { log } from "../deps/easyts/log/mod.ts";
import { Asset } from "../deps/easyts/mod.ts";

const Tag = `_tag_`;
const TagOK = `${Tag}ok`;
const TagCompleted = `${Tag}completed`;
function dateNow(): string {
  const d = new Date();
  return `${d.getFullYear().toString()}-${
    d.getMonth().toString().padStart(2, "0")
  }-${d.getDay().toString().padStart(2, "0")}`;
}
function joinPath(dir: string, name: string): string {
  if (dir.endsWith("/")) {
    return `${dir}${name}`;
  } else if (Deno.build.os == "windows") {
    if (dir.endsWith("/") || dir.endsWith("\\")) {
      return `${dir}${name}`;
    }
  }
  return `${dir}/${name}`;
}
async function fileExists(filepath: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(filepath);
    return stat.isFile;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return false;
    }
    throw e;
  }
}
function getID(name: string): number {
  const str = name.substring(0, name.indexOf("."));
  let id = 0;
  if (str != "0") {
    id = parseInt(str);
    if (!Number.isSafeInteger(id) || id.toString() != str) {
      return -1;
    }
  }
  return id;
}
export interface History {
  id: number;
  name: string;
}
export class Dir {
  static async make(dir: string, name: string): Promise<Dir | undefined> {
    const id = getID(name);
    if (id < 0) {
      return;
    }

    // 查找備份記錄
    const keys = new Map<number, string>();
    const history = new Array<History>();
    const path = joinPath(dir, name);
    for await (const item of Deno.readDir(path)) {
      if (!item.isDirectory) {
        continue;
      }
      const name = item.name;
      if (!match.test(name)) {
        continue;
      }
      const id = getID(name);
      if (id < 0) {
        continue;
      }
      const filepath = joinPath(path, name);
      if (!await fileExists(joinPath(filepath, TagOK))) {
        log.debug("remove invalid backup: ", filepath);
        // 刪除出錯的備份記錄
        await Deno.remove(filepath, { recursive: true });
        continue;
      }
      const found = keys.get(id);
      if (found) {
        throw new Error(`backup id aready exists: ${path} [${found}, ${name}]`);
      }
      keys.set(id, name);
      history.push({
        id: id,
        name: name,
      });
    }

    // 沒有記錄刪除空白檔案夾
    if (history.length == 0) {
      log.debug("remove empty backup dir:", path);
      await Deno.remove(path, { recursive: true });
      return;
    }
    // 排序
    history.sort((l, r) => l.id - r.id);
    for (let i = 0; i < history.length; i++) {
      if (i != history[i].id) {
        throw new Error(`backup id(${i}) is not consecutive, ${path}`);
      }
    }

    const completed = await fileExists(joinPath(path, TagCompleted));

    return new Dir(id, name, path, history, completed);
  }
  constructor(
    readonly id: number,
    readonly name: string,
    readonly path: string,
    readonly history: Array<History>,
    readonly completed: boolean,
  ) {}
  async backup() {
    if (this.completed) {
      throw new Error(`dir already completed: ${this.path}`);
    }
    const history = this.history;
    const last = history.length == 0 ? undefined : history[history.length - 1];
    const id = last ? last.id + 1 : 0;
    const name = `${id}.${dateNow()}`;
    const path = joinPath(this.path, name);

    // 創建檔案夾
    await Deno.mkdir(path, {
      recursive: true,
      mode: 0o775,
    });

    const cmds = [
      "mariabackup",
      "--backup",
      "--target-dir",
      path,
      "--user=root",
      "--password",
      Deno.env.get("MYSQL_ROOT_PASSWORD") ?? "",
    ];
    if (last) {
      cmds.push(
        "--incremental-basedir",
        joinPath(this.path, last.name),
      );
    }
    log.debug("run", cmds);
    const s = await Deno.run({
      cmd: cmds,
    }).status();
    if (!s.success) {
      throw new Error(`mariabackup errpr: ${s.code}`);
    }

    if (last) {
      const changed = await this._checkChanged(
        joinPath(path, "xtrabackup_info"),
      );
      if (!changed) {
        log.info("backup not changed, remove it", path);
      }
      await Deno.remove(path, { recursive: true });
      return;
    }

    // 記錄成功
    const f = await Deno.open(joinPath(path, TagOK), {
      mode: 0o664,
      create: true,
      write: true,
    });
    f.close();

    history.push({
      id: id,
      name: name,
    });
    console.log(path);
  }
  private async _checkChanged(filename: string): Promise<boolean> {
    const text = await Deno.readTextFile(filename);
    const from = this._getBigInt(text, "innodb_from_lsn");
    const to = this._getBigInt(text, "innodb_to_lsn");
    return from != to;
  }
  private _getBigInt(text: string, key: string): bigint {
    let start = text.indexOf(key);
    if (start == -1) {
      throw new Error(`not found key: ${key}`);
    }
    start += key.length;
    const end = text.indexOf("\n", start);
    text = text.substring(start, end == -1 ? undefined : end).trim();
    if (!text.startsWith("=")) {
      throw new Error(`not found key: ${key}`);
    }
    return BigInt(text.substring(1).trim());
  }
}
const match = /^[0-9]+\.[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
class Target {
  static async make(path: string): Promise<Target> {
    if (path == "") {
      path = ".";
    }
    // 查找輸出目標
    const keys = new Map<number, Dir>();
    const dirs = new Array<Dir>();
    let last: Dir | undefined;
    for await (const item of Deno.readDir(path)) {
      if (!item.isDirectory) {
        continue;
      }
      const name = item.name;
      if (!match.test(name)) {
        continue;
      }
      const d = await Dir.make(path, name);
      if (!d) {
        continue;
      }
      const found = keys.get(d.id);
      if (found) {
        throw new Error(`dir id already exists: [${found.name}, ${d.name}]`);
      }
      keys.set(d.id, d);
      if (!last || last.id < d.id) {
        last = d;
      }
      dirs.push(d);
    }
    dirs.sort((l, r) => l.id - r.id);
    return new Target(path, dirs);
  }
  constructor(
    readonly path: string,
    readonly dirs: Array<Dir>,
  ) {
  }
  backup() {
    const dirs = this.dirs;
    let last = dirs.length == 0 ? undefined : dirs[dirs.length - 1];
    if (!last || last.completed) {
      const id = last ? last.id + 1 : 0;
      const name = `${id}.${dateNow()}`;
      last = new Dir(id, name, joinPath(this.path, name), [], false);
      dirs.push(last);
    }
    return last.backup();
  }
}

export interface BackupOptions {
  test: boolean;
  output: string;
}
export class Backup {
  constructor(readonly opts: BackupOptions) {
    this.target_ = Asset.make(() => Target.make(opts.output));
  }
  private target_: Asset<Target>;

  async serve() {
    const opts = this.opts;
    log.info("run backup to:", opts.output);
    if (opts.test) {
      return;
    }

    const target = await this.target_.asset;
    console.log(target);
    await target.backup();
  }
}
