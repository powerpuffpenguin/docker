import { log } from "../deps/easyts/log/mod.ts";

export async function writeServerID(id: bigint) {
  log.info(`server-id=${id}`);
  await Deno.writeTextFile(
    `/etc/mysql/conf.d/server-id.cnf`,
    `[mysqld]
server-id=${id}
`,
    {
      mode: 0o664,
    },
  );
}
/**
 * 等待 mysqld 就緒
 */
export async function waitMysqld(user: string, password: string) {
  log.info("wait mysqld");
  while (true) {
    const s = await runProcess(
      "mysql",
      "-h",
      "127.0.0.1",
      "--user",
      user,
      "--password=" + password,
      "-e",
      "SELECT 1",
    );
    if (s.success) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  runProcess(
    "bash",
    "-c",
    `until mysql -h 127.0.0.1 --user="${user}" --password="${password}" -e "SELECT 1"; do sleep 1; done`,
  );
}

export async function runProcess(...cmd: Array<string>) {
  log.debug("run", cmd);
  const p = Deno.run({
    cmd: cmd,
  });
  try {
    const s = await p.status();
    return s;
  } finally {
    p.close();
  }
}
