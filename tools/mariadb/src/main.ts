import { Command, Parser } from "./deps/flags/mod.ts";

const root = new Command({
  use: "main.ts",
  short: "mariadb docker tools",
  async run() {
    const p = await Deno.run({
      cmd: ["docker-entrypoint.sh", "mariadbd"],
    });
    console.log(await p.status());
  },
});
new Parser(root).parse(Deno.args);
