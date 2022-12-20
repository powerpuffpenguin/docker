import { Docker, Dockerfile } from "../docker.ts";

export function mariadb(): Docker {
  return new MyDocker([
    "10.9",
    "10.10",
  ].map((v) => new MyDockerfile(v)));
}
class MyDocker extends Docker {
  constructor(versions: Array<Dockerfile>) {
    super({
      name: "mariadb",
      versions: versions,
    });
  }
}
class MyDockerfile extends Dockerfile {
  private deno =
    "https://github.com/denoland/deno/releases/download/v1.28.3/deno-x86_64-unknown-linux-gnu.zip";
  constructor(version: string) {
    super(version);

    this.add(`FROM mariadb:${version}

RUN set -eux;  \\
    apt-get update;  \\
    apt-get -y --no-install-recommends install ncat curl unzip; \\
    rm -rf /var/lib/apt/lists/*; 

RUN set -eux;  \\
    curl -#Lo /a.zip ${this.deno}; \\
    unzip /a.zip -d /usr/bin/;  \\
    rm /a.zip;
COPY main.js /main.js
`);
  }
  prepare(dir: string) {
    return Deno.copyFile("tools/mariadb/conf/main.js", `${dir}/main.js`);
  }
}
