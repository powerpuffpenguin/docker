# mariadb

這個腳本主要用於爲接管 docker 中運行 mariadb 服務，並自動爲其進行主從設定定期備份等操作

# 備份

要自動備份只需要爲容器指定幾個相關環境變量即可

| 變量名       | 含義                                                               | 舉例                        |
| ------------ | ------------------------------------------------------------------ | --------------------------- |
| BACKUP\_CRON | 備份週期                                                           | 每晚1點執行備份 '0 1 * * *' |
| BACKUP\_NOW  | 如果爲 1 則在服務就緒後立刻執行一次備份                            | '1'                         |
| BACKUP\_DIR  | 備份存儲位置                                                       | '/backup'                   |
| BACKUP\_FULL | 最多保存多少個完整備份(自動刪除早期的備份檔案，小於1 不執行刪除)   | '3'                         |
| BACKUP\_INC  | 最多保存多少個增量備份(達到上限下次重新創建完整備份,小於 1 不執行) | '30'                        |

必須設置 BACKUP\_CRON/BACKUP\_NOW 才會創建備份，另外幾個變量則控制備份細節。例如將 BACKUP\_FULL 設置爲 3 將
BACKUP\_INC 設置爲 30 則相當於保留最近三個月的備份，並且每月重新創建一次完整備份

> 對於從庫，即時 設置 BACKUP\_INC 小於1
> 也可能創建新的完整備份，因爲主從複製可能出現問題無法同步，此時腳本會爲從庫進行重新初始化(重新拷貝主庫內容並設置同步)，並且在此之後的備份將從一個新的完整備份開始

```
services:
  db:
    image: "${DB_IMAGE}"
    restart: always
    environment:
      - TZ=Asia/Shanghai
      - MYSQL_ROOT_PASSWORD=123
      - MYSQL_DATABASE=kk
      - MYSQL_USER=kk
      - MYSQL_PASSWORD=12345678

      - BACKUP_NOW=1
      - BACKUP_FULL=3
      - BACKUP_INC=30
    volumes:
      - ./conf/main.js:/main.js:ro
      - ${DATA_PATH}/master:/var/lib/mysql
      - ${DATA_PATH}/backup:/backup # 備份存儲位置
    command: ["deno","run","-A","main.js"]
```

# 主從同用

爲了自動創建主從設定，你通常需要爲所有容器指定環境變量，推薦創建一個單獨的 db.env 檔案來設定

```
MYSQL_ROOT_PASSWORD=123
MYSQL_DATABASE=kk
MYSQL_USER=kk
MYSQL_PASSWORD=12345678

MYSQL_SLAVE_NAME=slave
MYSQL_SLAVE_PASSWORD=456
```

前4個是 mariadb 容器使用的變量，和原容器中含義相同，MYSQL\_SLAVE\_NAME 和 MYSQL\_SLAVE\_PASSWORD
將指定一個用於主從同步的用戶名以及密碼，腳本將自動創建這個用戶並使用它來進行主從同步。

如果你只想使用自動備份功能則可以不指定 MYSQL\_SLAVE\_NAME 與 MYSQL\_SLAVE\_PASSWORD 變量

| 變量         | 含義                                                |
| ------------ | --------------------------------------------------- |
| SERVER\_ID   | 在 server-id.cnf 中設置 服務器 id                   |
| NCAT\_PORT   | 使用 ncat 監聽指定端口用於複製數據庫內容            |
| MASTER\_ADDR | 設置 master 地址，一旦設置此值容器將作爲 salve 運行 |
| MASTER\_NCAT | 設置 master ncat 端口，默認 3307                    |
| BACKUP\_CRON | 何時執行備份                                        |

```
services:
  master:
    image: "${DB_IMAGE}"
    restart: always
    env_file:
      - ./conf/db.env
    environment:
      - TZ=Asia/Shanghai
      - SERVER_ID=1
      - NCAT_PORT=3307
    volumes:
      - ./conf/main.js:/main.js:ro
      - ./conf/master.cnf:/etc/mysql/conf.d/master.cnf:ro
      - ${DATA_PATH}/master:/var/lib/mysql
    command: ["deno","run","-A","main.js"]
  slave:
    image: "${DB_IMAGE}"
    restart: always
    env_file:
      - ./conf/db.env
    environment:
      - TZ=Asia/Shanghai
      - SERVER_ID=100
      - MASTER_ADDR=master
      - MASTER_NCAT=3307
    volumes:
      - ./conf/main.js:/main.js:ro
      - ./conf/slave.cnf:/etc/mysql/conf.d/slave.cnf:ro
      - ${DATA_PATH}/slave:/var/lib/mysql
    command: ["deno","run","-A","main.js"]
  backup:
    image: "${DB_IMAGE}"
    restart: always
    env_file:
      - ./conf/db.env
    environment:
      - TZ=Asia/Shanghai
      - SERVER_ID=200
      - MASTER_ADDR=master
      - MASTER_NCAT=3307

      - BACKUP_FULL=3
      - BACKUP_INC=30
      - BACKUP_CRON=0 1 * * *
    volumes:
      - ./conf/main.js:/main.js:ro
      - ./conf/slave.cnf:/etc/mysql/conf.d/slave.cnf:ro
      - ${DATA_PATH}/backup:/var/lib/mysql
      - ${DB_BACKUP}:/backup
    command: ["deno","run","-A","main.js"]
```
