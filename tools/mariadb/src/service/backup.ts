import { log } from "../deps/easyts/log/mod.ts";
import { Checkpoints } from "../utils/xtrabackup_checkpoints.ts";

const Tag = `_tag_`;
const TagOK = `${Tag}ok`;
const TagCompleted = `${Tag}completed`;
function dateNow(): string {
  const d = new Date();
  return `${d.getFullYear().toString()}-${
    d.getMonth().toString().padStart(2, "0")
  }-${d.getDay().toString().padStart(2, "0")}`;
}
const match = /^[0-9]+\.[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
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
      throw new Error(`unknow id: ${name}`);
    }
  }
  return id;
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
export interface BackupOptions {
  /**
   * 保留多少個完整備份 <1 不限制
   */
  full: number;
  /**
   * 保留多少個增量備份 <1 不限制
   */
  inc: number;
  /**
   * 備份存儲檔案夾
   */
  dir: string;
  /**
   * 用戶名
   */
  user: string;
  /**
   * 密碼
   */
  password: string;
}

export class Backup {
  private targets_ = new Array<Target>();
  constructor(readonly opts: BackupOptions) {
  }
  /**
   * 初始化
   */
  async init() {
    const opts = this.opts;
    const stat = await Deno.stat(opts.dir);
    if (!stat.isDirectory) {
      throw new Error(`backup dir not a dir: ${opts.dir}`);
    }

    const keys = new Map<number, Target>();
    const tag = "target.";
    const targets = this.targets_;
    for await (const item of Deno.readDir(opts.dir)) {
      if (!item.isDirectory) {
        continue;
      }
      const name = item.name;
      if (!name.startsWith(tag)) {
        continue;
      }
      if (!match.test(name.substring(tag.length))) {
        continue;
      }
      const id = getID(name.substring(tag.length));
      const found = keys.get(id);
      if (found) {
        throw new Error(
          `target id(${id}) already exists: [${found.name}, ${name}]`,
        );
      }

      const path = joinPath(opts.dir, name);
      const target = new Target(id, name, path);
      await target.init();
      if (target.history.length == 0) {
        // 刪除無效的 目標
        await Deno.remove(target.path, { recursive: true });
        continue;
      }

      keys.set(id, target);
      targets.push(target);
    }
    targets.sort((l, r) => l.id - r.id);

    await this.delete();
  }
  /**
   * 刪除多餘的備份
   */
  async delete() {
    const opts = this.opts;
    if (opts.full < 1) {
      return;
    }
    const max = opts.full + 1;
    const targets = this.targets_;
    while (targets.length > max) {
      const target = targets[0];
      await Deno.remove(target.path, { recursive: true });
      targets.splice(0, 1);
    }
  }
  /**
   * 創建一個新的備份
   */
  async create() {
    const opts = this.opts;
    const targets = this.targets_;
    let target: Target;
    if (targets.length == 0) {
      const id = 0;
      const name = `target.${id}.${dateNow()}`;
      target = new Target(id, name, joinPath(opts.dir, name));

      // 創建檔案夾
      await Deno.mkdir(target.path, {
        mode: 0o775,
      });

      targets.push(target);
    } else {
      target = targets[targets.length - 1];
      if (target.completed) {
        const id = target.id + 1;
        const name = `target.${id}.${dateNow()}`;
        target = new Target(id, name, joinPath(opts.dir, name));

        // 創建檔案夾
        await Deno.mkdir(target.path, {
          mode: 0o775,
        });

        targets.push(target);
      }
    }

    await target.create(opts.user, opts.password);

    await this.delete();
  }
}

class Target {
  /**
   * 設置完成，將不再創建備份
   */
  completed = false;
  history = new Array<History>();
  constructor(
    public id: number,
    public name: string,
    public path: string,
  ) {
  }
  async init() {
    const path = this.path;
    const history = this.history;
    const keys = new Map<number, History>();
    for await (const item of Deno.readDir(path)) {
      if (!item.isDirectory) {
        continue;
      }
      const name = item.name;
      if (!match.test(name)) {
        continue;
      }
      const id = getID(name);
      const p = joinPath(path, name);
      if (!await fileExists(joinPath(p, TagOK))) {
        // 刪除 未完成的 備份
        await Deno.remove(p, { recursive: true });
        continue;
      }
      const checkpoints = await Checkpoints.load(
        joinPath(p, "xtrabackup_checkpoints"),
      );

      const found = keys.get(id);
      if (found) {
        throw new Error(
          `${path} history id(${id}) already exists: ${found.name} ${name}`,
        );
      }

      const node = {
        id: id,
        name: name,
        checkpoints: checkpoints,
      };
      history.push(node);
      keys.set(id, node);
    }

    history.sort((l, r) => l.id - r.id);
    for (let i = 0; i < history.length; i++) {
      if (i != history[i].id) {
        throw new Error(`backup id(${i}) is not consecutive, ${path}`);
      }
    }

    this.completed = await fileExists(joinPath(path, TagCompleted));
  }

  async create(user: string, password: string) {
    if (this.completed) {
      throw new Error(`target already completed: ${this.path}`);
    }
    const history = this.history;
    const last = history.length == 0 ? undefined : history[history.length - 1];
    const id = last ? last.id + 1 : 0;
    const name = `${id}.${dateNow()}`;
    const path = joinPath(this.path, name);

    // 創建檔案夾
    await Deno.mkdir(path, {
      mode: 0o775,
    });
    const cmds = [
      "mariabackup",
      "--backup",
      "--target-dir",
      path,
      "--user",
      user,
      "--password",
      password,
    ];
    if (last) {
      cmds.push(
        "--incremental-basedir",
        joinPath(this.path, last.name),
      );
    }
    log.info("mariabackup", cmds);
    const p = Deno.run({
      cmd: cmds,
    });
    try {
      const s = await p.status();
      if (!s.success) {
        throw new Error(`mariabackup errpr: ${s.code}`);
      }
    } finally {
      p.close();
    }

    const checkpoints = await Checkpoints.load(
      joinPath(path, "xtrabackup_checkpoints"),
    );
    if (last) {
      if (checkpoints.equal(last.checkpoints)) {
        log.info("backup not changed, remove it", path);

        await Deno.remove(path, { recursive: true });
        return;
      }
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
      checkpoints: checkpoints,
    });
  }
}
export interface History {
  id: number;
  name: string;
  checkpoints: Checkpoints;
}
