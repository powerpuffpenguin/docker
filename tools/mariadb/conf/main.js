// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

class FlagsException extends Error {
    constructor(message){
        super(message);
    }
}
const minpad = 8;
const matchUse = new RegExp(/^[a-zA-Z][a-zA-Z0-9\-_\.]*$/u);
const matchFlagShort = new RegExp(/^[a-zA-Z0-9]$/u);
function isShortFlag(v) {
    if (v.length != 1) {
        return false;
    }
    const c = v.codePointAt(0);
    return c !== undefined && c < 128 && c > 0;
}
function compareString(l, r) {
    if (l == r) {
        return 0;
    }
    return l < r ? -1 : 1;
}
class Command {
    parent_;
    children_;
    flags_;
    args;
    constructor(opts){
        this.opts = opts;
        this.args = new Array();
        if (!matchUse.test(opts.use)) {
            throw new FlagsException(`use invalid: ${opts.use}`);
        }
        const __short = opts.short;
        if (__short !== undefined && __short.indexOf("\n") != -1) {
            throw new FlagsException(`short invalid: ${__short}`);
        }
        this.flags_ = Flags.make(this);
    }
    add(...cmds) {
        if (cmds.length == 0) {
            return;
        }
        let children = this.children_;
        if (!children) {
            children = new Map();
            this.children_ = children;
        }
        for (const cmd of cmds){
            if (cmd.parent_) {
                throw new FlagsException(`command "${cmd.opts.use}" already added to "${cmd.parent_.flags().use}"`);
            }
            const opts = cmd.opts;
            if (opts.prepare) {
                const run = opts.prepare(cmd.flags(), cmd);
                if (run) {
                    opts.run = run;
                }
            }
            const key = opts.use;
            if (children.has(key)) {
                throw new FlagsException(`command "${key}" already exists`);
            } else {
                cmd.parent_ = this;
                cmd.flags();
                children.set(key, cmd);
            }
        }
    }
    flags() {
        return this.flags_;
    }
    parse(args, opts) {
        if (opts === undefined) {
            opts = {};
        }
        this._parse(args, 0, args.length, opts);
    }
    _parse(args, start, end, opts) {
        this.args.splice(0);
        const flags = this.flags();
        flags.reset();
        if (end - start < 1) {
            const run = this.opts.run;
            if (run) {
                run(this.args, this);
            }
            return;
        }
        const children = this.children_;
        for(let i = start; i < end; i++){
            const arg = args[i];
            if (arg == "-" || arg == "--") {
                if (opts.unknowFlags) {
                    continue;
                }
                throw new FlagsException(`unknown flag in ${flags.use}: ${arg}`);
            }
            if (arg.startsWith("-")) {
                if (arg == "-h") {
                    this._print();
                    return;
                }
                const val = i + 1 < end ? args[i + 1] : undefined;
                if (arg.startsWith("--")) {
                    if (arg == "--help") {
                        const h = this._parseHelp(flags, "--help", val);
                        if (h == -1) {
                            this._print();
                            return;
                        }
                        i += h;
                        continue;
                    }
                    i += this._parseLong(flags, arg.substring(2), val, opts);
                } else {
                    if (arg == "-h") {
                        const h1 = this._parseHelp(flags, "-h", val);
                        if (h1 == -1) {
                            this._print();
                            return;
                        }
                        i += h1;
                        continue;
                    }
                    const h2 = this._parseShort(flags, arg.substring(1), val, opts);
                    if (h2 == -1) {
                        this._print();
                        return;
                    }
                    i += h2;
                }
            } else if (children) {
                const sub = children.get(arg);
                if (sub) {
                    sub._parse(args, i + 1, end, opts);
                    return;
                } else {
                    if (opts.unknowCommand) {
                        return;
                    }
                    throw new FlagsException(`unknow commnad <${arg}>`);
                }
            } else {
                this.args.push(arg);
            }
        }
        const run1 = this.opts.run;
        if (run1) {
            run1(this.args, this);
        }
    }
    _throw(flags, flag, arg, val) {
        if (val === undefined && !flag.isBool()) {
            throw new FlagsException(`flag in ${flags.use} needs an argument: ${arg}`);
        }
        if (val === undefined) {
            val = "";
        } else {
            val = ` ${val}`;
        }
        throw new FlagsException(`invalid flag value in ${flags.use}: ${arg}${val}`);
    }
    _parseHelp(flags, arg, val) {
        if (val === undefined || val === "true") {
            return -1;
        } else if (val === "false") {
            return 1;
        }
        if (val === undefined) {
            throw new FlagsException(`flag in ${flags.use} needs an argument: ${arg}`);
        }
        if (val === undefined) {
            val = "";
        } else {
            val = ` ${val}`;
        }
        throw new FlagsException(`invalid flag value in ${flags.use}: ${arg}${val}`);
    }
    _parseShortOne(flags, arg, val, opts) {
        if (arg == "h") {
            return this._parseHelp(flags, `-${arg}`, val);
        }
        const flag = flags.find(arg, true);
        if (!flag) {
            if (opts.unknowFlags) {
                return 1;
            }
            throw new FlagsException(`unknown flag in ${flags.use}: -${arg}`);
        }
        if (flag.isBool()) {
            if (val !== "false" && val !== "true") {
                val = undefined;
            }
        }
        if (flag.add(val)) {
            return val === undefined ? 0 : 1;
        }
        this._throw(flags, flag, `-${arg}`, val);
    }
    _parseShort2(flags, arg, val, opts) {
        if (arg == "h") {
            const v = this._parseHelp(flags, "-h", val);
            return v == -1 ? v : 0;
        }
        const flag = flags.find(arg, true);
        if (!flag) {
            if (opts.unknowFlags) {
                return 0;
            }
            throw new FlagsException(`unknown flag in ${flags.use}: -${arg}`);
        }
        if (flag.add(val)) {
            return 0;
        }
        this._throw(flags, flag, `-${arg}`, val);
    }
    _parseShort(flags, arg, nextVal, opts) {
        switch(arg.length){
            case 0:
                if (opts.unknowFlags) {
                    return 0;
                }
                throw new FlagsException(`unknown flag in ${flags.use}: -${arg}`);
            case 1:
                return this._parseShortOne(flags, arg, nextVal, opts);
        }
        if (arg[1] == "=") {
            return this._parseShort2(flags, arg[0], arg.substring(2), opts);
        }
        const name = arg[0];
        const flag = flags.find(name, true);
        if (!flag) {
            if (opts.unknowFlags) {
                return 0;
            }
            throw new FlagsException(`unknown flag in ${flags.use}: -${name}`);
        } else if (!flag.isBool()) {
            return this._parseShort2(flags, arg[0], arg.substring(1), opts);
        }
        if (flag.add(undefined)) {
            return this._parseShort(flags, arg.substring(1), nextVal, opts);
        }
        throw new FlagsException(`invalid flag value in ${flags.use}: ${name}`);
    }
    _parseLong(flags, arg, val, opts) {
        const found = arg.indexOf("=");
        let name;
        let next = false;
        if (found == -1) {
            name = arg;
            next = true;
        } else {
            name = arg.substring(0, found);
            val = arg.substring(found + 1);
        }
        const flag = flags.find(name);
        if (!flag) {
            if (opts.unknowFlags) {
                return next ? 1 : 0;
            }
            throw new FlagsException(`unknown flag in ${flags.use}: --${name}`);
        }
        if (next && flag.isBool()) {
            if (val !== "false" && val !== "true") {
                next = false;
                val = undefined;
            }
        }
        if (flag.add(val)) {
            return next ? 1 : 0;
        }
        this._throw(flags, flag, `--${name}`, val);
    }
    _print() {
        console.log(this.toString());
    }
    toString() {
        const opts = this.opts;
        const use = this.flags().use;
        const strs = new Array();
        const __long = opts.long ?? "";
        const __short = opts.short ?? "";
        if (__long == "") {
            if (__short != "") {
                strs.push(__short);
            }
        } else {
            strs.push(__long);
        }
        if (strs.length == 0) {
            strs.push("Usage:");
        } else {
            strs.push("\nUsage:");
        }
        strs.push(`  ${use} [flags]`);
        const children = this.children_;
        if (children) {
            strs.push(`  ${use} [command]

Available Commands:`);
            const arrs = new Array();
            let pad = 0;
            for (const v of children.values()){
                const len = v.opts.use.length ?? 0;
                if (len > pad) {
                    pad = len;
                }
                arrs.push(v);
            }
            pad += 3;
            if (pad < 8) {
                pad = minpad;
            }
            arrs.sort((l, r)=>compareString(l.opts.use, r.opts.use));
            for (const child of arrs){
                const opts1 = child.opts;
                strs.push(`  ${opts1.use.padEnd(pad)}${opts1.short}`);
            }
        }
        const flags = this.flags();
        let sp = 1;
        let lp = 4;
        for (const f of flags){
            if (sp < f.short.length) {
                sp = f.short.length;
            }
            if (lp < f.name.length) {
                lp = f.name.length;
            }
        }
        if (lp < 8) {
            lp = minpad;
        }
        strs.push(`\nFlags:
  -${"h".padEnd(sp)}, --${"help".padEnd(lp)}   help for ${opts.use}`);
        for (const f1 of flags){
            let s = "";
            let str = f1.defaultString();
            if (str != "") {
                s += " " + str;
            }
            str = f1.valuesString();
            if (str != "") {
                s += " " + str;
            }
            if (f1.short == "") {
                strs.push(`   ${"".padEnd(sp)}  --${f1.name.toString().padEnd(lp)}   ${f1.usage}${s}`);
            } else {
                strs.push(`  -${f1.short.toString().padEnd(sp)}, --${f1.name.toString().padEnd(lp)}   ${f1.usage}${s}`);
            }
        }
        if (children) {
            strs.push(`\nUse "${use} [command] --help" for more information about a command.`);
        }
        return strs.join("\n");
    }
    print() {
        console.log(this.toString());
    }
    parent() {
        return this.parent_;
    }
    opts;
}
class Flags {
    static make(cmd) {
        return new Flags(cmd);
    }
    constructor(cmd){
        this.cmd = cmd;
    }
    get use() {
        const cmd = this.cmd;
        let parent = cmd.parent();
        let use = cmd.opts.use;
        while(parent){
            use = `${parent.opts.use} ${use}`;
            parent = parent.parent();
        }
        return use;
    }
    short_;
    long_;
    arrs_;
    find(name, __short = false) {
        return __short ? this.short_?.get(name) : this.long_?.get(name);
    }
    _getArrs() {
        const keys = this.long_;
        if (!keys) {
            return;
        }
        let arrs = this.arrs_;
        if (!arrs || arrs.length != keys.size) {
            arrs = [];
            for (const f of keys.values()){
                arrs.push(f);
            }
            arrs.sort((l, r)=>compareString(l.name, r.name));
        }
        return arrs;
    }
    iterator() {
        const arrs = this._getArrs();
        let i = 0;
        return {
            next () {
                if (arrs && i < arrs.length) {
                    return {
                        value: arrs[i++]
                    };
                }
                return {
                    done: true
                };
            }
        };
    }
    [Symbol.iterator]() {
        return this.iterator();
    }
    reset() {
        this.long_?.forEach((f)=>{
            f.reset();
        });
    }
    add(...flags) {
        if (flags.length == 0) {
            return;
        }
        let kl = this.long_;
        if (!kl) {
            kl = new Map();
            this.long_ = kl;
        }
        let ks = this.short_;
        if (!ks) {
            ks = new Map();
            this.short_ = ks;
        }
        for (const f of flags){
            const name = f.name;
            if (kl.has(name)) {
                throw new FlagsException(`${this.use} flag redefined: ${name}`);
            }
            const __short = f.short;
            if (__short !== "") {
                const found = ks.get(__short);
                if (found) {
                    throw new FlagsException(`unable to redefine '${__short}' shorthand in "${this.use}" flagset: it's already used for "${found.name}" flag`);
                }
                if (!isShortFlag(__short)) {
                    throw new FlagsException(`"${__short}" shorthand in "${this.use} is more than one ASCII character`);
                }
                ks.set(__short, f);
            }
            kl.set(name, f);
        }
    }
    string(opts) {
        const f = new FlagString(opts);
        this.add(f);
        return f;
    }
    strings(opts) {
        const f = new FlagStrings(opts);
        this.add(f);
        return f;
    }
    number(opts) {
        const f = new FlagNumber(opts);
        this.add(f);
        return f;
    }
    numbers(opts) {
        const f = new FlagNumbers(opts);
        this.add(f);
        return f;
    }
    bigint(opts) {
        const f = new FlagBigint(opts);
        this.add(f);
        return f;
    }
    bigints(opts) {
        const f = new FlagBigints(opts);
        this.add(f);
        return f;
    }
    bool(opts) {
        const f = new FlagBoolean(opts);
        this.add(f);
        return f;
    }
    bools(opts) {
        const f = new FlagBooleans(opts);
        this.add(f);
        return f;
    }
    cmd;
}
class FlagBase {
    value_;
    get value() {
        return this.value_;
    }
    constructor(opts){
        this.opts = opts;
        if (opts.short !== undefined && opts.short !== "" && !matchFlagShort.test(opts.short)) {
            throw new FlagsException(`"${opts.short}" shorthand should match "^[a-zA-Z0-9]$"`);
        }
        if (!matchUse.test(opts.name)) {
            throw new FlagsException(`"${opts.name}" flag should match "^[a-zA-Z][a-zA-Z0-9\\-_\\.]*$"`);
        }
        if (opts.usage !== undefined && opts.usage.indexOf("\n") != -1) {
            throw new FlagsException(`flag usage invalid: ${opts.usage}`);
        }
        if (Array.isArray(opts.default)) {
            const a = Array.from(opts.default);
            this.value_ = a;
        } else {
            this.value_ = opts.default;
        }
    }
    get short() {
        return this.opts.short ?? "";
    }
    get name() {
        return this.opts.name;
    }
    get default() {
        return this.opts.default;
    }
    get usage() {
        return this.opts.usage ?? "";
    }
    get values() {
        return this.opts.values;
    }
    isValid(v) {
        if (typeof v === "number") {
            if (!isFinite(v)) {
                return false;
            }
        }
        if (Array.isArray(v)) {
            for (const i of v){
                if (!isFinite(i)) {
                    return false;
                }
            }
        }
        const opts = this.opts;
        const values = opts.values;
        if (values && values.length != 0) {
            for (const val of values){
                if (this._equal(v, val)) {
                    return true;
                }
            }
            const f = opts.isValid;
            if (f) {
                return f(v);
            }
            return false;
        }
        const f1 = opts.isValid;
        if (f1) {
            return f1(v);
        }
        return true;
    }
    _equal(l, r) {
        if (Array.isArray(l) && Array.isArray(r)) {
            if (l.length != r.length) {
                return false;
            }
            for(let i = 0; i < l.length; i++){
                if (l[i] !== r[i]) {
                    return false;
                }
            }
        }
        return l === r;
    }
    reset() {
        const def = this.opts.default;
        if (Array.isArray(def)) {
            const arrs = this.value_;
            if (Array.isArray(arrs)) {
                arrs.splice(0);
                arrs.push(...def);
                return;
            }
        }
        this.value_ = this.opts.default;
    }
    defaultString() {
        const val = this.opts.default;
        if (Array.isArray(val)) {
            if (val.length != 0) {
                return `(default ${JSON.stringify(val)})`;
            }
        } else if (typeof val === "string") {
            if (val != "") {
                return `(default ${JSON.stringify(val)})`;
            }
        } else if (typeof val === "boolean") {
            if (val) {
                return `(default ${val})`;
            }
        } else if (typeof val === "number") {
            if (val != 0) {
                return `(default ${val})`;
            }
        } else if (typeof val === "bigint") {
            if (val != BigInt(0)) {
                return `(default ${val})`;
            }
        }
        return "";
    }
    valuesString() {
        const vals = this.opts.values;
        if (vals && vals.length != 0) {
            return `(values ${JSON.stringify(vals)})`;
        }
        return "";
    }
    add(_) {
        return false;
    }
    isBool() {
        return false;
    }
    opts;
}
function formatFlagOptions(opts, def) {
    if (opts.default !== undefined) {
        return opts;
    }
    return {
        name: opts.name,
        default: def,
        short: opts.short,
        usage: opts.usage,
        values: opts.values,
        isValid: opts.isValid
    };
}
class FlagString extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, ""));
    }
    add(v) {
        if (v === undefined || !this.isValid(v)) {
            return false;
        }
        this.value_ = v;
        return true;
    }
}
class FlagStrings extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, []));
    }
    add(v) {
        if (v === undefined || !this.isValid([
            v
        ])) {
            return false;
        }
        this.value_.push(v);
        return true;
    }
}
class FlagNumber extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, 0));
    }
    add(v) {
        if (v === undefined) {
            return false;
        }
        const i = parseInt(v);
        if (!this.isValid(i)) {
            return false;
        }
        this.value_ = i;
        return true;
    }
}
class FlagNumbers extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, []));
    }
    add(v) {
        if (v === undefined) {
            return false;
        }
        const i = parseInt(v);
        if (!this.isValid([
            i
        ])) {
            return false;
        }
        this.value_.push(i);
        return true;
    }
}
class FlagBigint extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, BigInt(0)));
    }
    add(v) {
        if (v === undefined) {
            return false;
        }
        try {
            const i = BigInt(v);
            if (!this.isValid(i)) {
                return false;
            }
            this.value_ = i;
            return true;
        } catch (_) {
            return false;
        }
    }
}
class FlagBigints extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, []));
    }
    add(v) {
        if (v === undefined) {
            return false;
        }
        try {
            const i = BigInt(v);
            if (!this.isValid([
                i
            ])) {
                return false;
            }
            this.value_.push(i);
            return true;
        } catch (_) {
            return false;
        }
    }
}
function parseBool(v) {
    if (v === undefined) {
        return true;
    } else if (v === "true") {
        return true;
    } else if (v === "false") {
        return false;
    }
    return undefined;
}
class FlagBoolean extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, false));
    }
    isBool() {
        return true;
    }
    add(v) {
        const val = parseBool(v);
        if (val === undefined || !this.isValid(val)) {
            return false;
        }
        this.value_ = val;
        return true;
    }
}
class FlagBooleans extends FlagBase {
    constructor(opts){
        super(formatFlagOptions(opts, []));
    }
    isBool() {
        return true;
    }
    add(v) {
        const val = parseBool(v);
        if (val === undefined || !this.isValid([
            val
        ])) {
            return false;
        }
        this.value_.push(val);
        return true;
    }
}
class Parser {
    constructor(root){
        this.root = root;
        const opts = root.opts;
        const prepare = opts.prepare;
        if (prepare) {
            const run = prepare(root.flags(), root);
            if (run) {
                opts.run = run;
            }
        }
    }
    parse(args, opts) {
        this.root.parse(args, opts);
    }
    root;
}
const root = new Command({
    use: "main.ts",
    short: "mariadb docker tools",
    async run () {
        const p = await Deno.run({
            cmd: [
                "docker-entrypoint.sh",
                "mariadbd"
            ]
        });
        console.log(await p.status());
    }
});
new Parser(root).parse(Deno.args);
