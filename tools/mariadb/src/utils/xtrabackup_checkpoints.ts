function getBigInt(text: string, key: string): bigint {
  let start = text.indexOf(key);
  if (start == -1) {
    throw new Error(`not found key: ${key}`);
  }
  start += key.length;
  const end = text.indexOf("\n", start);
  text = text.substring(start, end == -1 ? undefined : end).trim();
  if (!text.startsWith("=")) {
    throw new Error(`not found key: ${key}`);
  }
  return BigInt(text.substring(1).trim());
}

export class Checkpoints {
  static async load(filename: string): Promise<Checkpoints> {
    const text = await Deno.readTextFile(filename);
    const to = getBigInt(text, "to_lsn");
    const last = getBigInt(text, "last_lsn");
    return new Checkpoints(to, last);
  }
  constructor(
    readonly to: bigint,
    readonly last: bigint,
  ) {
  }
  equal(o: Checkpoints) {
    return this.to == o.to && this.last == o.last;
  }
}
