import { Command, Parser } from "./deps/flags/mod.ts";
import { Master } from "./service/master.ts";

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
      usage: "ncat listen port",
      default: 3307,
      isValid: (v) => {
        return Number.isSafeInteger(v) && v > 0 && v < 65535;
      },
    });
    const noncat = flags.bool({
      name: "no-ncat",
      usage: "not listen ncat",
    });
    return () => {
      const srv = new Master({
        test: test.value,
        id: id.value,
        file: file.value,
        ncat: ncat.value,
        noncat: noncat.value,
      });
      srv.serve();
    };
  },
});
new Parser(root).parse(Deno.args);
