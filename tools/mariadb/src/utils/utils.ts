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
}
export function ncat(port: number, user: string, password: string) {
  log.info("ncat listen:", port);
  return runProcess(
    "gosu",
    "mysql",
    "ncat",
    "--listen",
    "--keep-open",
    "--send-only",
    "--max-conns=1",
    port.toString(),
    "-c",
    `mariabackup --backup --slave-info --stream=xbstream --host=127.0.0.1 --user='${user}' --password='${password}'`,
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

export function createSlave(
  user: string,
  password: string,
  slaveName: string,
  slavePassword: string,
) {
  log.info(
    `create slave: name=${slaveName} password=${slavePassword}`,
  );
  return runProcess(
    "mysql",
    "-h",
    "127.0.0.1",
    "--user",
    user,
    `--password=${password}`,
    "-e",
    `CREATE USER IF NOT EXISTS '${slaveName}'@'%' IDENTIFIED BY '${slavePassword}';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${slaveName}'@'%';
FLUSH PRIVILEGES;`,
  );
}
