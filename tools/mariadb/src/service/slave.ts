import { log } from "../deps/easyts/log/mod.ts";
import { Backup } from "./backup.ts";
import { Service } from "./service.ts";
export class Slave extends Service {
  async serve() {
    try {
      await this.writeServerID();

      // 從 master 複製數據
      await this._clone();

      // 運行 mysqld
      const p = this.runMysqd();

      this._serve();
      const s = await p?.status();
      if (s && !s.success) {
        throw new Error("runMysqd not success");
      }
    } catch (e) {
      log.fail(e);
      Deno.exit(1);
    }
  }
  private async _serve() {
    const opts = this.opts;
    if (opts.backupNow) {
      await new Backup(opts).serve();
    }

    await this._slave();

    this.ncat(false);
    this.backup();
  }
  private async _slave() {
    const opts = this.opts;
    const p = this.bash(
      `#!/bin/bash
set -ex

echo "Waiting for mysqld to be ready (accepting connections)"
until mysql -h 127.0.0.1 --user=root --password="$MYSQL_ROOT_PASSWORD" -e "SELECT 1"; do sleep 1; done

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
    mysql -h 127.0.0.1 --user=root --password="$MYSQL_ROOT_PASSWORD" \
        -e "$(<change_master_to.sql.in), \
                MASTER_HOST='${opts.master}', \
                MASTER_USER='$MYSQL_SLAVE_NAME', \
                MASTER_PASSWORD='$MYSQL_SLAVE_PASSWORD', \
                MASTER_CONNECT_RETRY=10; \
                START SLAVE;" || exit 1
    # In case of container restart, attempt this at-most-once.
    mv change_master_to.sql.in change_master_to.sql.orig
fi`,
    );
    if (p) {
      const s = await p.status();
      if (!s.success) {
        throw new Error(`slave error: ${s.code}`);
      }
    }
  }
  private async _clone() {
    const opts = this.opts;
    const p = this.bash(`#!/bin/bash
set -ex

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
    ncat --recv-only ${opts.master} 3307 | mbstream -x -C /var/lib/mysql
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
touch /var/lib/mysql/success-mariabackup
`);
    if (p) {
      const s = await p.status();
      if (!s.success) {
        throw new Error(`clone error: ${s.code}`);
      }
    }
  }
}
