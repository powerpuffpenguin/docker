import { log } from "./deps/easyts/log/mod.ts";
import { Command } from "./deps/flags/mod.ts";
import { Backup } from "./service/backup.ts";

export const backupCommand = new Command({
  use: "backup",
  short: "backup mariadb",
  prepare(flags, _) {
    const test = flags.bool({
      name: "test",
      short: "t",
      usage: "output execute command, but not execute",
    });
    const output = flags.string({
      name: "output",
      short: "o",
      default: "/backup",
      usage: `backup output dir`,
    });
    return async () => {
      try {
        await new Backup({
          test: test.value,
          output: output.value,
        }).serve();
      } catch (e) {
        log.error(e);
        Deno.exit(1);
      }
    };
  },
});
