// deno-lint-ignore-file no-explicit-any
import template from "./deps/art-template/mod.ts";
import { log } from "./log.ts";

export class Dockerfile {
  constructor(readonly version: string) {}
  private s_ = Array<string>();
  add(...source: Array<string>) {
    this.s_.push(...source);
  }
  render(source: string, data: any) {
    this.s_.push(template.render(source, data));
  }
  string(data: any): string {
    const source = this.s_.join("\n");
    if (source == "") {
      return source;
    }
    return template.render(source, data);
  }
  async prepare(_: string) {}
}
export interface DockerOptions {
  name: string;
  command?: string;
  versions?: Array<Dockerfile>;
}
export interface BuildOptions {
  prefix?: string;
  test?: boolean;
  latest?: boolean;
}
export class Docker {
  protected readonly versions: Array<Dockerfile>;
  readonly name: string;
  readonly command: string;
  constructor(opts: DockerOptions) {
    const name = opts.name;
    this.name = name;
    this.command = opts.command ?? name;
    this.versions = Array.from(opts.versions ?? []);
  }
  add(...versions: Array<Dockerfile>) {
    this.versions.push(...versions);
  }
  async build(opts?: BuildOptions) {
    const name = `${opts?.prefix ?? ""}${this.name}`;
    const versions = this.versions;
    if (versions.length == 0) {
      return;
    }

    log.info(`build ${name}`);
    if (opts?.latest) {
      const v = versions[versions.length - 1];
      await this._build(opts, v);
    } else {
      for (const v of versions) {
        await this._build(opts, v);
      }
    }
  }
  private async _build(opts: undefined | BuildOptions, v: Dockerfile) {
    log.info(` - ${v.version}`);
    const str = v.string({
      version: v.version,
    });
    if (opts?.test) {
      return;
    }
    const name = `${opts?.prefix ?? ""}${this.name}`;
    const tag = `${name}:${v.version}`;
    const cwd = "build";
    await Deno.mkdir(`${cwd}`, { recursive: true });
    await Deno.writeTextFile(`${cwd}/Dockerfile`, str);
    await v.prepare(cwd);

    const cmd = [
      "sudo",
      "docker",
      "build",
      "--network",
      "host",
      "-t",
      tag,
      ".",
    ];
    log.info(cmd);
    const p = await Deno.run({
      cmd: cmd,
      cwd: cwd,
    });
    await p.status();
  }
  async push(opts?: BuildOptions) {
    const name = `${opts?.prefix ?? ""}${this.name}`;
    const versions = this.versions;
    if (versions.length == 0) {
      return;
    }

    log.info(`push ${name}`);
    if (opts?.latest) {
      const v = versions[versions.length - 1];
      await this._push(opts, v);
    } else {
      for (const v of versions) {
        await this._push(opts, v);
      }
    }
  }
  private async _push(opts: undefined | BuildOptions, v: Dockerfile) {
    log.info(` - ${v.version}`);
    if (opts?.test) {
      return;
    }
    const name = `${opts?.prefix ?? ""}${this.name}`;
    const tag = `${name}:${v.version}`;

    const cmd = [
      "sudo",
      "docker",
      "push",
      tag,
    ];
    log.info(cmd);
    const p = await Deno.run({
      cmd: cmd,
    });
    await p.status();
  }
}
