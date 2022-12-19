import { log } from "./deps/easyts/log/mod.ts";
import { backupCommand } from "./backup.ts";
import { Command, Parser } from "./deps/flags/mod.ts";
import { Service } from "./service/service.ts";
const root = new Command({
  use: "main.ts",
  short: "mariadb docker tools",
  async run() {
    try {
      await new Service().serve();
    } catch (e) {
      log.fail(e);
      Deno.exit(1);
    }
  },
});
root.add(
  backupCommand,
);
new Parser(root).parse(Deno.args);
