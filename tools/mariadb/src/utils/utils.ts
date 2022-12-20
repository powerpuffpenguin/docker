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

export async function createSlave(
  user: string,
  password: string,
  slaveName: string,
  slavePassword: string,
) {
  log.info(
    `create slave: name=${slaveName} password=${slavePassword}`,
  );
  const s = await runProcess(
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
  if (!s.success) {
    throw new Error(`create slave fail`);
  }
}
export async function cloneDB(addr: string, port: number) {
  const s = await runProcess(
    "bash",
    "-c",
    `set -ex

if [[ -f /var/lib/mysql/slave_error ]]; then
  rm /var/lib/mysql/* -rf
fi

# Check ready
if [[ -f /var/lib/mysql/success-mariabackup ]]; then
    exit 0
fi
# Check prepare fault
if [[ -f /var/lib/mysql/do-mariabackup ]]; then
    rm /var/lib/mysql/* -rf
fi

# Download full backup
if [[ ! -f /var/lib/mysql/success-ncat ]]; then
    rm /var/lib/mysql/* -rf
    ncat --recv-only '${addr}' ${port} | mbstream -x -C /var/lib/mysql
    if [[ -d /var/lib/mysql/mysql ]]; then
        touch /var/lib/mysql/success-ncat
    else
        echo ncat not data
        exit 1
    fi
fi

# Prepare the backup
touch /var/lib/mysql/do-mariabackup
mariabackup --prepare --target-dir=/var/lib/mysql
touch /var/lib/mysql/success-mariabackup`,
  );
  if (!s.success) {
    throw new Error(`cloneDB fail`);
  }
}
export async function startSlave(addr: string, user: string, password: string) {
  const s = await runProcess(
    "bash",
    "-c",
    `set -ex

echo "Waiting for mysqld to be ready (accepting connections)"
until mysql -h 127.0.0.1 --user="${user}" --password="${password}" -e "SELECT 1"; do sleep 1; done

cd /var/lib/mysql

# Determine binlog position of cloned data, if any.
if [[ -f xtrabackup_slave_info && "x$(<xtrabackup_slave_info)" != "x" ]]; then
    # XtraBackup already generated a partial "CHANGE MASTER TO" query
    # because we're cloning from an existing slave. (Need to remove the tailing semicolon!)
    cat xtrabackup_slave_info | sed -E 's/;$//g' > change_master_to.sql.in
    # Ignore xtrabackup_binlog_info in this case (it's useless).
    rm -f xtrabackup_slave_info xtrabackup_binlog_info
elif [[ -f xtrabackup_binlog_info ]]; then
    # We're cloning directly from master. Parse binlog position.
    [[ \`cat xtrabackup_binlog_info\` =~ ^([[:alnum:]_\.\-]*?)[[:space:]]+([[:digit:]]*?)(.*?)$ ]] || exit 1
    rm -f xtrabackup_binlog_info xtrabackup_slave_info
    echo "CHANGE MASTER TO MASTER_LOG_FILE='\${BASH_REMATCH[1]}',\
        MASTER_LOG_POS=\${BASH_REMATCH[2]}" > change_master_to.sql.in
fi
# Check if we need to complete a clone by starting replication.
if [[ -f change_master_to.sql.in ]]; then
    echo "Initializing replication from clone position"
    mysql -h 127.0.0.1 --user="${user}" --password="${password}" \
        -e "$(<change_master_to.sql.in), \
                MASTER_HOST='${addr}', \
                MASTER_USER='$MYSQL_SLAVE_NAME', \
                MASTER_PASSWORD='$MYSQL_SLAVE_PASSWORD', \
                MASTER_CONNECT_RETRY=10; \
                START SLAVE;" || exit 1
    # In case of container restart, attempt this at-most-once.
    mv change_master_to.sql.in change_master_to.sql.orig
fi`,
  );
  if (!s.success) {
    throw new Error(`startSlave fail`);
  }
}
export async function watchSlave(user: string, password: string, s: number) {
  while (true) {
    const [errno, ioerrno] = await _watchSlave(user, password);
    if (
      errno == 1062 || // 主鍵衝突
      errno == 1032 || // 記錄未找到
      errno == 1146 || // 表未找到
      errno == 1594 // 讀取日誌錯誤
    ) {
      break;
    } else if (
      ioerrno == 1236 // 無法讀取日誌
    ) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, s * 1000));
  }
}
async function _watchSlave(user: string, password: string) {
  const p = Deno.run({
    cmd: [
      "mysql",
      "--user",
      user,
      "--password=" + password,
      "-e",
      "show slave status\\G",
    ],
    stdout: "piped",
  });
  await p.status();
  const text = new TextDecoder().decode(await p.output());
  return [_getNumber(text, "Last_Errno"), _getNumber(text, "Last_IO_Errno")];
}
function _getNumber(text: string, tag: string) {
  const str = _get(text, tag);
  const errno = parseInt(str);
  if (!Number.isSafeInteger(errno)) {
    throw new Error(`unknow ${tag}: ${str}`);
  }
  return errno;
}
function _get(text: string, tag: string): string {
  let i = text.indexOf(tag + ":");
  if (i == -1) {
    throw new Error(`not found tag: ${tag}`);
  }
  let str = text.substring(i + tag.length + 1);
  i = str.indexOf("\n");
  if (i > -1) {
    str = str.substring(0, i);
  }
  return str.trim();
}
