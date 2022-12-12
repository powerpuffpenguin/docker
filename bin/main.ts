import { Command, Parser } from "./deps/flags/mod.ts";
import { mariadb } from "./mariadb/docker.ts";
import { Docker } from "./docker.ts";
const dockers = [
  mariadb(),
];

const root = new Command({
  use: "main.ts",
  short: "docker build tools",
  long: "docker build tools\n\ndeno run main.ts " +
    dockers.map((v) => v.command).join(" "),
  prepare(flags, _) {
    const test = flags.bool({
      name: "test",
      short: "t",
      usage: "test output, but don't build",
    });
    const all = flags.bool({
      name: "all",
      short: "a",
      usage: "build all",
    });
    const latest = flags.bool({
      name: "latest",
      short: "l",
      usage: "only build latest",
    });
    const prefix = flags.string({
      name: "prefix",
      usage: "tag prefix",
      default: "king011/",
    });
    const build = (docker: Docker) => {
      docker.build({
        prefix: prefix.value,
        test: test.value,
        latest: latest.value,
      });
    };
    return (args) => {
      if (all.value) {
        for (const docker of dockers) {
          build(docker);
        }
      } else {
        for (const arg of args) {
          for (const docker of dockers) {
            if (docker.command == arg) {
              build(docker);
              break;
            }
          }
        }
      }
    };
  },
});

new Parser(root).parse(Deno.args);
