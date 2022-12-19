import { Command, Parser } from "./deps/flags/mod.ts";
import { Master } from "./service/master.ts";
import { Cron } from "./deps/croner/croner.js";
import { backupCommand } from "./backup.ts";
import { slaveCommand } from "./slave.ts";
const root = new Command({
  use: "main.ts",
  short: "mariadb docker tools",
  prepare(flags) {
    const test = flags.bool({
      name: "test",
      short: "t",
      usage: "output execute command, but not execute",
    });
    const id = flags.number({
      name: "id",
      short: "i",
      usage: "create server-id.cnf and write server-id",
      default: 1,
      isValid: (v) => {
        return Number.isSafeInteger(v) && v >= 0;
      },
    });
    const file = flags.string({
      name: "file",
      usage: "server-id file name",
      default: "server-id.cnf",
      isValid: (v) => {
        return v.indexOf("/") < 0 || v.indexOf("\\") < 0;
      },
    });
    const ncat = flags.number({
      name: "ncat",
      short: "n",
      usage: "ncat listen port, if 0 not run ncat listen",
      default: 3307,
      isValid: (v) => {
        return Number.isSafeInteger(v) && v >= 0 && v < 65535;
      },
    });
    const backup = flags.string({
      name: "backup",
      short: "b",
      usage:
        `backup cron "1 * * * *" (m h DofM M DofW), if empty not run backup cron`,
      isValid: (v) => {
        v = v.trim();
        if (v == "") {
          return true;
        }
        const c = new Cron(v);
        return c.next() ? true : false;
      },
    });
    const backupNow = flags.bool({
      name: "backup-now",
      short: "B",
      usage: `run a backup immediately`,
    });
    const output = flags.string({
      name: "output",
      short: "o",
      default: "/backup",
      usage: `backup output dir`,
    });
    return () => {
      const srv = new Master({
        test: test.value,
        id: id.value,
        file: file.value,
        ncat: ncat.value,
        backup: backup.value.trim(),
        backupNow: backupNow.value,
        output: output.value,
      });
      srv.serve();
    };
  },
});
root.add(backupCommand, slaveCommand);
new Parser(root).parse(Deno.args);
