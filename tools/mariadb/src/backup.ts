import { log } from "./deps/easyts/log/mod.ts";
import { Command } from "./deps/flags/mod.ts";
import { Backup } from "./service/backup.ts";

export const backupCommand = new Command({
  use: "backup",
  short: "backup mariadb",
  prepare(flags, _) {
    const output = flags.string({
      name: "output",
      short: "o",
      default: "/backup",
      usage: `backup output dir`,
    });
    const full = flags.number({
      name: "full",
      short: "f",
      default: 3,
      usage: `max full backup`,
      isValid(v) {
        return Number.isSafeInteger(v);
      },
    });
    const inc = flags.number({
      name: "inc",
      short: "i",
      default: 30,
      usage: `max incremental backup`,
      isValid(v) {
        return Number.isSafeInteger(v);
      },
    });
    const user = flags.string({
      name: "user",
      short: "u",
      default: "root",
      usage: `user name`,
    });
    const password = flags.string({
      name: "password",
      short: "p",
      default: "",
      usage: `user password`,
    });
    return async () => {
      try {
        const srv = new Backup({
          dir: output.value,
          full: full.value,
          inc: inc.value,
          user: user.value,
          password: password.value,
        });
        await srv.init();
        await srv.create();
      } catch (e) {
        log.fail(e);
        Deno.exit(1);
      }
    };
  },
});
