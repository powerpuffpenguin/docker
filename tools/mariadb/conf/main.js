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
function pad(v, len) {
    return v.toString().padStart(len, '0');
}
const defaultOutput = {
    log (opts, vals) {
        let prefix = '';
        if (opts.prefix != '') {
            prefix = `[${opts.prefix}]`;
        }
        if (opts.time) {
            const d = new Date();
            const str = `[${d.getFullYear()}/${pad(d.getMonth(), 2)}/${pad(d.getDay(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}]`;
            if (prefix == '') {
                prefix = str;
            } else {
                prefix = prefix + " " + str;
            }
        }
        if (prefix === '') {
            console.log(...vals);
        } else {
            console.log(prefix, ...vals);
        }
    }
};
class Logger {
    opts;
    constructor(opts){
        const { output =defaultOutput , enable =true , prefix ='' , time =true  } = opts ?? {};
        this.opts = {
            output: output,
            enable: enable,
            prefix: prefix,
            time: time
        };
    }
    log(...vals) {
        const opts = this.opts;
        if (opts.enable) {
            opts.output.log(opts, vals);
        }
    }
}
const defaultLogger = new Logger({
    prefix: 'easyts'
});
var LogLevel;
(function(LogLevel) {
    LogLevel[LogLevel["any"] = 0] = "any";
    LogLevel[LogLevel["trace"] = 1] = "trace";
    LogLevel[LogLevel["debug"] = 2] = "debug";
    LogLevel[LogLevel["info"] = 3] = "info";
    LogLevel[LogLevel["warn"] = 4] = "warn";
    LogLevel[LogLevel["error"] = 5] = "error";
    LogLevel[LogLevel["fail"] = 6] = "fail";
    LogLevel[LogLevel["none"] = 100] = "none";
})(LogLevel || (LogLevel = {}));
class Log {
    opts_;
    constructor(opts){
        this.opts_ = {
            level: opts?.level ?? LogLevel.none,
            trace: opts?.trace,
            debug: opts?.debug,
            info: opts?.info,
            warn: opts?.warn,
            error: opts?.error,
            fail: opts?.fail
        };
    }
    get level() {
        return this.opts_.level;
    }
    set level(lv) {
        if (Number.isSafeInteger(lv) && LogLevel.any <= lv && lv <= LogLevel.none) {
            this.opts_.level = lv;
            return;
        }
        throw Error(`unknow level ${lv}`);
    }
    getLogger(lv) {
        if (Number.isSafeInteger(lv)) {
            switch(lv){
                case LogLevel.trace:
                    return this.opts_.trace;
                case LogLevel.debug:
                    return this.opts_.debug;
                case LogLevel.info:
                    return this.opts_.info;
                case LogLevel.warn:
                    return this.opts_.warn;
                case LogLevel.error:
                    return this.opts_.error;
                case LogLevel.fail:
                    return this.opts_.fail;
            }
        }
        throw Error(`unknow level ${lv}`);
    }
    setLogger(lv, logger) {
        if (Number.isSafeInteger(lv)) {
            switch(lv){
                case LogLevel.trace:
                    this.opts_.trace = logger;
                    return;
                case LogLevel.debug:
                    this.opts_.debug = logger;
                    return;
                case LogLevel.info:
                    this.opts_.info = logger;
                    return;
                case LogLevel.warn:
                    this.opts_.warn = logger;
                    return;
                case LogLevel.error:
                    this.opts_.error = logger;
                    return;
                case LogLevel.fail:
                    this.opts_.fail = logger;
                    return;
            }
        }
        throw Error(`unknow level ${lv}`);
    }
    trace(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.trace) {
            opts.trace?.log(...vals);
        }
    }
    debug(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.debug) {
            opts.debug?.log(...vals);
        }
    }
    info(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.info) {
            opts.info?.log(...vals);
        }
    }
    warn(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.warn) {
            opts.warn?.log(...vals);
        }
    }
    error(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.error) {
            opts.error?.log(...vals);
        }
    }
    fail(...vals) {
        const opts = this.opts_;
        if (opts.level <= LogLevel.fail) {
            opts.fail?.log(...vals);
        }
    }
}
const log = new Log({
    level: LogLevel.debug,
    trace: new Logger({
        prefix: 'trace'
    }),
    debug: new Logger({
        prefix: 'debug'
    }),
    info: new Logger({
        prefix: 'info'
    }),
    warn: new Logger({
        prefix: 'warn'
    }),
    error: new Logger({
        prefix: 'error'
    }),
    fail: new Logger({
        prefix: 'fail'
    })
});
function throwType(val, typeName) {
    if (val.message !== undefined) {
        throw new TypeError(val.message);
    }
    if (val.name === undefined) {
        throw new TypeError(`expects ${typeName} type`);
    }
    throw new TypeError(`argument '${val.name}' expects ${typeName} type`);
}
function throwNumber(val, typeName, min) {
    if (val.message !== undefined) {
        throw new RangeError(val.message);
    }
    if (min) {
        const op = val.notMin ? '>' : ">=";
        if (val.name === undefined) {
            throw new RangeError(`expects ${typeName} value ${op} ${val.min}, but it = ${JSON.stringify(val.val)}`);
        }
        throw new RangeError(`argument '${val.name}' expects ${typeName} value ${op} ${val.min}, but it = ${JSON.stringify(val.val)}`);
    } else {
        const op1 = val.notMax ? '<' : "<=";
        if (val.name === undefined) {
            throw new RangeError(`expects ${typeName} value ${op1} ${val.max}, but it = ${JSON.stringify(val.val)}`);
        }
        throw new RangeError(`argument '${val.name}' expects ${typeName} value ${op1} ${val.max}, but it = ${JSON.stringify(val.val)}`);
    }
}
class Assert {
    static default = new Assert();
    enable = true;
    isNumber(...vals) {
        if (!this.enable) {
            return;
        }
        for (const val of vals){
            const v = val.val;
            if (Number.isFinite(v)) {
                if (Number.isFinite(val.min)) {
                    if (val.notMin ? v <= val.min : v < val.min) {
                        throwNumber(val, "number", true);
                    }
                }
                if (Number.isFinite(val.max)) {
                    if (val.notMax ? v >= val.max : v > val.max) {
                        throwNumber(val, "number", false);
                    }
                }
            } else {
                throwType(val, "number");
            }
        }
    }
    isInt(...vals) {
        if (!this.enable) {
            return;
        }
        for (const val of vals){
            const v = val.val;
            if (Number.isSafeInteger(v)) {
                if (Number.isFinite(val.min)) {
                    if (val.notMin ? v <= val.min : v < val.min) {
                        throwNumber(val, "int", true);
                    }
                }
                if (Number.isFinite(val.max)) {
                    if (val.notMax ? v >= val.max : v > val.max) {
                        throwNumber(val, "int", false);
                    }
                }
            } else {
                throwType(val, "int");
            }
        }
    }
    isUInt(...vals) {
        if (!this.enable) {
            return;
        }
        for (const val of vals){
            const v = val.val;
            if (Number.isSafeInteger(v) && v >= 0) {
                if (Number.isFinite(val.min)) {
                    if (val.notMin ? v <= val.min : v < val.min) {
                        throwNumber(val, "uint", true);
                    }
                }
                if (Number.isFinite(val.max)) {
                    if (val.notMax ? v >= val.max : v > val.max) {
                        throwNumber(val, "uint", false);
                    }
                }
            } else {
                throwType(val, "uint");
            }
        }
    }
    isAny(assert, ...vals) {
        if (!this.enable) {
            return;
        }
        for (const v of vals){
            assert(v);
        }
    }
}
const defaultAssert = Assert.default;
function compare(l, r, c) {
    if (c) {
        return c(l, r);
    }
    if (l === r) {
        return 0;
    }
    return l < r ? -1 : 1;
}
function notImplement(c, f) {
    return `class "${c}" not implemented function "${f}"`;
}
class ClassForEach {
    iterator(reverse) {
        throw new EvalError(notImplement(this.constructor.name, "iterator(reverse?: boolean): Iterator<T>"));
    }
    get length() {
        throw new EvalError(notImplement(this.constructor.name, "get length(): number"));
    }
    forEach(callback, reverse) {
        throw new EvalError(notImplement(this.constructor.name, "forEach(callback: ValueCallback<T>, reverse?: boolean): void"));
    }
    find(callback, reverse) {
        throw new EvalError(notImplement(this.constructor.name, "find(callback: ValidCallback<T>, reverse?: boolean): boolean"));
    }
    has(data, reverse, callback) {
        throw new EvalError(notImplement(this.constructor.name, "has(data: T, reverse?: boolean, callback?: CompareCallback<T>): boolean"));
    }
    map(callback, reverse) {
        throw new EvalError(notImplement(this.constructor.name, "map<TO>(callback: MapCallback<T, TO>, reverse?: boolean): Array<TO>"));
    }
    join(separator, callback, reverse) {
        throw new EvalError(notImplement(this.constructor.name, "join<TO>(separator?: string, callback?: MapCallback<T, TO>, reverse?: boolean): string"));
    }
}
function classForEach(c) {
    c.prototype.forEach = function(callback, reverse) {
        const self = this;
        if (self.length < 1) {
            return;
        }
        const vals = {
            [Symbol.iterator] () {
                return self.iterator(reverse);
            }
        };
        for (const v of vals){
            callback(v);
        }
    };
    c.prototype.find = function(callback, reverse) {
        const self = this;
        if (self.length < 1) {
            return false;
        }
        const vals = {
            [Symbol.iterator] () {
                return self.iterator(reverse);
            }
        };
        for (const v of vals){
            if (callback(v)) {
                return true;
            }
        }
        return false;
    };
    c.prototype.has = function(data, reverse, callback) {
        const self = this;
        if (self.length < 1) {
            return false;
        }
        const vals = {
            [Symbol.iterator] () {
                return self.iterator(reverse);
            }
        };
        for (const v of vals){
            if (compare(data, v, callback) == 0) {
                return true;
            }
        }
        return false;
    };
    c.prototype.map = function(callback, reverse) {
        const self = this;
        if (self.length < 1) {
            return [];
        }
        const vals = {
            [Symbol.iterator] () {
                return self.iterator(reverse);
            }
        };
        const result = new Array(self.length);
        let i = 0;
        for (const v of vals){
            result[i++] = callback(v);
        }
        return result;
    };
    c.prototype.join = function(separator, callback, reverse) {
        const c = callback ?? ((v)=>`${v}`);
        return this.map(c, reverse).join(separator);
    };
}
class Completer {
    promise_;
    resolve_;
    reject_;
    c_ = false;
    get isCompleted() {
        return this.c_;
    }
    constructor(){
        this.promise_ = new Promise((resolve, reject)=>{
            this.resolve_ = resolve;
            this.reject_ = reject;
        });
    }
    get promise() {
        return this.promise_;
    }
    resolve(value) {
        if (this.c_) {
            return;
        }
        this.c_ = true;
        if (this.resolve_) {
            this.resolve_(value);
        }
    }
    reject(reason) {
        if (this.c_) {
            return;
        }
        this.c_ = true;
        if (this.reject_) {
            this.reject_(reason);
        }
    }
}
class Asset {
    static make(callback) {
        return new _Asset(callback);
    }
    ok_ = false;
    asset_;
    done_;
    get asset() {
        if (this.ok_) {
            return this.asset_;
        }
        return (async ()=>{
            let done = this.done_;
            if (done) {
                return done.promise;
            }
            done = new Completer();
            try {
                const val = await this._load();
                this.ok_ = true;
                this.asset_ = val;
                done.resolve(val);
            } catch (e) {
                this.done_ = undefined;
                done.reject(e);
            }
            return done.promise;
        })();
    }
    _load() {
        throw new EvalError(notImplement(this.constructor.name, 'protected _load(): Promise<T>'));
    }
}
class _Asset extends Asset {
    constructor(callback){
        super();
        this.callback = callback;
    }
    _load() {
        const callback = this.callback;
        return callback();
    }
    callback;
}
class Exception extends Error {
    constructor(message, opts){
        super(message, opts);
        if (opts?.cause !== undefined) {
            this.cause = opts.cause;
        }
        const proto = new.target.prototype;
        if (Object.setPrototypeOf) {
            Object.setPrototypeOf(this, proto);
        } else {
            this.__proto__ = proto;
        }
        this.name = new.target.name;
    }
    ec;
    timeout;
    temporary;
    canceled;
}
class CodeException extends Exception {
    constructor(ec, message, opts){
        super(message, opts);
        this.ec = ec;
    }
}
class _NoResult {
    done = true;
    value = undefined;
}
const noResult = new _NoResult();
new Promise(()=>{});
var ErrorCode;
(function(ErrorCode) {
    ErrorCode[ErrorCode["Closed"] = 1] = "Closed";
    ErrorCode[ErrorCode["ReadCase"] = 2] = "ReadCase";
    ErrorCode[ErrorCode["WriteCase"] = 3] = "WriteCase";
})(ErrorCode || (ErrorCode = {}));
class ChannelException extends CodeException {
}
class Chan {
    static never_;
    static get never() {
        return Chan.never_ || (Chan.never_ = new Chan());
    }
    static closed_;
    static get closed() {
        if (!Chan.closed_) {
            Chan.closed_ = new Chan();
            Chan.closed_.close();
        }
        return Chan.closed_;
    }
    rw_;
    get rw() {
        return this.rw_;
    }
    constructor(buf = 0){
        this.rw_ = new RW(Math.floor(buf));
    }
    read() {
        const rw = this.rw_;
        const val = rw.tryRead();
        if (val === undefined) {
            return undefined;
        } else if (!val.done) {
            return val.value;
        }
        return new Promise((resolve)=>{
            rw.read((val)=>{
                resolve(val.done ? undefined : val.value);
            });
        });
    }
    readRaw() {
        const rw = this.rw_;
        const val = rw.tryRead();
        if (val === undefined) {
            return [
                undefined,
                false
            ];
        } else if (!val.done) {
            return [
                val.value,
                true
            ];
        }
        return new Promise((resolve)=>{
            rw.read((val)=>{
                resolve(val.done ? [
                    undefined,
                    false
                ] : [
                    val.value,
                    true
                ]);
            });
        });
    }
    tryRead() {
        const rw = this.rw_;
        const val = rw.tryRead();
        if (val === undefined) {
            return noResult;
        } else if (!val.done) {
            return val;
        }
        return undefined;
    }
    write(val, exception) {
        const rw = this.rw_;
        const result = rw.tryWrite(val);
        if (result === undefined) {
            if (exception) {
                throw new ChannelException(ErrorCode.Closed, 'channel already closed');
            }
            return false;
        } else if (result) {
            return true;
        }
        return new Promise((resolve, reject)=>{
            rw.write(resolve, exception ? reject : undefined, val);
        });
    }
    tryWrite(val, exception) {
        const rw = this.rw_;
        const result = rw.tryWrite(val);
        if (result === undefined) {
            if (exception) {
                throw new ChannelException(ErrorCode.Closed, 'channel already closed');
            }
            return false;
        } else if (result) {
            return true;
        }
        return false;
    }
    close() {
        return this.rw_.close();
    }
    wait() {
        return this.rw.wait();
    }
    readCase() {
        return ReadCase.make(this);
    }
    writeCase(val, exception) {
        return WriteCase.make(this, val, exception);
    }
    get isClosed() {
        return this.rw_.isClosed;
    }
    get length() {
        return this.rw.length;
    }
    get capacity() {
        return this.rw.capacity;
    }
    async *[Symbol.asyncIterator]() {
        while(true){
            const [val, ok] = await this.readRaw();
            if (!ok) {
                break;
            }
            yield val;
        }
    }
}
class Ring {
    offset_;
    size_;
    constructor(arrs){
        this.arrs = arrs;
        this.offset_ = 0;
        this.size_ = 0;
    }
    get length() {
        return this.size_;
    }
    get capacity() {
        return this.arrs.length;
    }
    push(val) {
        const arrs = this.arrs;
        const size = this.size_;
        if (size == arrs.length) {
            return false;
        }
        arrs[(this.offset_ + size) % arrs.length] = val;
        this.size_++;
        return true;
    }
    pop() {
        const size = this.size_;
        if (size == 0) {
            return noResult;
        }
        const val = this.arrs[this.offset_++];
        if (this.offset_ == this.arrs.length) {
            this.offset_ = 0;
        }
        this.size_--;
        return {
            value: val
        };
    }
    arrs;
}
class RW {
    list;
    constructor(buf){
        if (buf > 0) {
            this.list = new Ring(new Array(buf));
        }
    }
    r_ = new Reader();
    w_ = new Writer();
    tryRead() {
        const list = this.list;
        if (list) {
            const result = list.pop();
            if (!result.done) {
                return result;
            }
        }
        if (this.isClosed) {
            return;
        }
        const w = this.w_;
        if (w.isEmpty) {
            return noResult;
        }
        return {
            value: w.invoke()
        };
    }
    read(callback) {
        return this.r_.connect(callback);
    }
    tryWrite(val) {
        if (this.isClosed) {
            return;
        }
        const r = this.r_;
        if (r.isEmpty) {
            return this.list?.push(val) ?? false;
        }
        r.invoke({
            value: val
        });
        return true;
    }
    write(callback, reject, val) {
        return this.w_.connect(callback, reject, val);
    }
    close() {
        if (this.isClosed) {
            return false;
        }
        this.isClosed = true;
        this.w_.close();
        this.r_.close();
        const closed = this.closed_;
        if (closed) {
            this.closed_ = undefined;
            closed.resolve();
        }
        return true;
    }
    wait() {
        if (this.isClosed) {
            return;
        }
        let closed = this.closed_;
        if (closed) {
            return closed.promise;
        }
        closed = new Completer();
        this.closed_ = closed;
        return closed.promise;
    }
    closed_;
    isClosed = false;
    get length() {
        return this.list?.length ?? 0;
    }
    get capacity() {
        return this.list?.capacity ?? 0;
    }
}
class Reader {
    closed_ = false;
    vals = new Array();
    get isEmpty() {
        return this.vals.length == 0;
    }
    invoke(val) {
        const vals = this.vals;
        switch(vals.length){
            case 0:
                throw new ChannelException(100, 'reader empty');
            case 1:
                vals.pop().invoke(val);
                return;
        }
        const last = vals.length - 1;
        const i = Math.floor(Math.random() * vals.length);
        if (i != last) {
            [vals[i], vals[last]] = [
                vals[last],
                vals[i]
            ];
        }
        vals.pop().invoke(val);
    }
    close() {
        if (this.closed_) {
            return;
        }
        this.closed_ = true;
        const vals = this.vals;
        if (vals.length != 0) {
            for (const val of vals){
                val.invoke(noResult);
            }
            vals.splice(0);
        }
    }
    connect(callback) {
        const val = new ReadValue(this, callback);
        this.vals.push(val);
        return val;
    }
    disconet(val) {
        const vals = this.vals;
        for(let i = 0; i < vals.length; i++){
            if (vals[i] == val) {
                vals.splice(i, 1);
                break;
            }
        }
    }
}
class ReadValue {
    constructor(p, callback){
        this.p = p;
        this.callback = callback;
    }
    invoke(val) {
        this.callback(val);
    }
    disconet() {
        this.p.disconet(this);
    }
    p;
    callback;
}
class Writer {
    closed_ = false;
    vals = new Array();
    get isEmpty() {
        return this.vals.length == 0;
    }
    invoke() {
        const vals = this.vals;
        switch(vals.length){
            case 0:
                throw new ChannelException(101, "writer empty");
            case 1:
                const p = vals.pop();
                p.invoke();
                return p.value;
        }
        const last = vals.length - 1;
        const i = Math.floor(Math.random() * vals.length);
        if (i != last) {
            [vals[i], vals[last]] = [
                vals[last],
                vals[i]
            ];
        }
        const p1 = vals.pop();
        p1.invoke();
        return p1.value;
    }
    close() {
        if (this.closed_) {
            return;
        }
        this.closed_ = true;
        const vals = this.vals;
        if (vals.length != 0) {
            for (const val of vals){
                val.error();
            }
            vals.splice(0);
        }
    }
    connect(callback, reject, val) {
        const result = new WirteValue(this, callback, reject, val);
        this.vals.push(result);
        return result;
    }
    disconet(val) {
        const vals = this.vals;
        for(let i = 0; i < vals.length; i++){
            if (vals[i] == val) {
                vals.splice(i, 1);
                break;
            }
        }
    }
}
class WirteValue {
    constructor(p, callback, reject, value){
        this.p = p;
        this.callback = callback;
        this.reject = reject;
        this.value = value;
    }
    invoke() {
        this.callback(true);
    }
    error() {
        const reject = this.reject;
        if (reject) {
            try {
                reject(new ChannelException(ErrorCode.Closed, 'channel already closed'));
            } catch (_) {}
        } else {
            this.callback(false);
        }
    }
    disconet() {
        this.p.disconet(this);
    }
    p;
    callback;
    reject;
    value;
}
class ReadCase {
    static make(ch) {
        return new ReadCase(ch);
    }
    constructor(ch){
        this.ch = ch;
    }
    read_;
    read() {
        const val = this.read_;
        if (val === undefined) {
            throw new ChannelException(ErrorCode.ReadCase, 'read case not ready');
        }
        return val.done ? undefined : val.value;
    }
    readRaw() {
        const val = this.read_;
        if (val === undefined) {
            throw new ChannelException(ErrorCode.ReadCase, 'read case not ready');
        }
        return val.done ? [
            undefined,
            false
        ] : [
            val.value,
            true
        ];
    }
    reset() {
        this.read_ = undefined;
    }
    get isReady() {
        return this.read_ !== undefined;
    }
    tryInvoke() {
        const val = this.ch.tryRead();
        if (val === undefined) {
            return false;
        }
        this.read_ = val;
        return true;
    }
    do(resolve, reject) {
        const rw = this.ch.rw;
        return rw.read((val)=>{
            this.read_ = val;
            resolve(this);
        });
    }
    invoke() {
        const rw = this.ch.rw;
        return new Promise((resolve)=>{
            rw.read((val)=>{
                this.read_ = val;
                resolve();
            });
        });
    }
    ch;
}
class WriteCase {
    static make(ch, val, exception) {
        return new WriteCase(ch, val, exception);
    }
    constructor(ch, val, exception){
        this.ch = ch;
        this.val = val;
        this.exception = exception;
    }
    reset() {
        this.write_ = undefined;
    }
    tryInvoke() {
        const ch = this.ch;
        const val = ch.tryWrite(this.val, false);
        if (val) {
            this.write_ = true;
            return true;
        } else if (ch.isClosed) {
            this.write_ = false;
            if (this.exception) {
                throw new ChannelException(ErrorCode.Closed, 'channel already closed');
            }
            return true;
        }
        return false;
    }
    do(resolve, reject) {
        const rw = this.ch.rw;
        return rw.write((ok)=>{
            if (ok) {
                this.write_ = true;
            } else {
                this.write_ = false;
                if (this.exception) {
                    reject(this);
                    return;
                }
            }
            resolve(this);
        }, undefined, this.val);
    }
    invoke() {
        const rw = this.ch.rw;
        return new Promise((resolve, reject)=>{
            rw.write((ok)=>{
                if (ok) {
                    this.write_ = true;
                } else {
                    this.write_ = false;
                    if (this.exception) {
                        reject(new ChannelException(ErrorCode.Closed, 'channel already closed'));
                        return;
                    }
                }
                resolve();
            }, undefined, this.val);
        });
    }
    write_;
    write() {
        const val = this.write_;
        if (val === undefined) {
            throw new ChannelException(ErrorCode.WriteCase, 'write case not ready');
        }
        return val;
    }
    get isReady() {
        return this.write_ !== undefined;
    }
    ch;
    val;
    exception;
}
class Defer {
    fs_ = new Array();
    constructor(){}
    static sync(f) {
        const d = new Defer();
        let result;
        try {
            result = f(d);
        } catch (e) {
            d._syncDone();
            throw e;
        }
        d._syncDone();
        return result;
    }
    _syncDone() {
        const fs = this.fs_;
        for(let i = fs.length - 1; i >= 0; i--){
            const f = fs[i];
            if (f.ok) {
                try {
                    f.f(...f.args);
                } catch (e) {
                    defaultLogger.log('defer.sync', e);
                }
            }
        }
    }
    static async async(f) {
        const d = new Defer();
        let result;
        try {
            result = await f(d);
        } catch (e) {
            await d._asyncDone();
            throw e;
        }
        await d._asyncDone();
        return result;
    }
    async _asyncDone() {
        const fs = this.fs_;
        for(let i = fs.length - 1; i >= 0; i--){
            const f = fs[i];
            if (f.ok) {
                try {
                    await f.f(...f.args);
                } catch (e) {
                    defaultLogger.log('defer.async', e);
                }
            }
        }
    }
    defer(f, ...args) {
        const c = new Func(f, args);
        this.fs_.push(c);
        return c;
    }
}
class Func {
    ok;
    constructor(f, args){
        this.f = f;
        this.args = args;
        this.ok = true;
    }
    cancel() {
        this.ok = false;
    }
    f;
    args;
}
BigInt("-9223372036854775808");
BigInt("9223372036854775807");
BigInt("18446744073709551615");
class Slice extends ClassForEach {
    static attach(a, start, end) {
        const len = a.length;
        start = start ?? 0;
        end = end ?? len;
        defaultAssert.isUInt({
            name: "start",
            val: start,
            max: len
        }, {
            name: "end",
            val: end,
            max: len,
            min: start
        });
        return new Slice(a, start, end);
    }
    static make(length, capacity) {
        capacity = capacity ?? length;
        defaultAssert.isUInt({
            name: 'length',
            val: length
        }, {
            name: 'capacity',
            val: capacity,
            min: length
        });
        const a = new Array(capacity);
        return new Slice(a, 0, length);
    }
    constructor(array, start, end){
        super();
        this.array = array;
        this.start = start;
        this.end = end;
        classForEach(Slice);
    }
    get(i) {
        defaultAssert.isUInt({
            name: "i",
            val: i,
            max: this.length,
            notMax: true
        });
        return this.array[this.start + i];
    }
    set(i, val) {
        defaultAssert.isUInt({
            name: "i",
            val: i,
            max: this.length,
            notMax: true
        });
        this.array[this.start + i] = val;
    }
    get length() {
        return this.end - this.start;
    }
    get capacity() {
        return this.array.length - this.start;
    }
    slice(start, end) {
        const max = this.capacity;
        start = start ?? 0;
        end = end ?? this.length;
        defaultAssert.isUInt({
            name: "start",
            val: start,
            max: max
        }, {
            name: "end",
            val: end,
            max: max,
            min: start
        });
        const o = this.start;
        return new Slice(this.array, o + start, o + end);
    }
    copy(src) {
        let n = 0;
        const end = this.end;
        let o = this.start;
        const a = this.array;
        if (end > o) {
            for (const v of src){
                a[o++] = v;
                if (o == end) {
                    break;
                }
            }
        }
        return n;
    }
    append(...vals) {
        const add = vals.length;
        if (add == 0) {
            return new Slice(this.array, this.start, this.end);
        }
        const cap = this.capacity;
        const grow = this.length + add;
        if (grow < cap) {
            const a = this.array;
            let i = this.end;
            for (const v of vals){
                a[i++] = v;
            }
            return new Slice(a, this.start, i);
        }
        const a1 = Array.from(this);
        a1.push(...vals);
        return new Slice(a1, 0, a1.length);
    }
    iterator(reverse) {
        const a = this.array;
        const start = this.start;
        const end = this.end;
        if (reverse) {
            let i = end - 1;
            return {
                next () {
                    if (i >= start) {
                        return {
                            value: a[i--]
                        };
                    }
                    return noResult;
                }
            };
        } else {
            let i1 = start;
            return {
                next () {
                    if (i1 < end) {
                        return {
                            value: a[i1++]
                        };
                    }
                    return noResult;
                }
            };
        }
    }
    [Symbol.iterator]() {
        return this.iterator();
    }
    get reverse() {
        const i = this.iterator(true);
        return {
            [Symbol.iterator] () {
                return i;
            }
        };
    }
    array;
    start;
    end;
}
class StringBuilder {
    a = new Array();
    constructor(){}
    write(...vals) {
        this.a.push(...vals);
    }
    undo() {
        return this.a.pop();
    }
    toString() {
        return this.a.join('');
    }
}
class Bytes extends ClassForEach {
    static attach(b, start, end) {
        const len = b.byteLength;
        start = start ?? 0;
        end = end ?? len;
        defaultAssert.isUInt({
            name: "start",
            val: start,
            max: len
        }, {
            name: "end",
            val: end,
            max: len,
            min: start
        });
        return new Bytes(b, start, end);
    }
    static make(length, capacity) {
        capacity = capacity ?? length;
        defaultAssert.isUInt({
            name: 'length',
            val: length
        }, {
            name: 'capacity',
            val: capacity,
            min: length
        });
        const b = new ArrayBuffer(capacity);
        return new Bytes(b, 0, length);
    }
    static fromString(str) {
        const buffer = new TextEncoder().encode(str);
        return new Bytes(buffer.buffer, 0, buffer.byteLength);
    }
    constructor(buffer, start, end){
        super();
        this.buffer = buffer;
        this.start = start;
        this.end = end;
        classForEach(Bytes);
    }
    get length() {
        return this.end - this.start;
    }
    get capacity() {
        return this.buffer.byteLength - this.start;
    }
    dateView() {
        return new DataView(this.buffer, this.start, this.length);
    }
    slice(start, end) {
        const max = this.capacity;
        start = start ?? 0;
        end = end ?? this.length;
        defaultAssert.isUInt({
            name: "start",
            val: start,
            max: max
        }, {
            name: "end",
            val: end,
            max: max,
            min: start
        });
        const o = this.start;
        return new Bytes(this.buffer, o + start, o + end);
    }
    copy(src) {
        const n = this.length < src.length ? this.length : src.length;
        if (n != 0) {
            const d = this.dateView();
            const s = src.dateView();
            for(let i = 0; i < n; i++){
                d.setUint8(i, s.getUint8(i));
            }
        }
        return n;
    }
    iterator(reverse) {
        const a = this.dateView();
        let start = 0;
        let end = a.byteLength;
        if (reverse) {
            let i = end - 1;
            return {
                next () {
                    if (i >= start) {
                        return {
                            value: a.getUint8(i--)
                        };
                    }
                    return noResult;
                }
            };
        } else {
            let i1 = start;
            return {
                next () {
                    if (i1 < end) {
                        return {
                            value: a.getUint8(i1++)
                        };
                    }
                    return noResult;
                }
            };
        }
    }
    [Symbol.iterator]() {
        return this.iterator();
    }
    get reverse() {
        const i = this.iterator(true);
        return {
            [Symbol.iterator] () {
                return i;
            }
        };
    }
    append(...vals) {
        const add = vals.length;
        if (add == 0) {
            return new Bytes(this.buffer, this.start, this.end);
        }
        return this._append(new bytesNumber(vals));
    }
    appendBytes(...vals) {
        let dst = new Bytes(this.buffer, this.start, this.end);
        for (const v of vals){
            dst = dst._append(new bytesView(v.dateView(), v.length));
        }
        return dst;
    }
    appendArrayBuffer(...vals) {
        let dst = new Bytes(this.buffer, this.start, this.end);
        for (const v of vals){
            dst = dst._append(new bytesView(new DataView(v), v.byteLength));
        }
        return dst;
    }
    appendString(str) {
        if (str.length == 0) {
            return new Bytes(this.buffer, this.start, this.end);
        }
        return this.appendArrayBuffer(new TextEncoder().encode(str).buffer);
    }
    _append(b) {
        const add = b.length();
        if (add == 0) {
            return new Bytes(this.buffer, this.start, this.end);
        }
        let cap = this.capacity;
        const length = this.length;
        const grow = length + add;
        if (grow < cap) {
            const start = this.end;
            const dst = new Bytes(this.buffer, this.start, start + add);
            const view = dst.dateView();
            for(let i = 0; i < add; i++){
                view.setUint8(start + i, b.get(i));
            }
            return dst;
        }
        cap = length * 2;
        if (cap < grow) {
            cap += grow;
        }
        const src = this.dateView();
        const buffer = new ArrayBuffer(cap);
        const view1 = new DataView(buffer);
        const dst1 = new Bytes(buffer, 0, grow);
        for(let i1 = 0; i1 < length; i1++){
            view1.setUint8(i1, src.getUint8(i1));
        }
        const start1 = this.end;
        for(let i2 = 0; i2 < add; i2++){
            view1.setUint8(start1 + i2, b.get(i2));
        }
        return dst1;
    }
    toString() {
        return new TextDecoder().decode(this.dateView());
    }
    buffer;
    start;
    end;
}
class bytesView {
    constructor(view, len){
        this.view = view;
        this.len = len;
    }
    length() {
        return this.len;
    }
    get(i) {
        return this.view.getUint8(i);
    }
    view;
    len;
}
class bytesNumber {
    constructor(buffer){
        this.buffer = buffer;
    }
    length() {
        return this.buffer.length;
    }
    get(i) {
        return this.buffer[i];
    }
    buffer;
}
const Tag = `_tag_`;
const TagOK = `${Tag}ok`;
const TagCompleted = `${Tag}completed`;
function dateNow() {
    const d = new Date();
    return `${d.getFullYear().toString()}-${d.getMonth().toString().padStart(2, "0")}-${d.getDay().toString().padStart(2, "0")}`;
}
function joinPath(dir, name) {
    if (dir.endsWith("/")) {
        return `${dir}${name}`;
    } else if (Deno.build.os == "windows") {
        if (dir.endsWith("/") || dir.endsWith("\\")) {
            return `${dir}${name}`;
        }
    }
    return `${dir}/${name}`;
}
async function fileExists(filepath) {
    try {
        const stat = await Deno.stat(filepath);
        return stat.isFile;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}
function getID(name) {
    const str = name.substring(0, name.indexOf("."));
    let id = 0;
    if (str != "0") {
        id = parseInt(str);
        if (!Number.isSafeInteger(id) || id.toString() != str) {
            return -1;
        }
    }
    return id;
}
class Dir {
    static async make(dir, name) {
        const id = getID(name);
        if (id < 0) {
            return;
        }
        const keys = new Map();
        const history = new Array();
        const path = joinPath(dir, name);
        for await (const item of Deno.readDir(path)){
            if (!item.isDirectory) {
                continue;
            }
            const name1 = item.name;
            if (!match.test(name1)) {
                continue;
            }
            const id1 = getID(name1);
            if (id1 < 0) {
                continue;
            }
            const filepath = joinPath(path, name1);
            if (!await fileExists(joinPath(filepath, TagOK))) {
                log.debug("remove invalid backup: ", filepath);
                await Deno.remove(filepath, {
                    recursive: true
                });
                continue;
            }
            const found = keys.get(id1);
            if (found) {
                throw new Error(`backup id aready exists: ${path} [${found}, ${name1}]`);
            }
            keys.set(id1, name1);
            history.push({
                id: id1,
                name: name1
            });
        }
        if (history.length == 0) {
            log.debug("remove empty backup dir:", path);
            await Deno.remove(path, {
                recursive: true
            });
            return;
        }
        history.sort((l, r)=>l.id - r.id);
        for(let i = 0; i < history.length; i++){
            if (i != history[i].id) {
                throw new Error(`backup id(${i}) is not consecutive, ${path}`);
            }
        }
        const completed = await fileExists(joinPath(path, TagCompleted));
        return new Dir(id, name, path, history, completed);
    }
    constructor(id, name, path, history, completed){
        this.id = id;
        this.name = name;
        this.path = path;
        this.history = history;
        this.completed = completed;
    }
    async backup() {
        if (this.completed) {
            throw new Error(`dir already completed: ${this.path}`);
        }
        const history = this.history;
        const last = history.length == 0 ? undefined : history[history.length - 1];
        const id = last ? last.id + 1 : 0;
        const name = `${id}.${dateNow()}`;
        const path = joinPath(this.path, name);
        await Deno.mkdir(path, {
            recursive: true,
            mode: 0o775
        });
        const cmds = [
            "mariabackup",
            "--backup",
            "--target-dir",
            path,
            "--user=root",
            "--password",
            Deno.env.get("MYSQL_ROOT_PASSWORD") ?? ""
        ];
        if (last) {
            cmds.push("--incremental-basedir", joinPath(this.path, last.name));
        }
        log.debug("run", cmds);
        const s = await Deno.run({
            cmd: cmds
        }).status();
        if (!s.success) {
            throw new Error(`mariabackup errpr: ${s.code}`);
        }
        if (last) {
            const changed = await this._checkChanged(joinPath(path, "xtrabackup_info"));
            if (!changed) {
                log.info("backup not changed, remove it", path);
            }
            await Deno.remove(path, {
                recursive: true
            });
            return;
        }
        const f = await Deno.open(joinPath(path, TagOK), {
            mode: 0o664,
            create: true,
            write: true
        });
        f.close();
        history.push({
            id: id,
            name: name
        });
        console.log(path);
    }
    async _checkChanged(filename) {
        const text = await Deno.readTextFile(filename);
        const from = this._getBigInt(text, "innodb_from_lsn");
        const to = this._getBigInt(text, "innodb_to_lsn");
        return from != to;
    }
    _getBigInt(text, key) {
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
    id;
    name;
    path;
    history;
    completed;
}
const match = /^[0-9]+\.[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
class Target {
    static async make(path) {
        if (path == "") {
            path = ".";
        }
        const keys = new Map();
        const dirs = new Array();
        let last;
        for await (const item of Deno.readDir(path)){
            if (!item.isDirectory) {
                continue;
            }
            const name = item.name;
            if (!match.test(name)) {
                continue;
            }
            const d = await Dir.make(path, name);
            if (!d) {
                continue;
            }
            const found = keys.get(d.id);
            if (found) {
                throw new Error(`dir id already exists: [${found.name}, ${d.name}]`);
            }
            keys.set(d.id, d);
            if (!last || last.id < d.id) {
                last = d;
            }
            dirs.push(d);
        }
        dirs.sort((l, r)=>l.id - r.id);
        return new Target(path, dirs);
    }
    constructor(path, dirs){
        this.path = path;
        this.dirs = dirs;
    }
    backup() {
        const dirs = this.dirs;
        let last = dirs.length == 0 ? undefined : dirs[dirs.length - 1];
        if (!last || last.completed) {
            const id = last ? last.id + 1 : 0;
            const name = `${id}.${dateNow()}`;
            last = new Dir(id, name, joinPath(this.path, name), [], false);
            dirs.push(last);
        }
        return last.backup();
    }
    path;
    dirs;
}
class Backup {
    constructor(opts){
        this.opts = opts;
        this.target_ = Asset.make(()=>Target.make(opts.output));
    }
    target_;
    async serve() {
        const opts = this.opts;
        log.info("run backup to:", opts.output);
        if (opts.test) {
            return;
        }
        const target = await this.target_.asset;
        console.log(target);
        await target.backup();
    }
    opts;
}
function minitz(y, m, d, h, i, s, tz, throwOnInvalid) {
    return minitz.fromTZ(minitz.tp(y, m, d, h, i, s, tz), throwOnInvalid);
}
minitz.fromTZISO = (localTimeStr, tz, throwOnInvalid)=>{
    return minitz.fromTZ(parseISOLocal(localTimeStr, tz), throwOnInvalid);
};
minitz.fromTZ = function(tp, throwOnInvalid) {
    const inDate = new Date(Date.UTC(tp.y, tp.m - 1, tp.d, tp.h, tp.i, tp.s)), offset = getTimezoneOffset(tp.tz, inDate), dateGuess = new Date(inDate.getTime() - offset), dateOffsGuess = getTimezoneOffset(tp.tz, dateGuess);
    if (dateOffsGuess - offset === 0) {
        return dateGuess;
    } else {
        const dateGuess2 = new Date(inDate.getTime() - dateOffsGuess), dateOffsGuess2 = getTimezoneOffset(tp.tz, dateGuess2);
        if (dateOffsGuess2 - dateOffsGuess === 0) {
            return dateGuess2;
        } else if (!throwOnInvalid && dateOffsGuess2 - dateOffsGuess > 0) {
            return dateGuess2;
        } else if (!throwOnInvalid) {
            return dateGuess;
        } else {
            throw new Error("Invalid date passed to fromTZ()");
        }
    }
};
minitz.toTZ = function(d, tzStr) {
    const td = new Date(d.toLocaleString("sv-SE", {
        timeZone: tzStr
    }));
    return {
        y: td.getFullYear(),
        m: td.getMonth() + 1,
        d: td.getDate(),
        h: td.getHours(),
        i: td.getMinutes(),
        s: td.getSeconds(),
        tz: tzStr
    };
};
minitz.tp = (y, m, d, h, i, s, tz)=>{
    return {
        y,
        m,
        d,
        h,
        i,
        s,
        tz: tz
    };
};
function getTimezoneOffset(timeZone, date = new Date()) {
    const tz = date.toLocaleString("en", {
        timeZone,
        timeStyle: "long"
    }).split(" ").slice(-1)[0];
    const dateString = date.toLocaleString("en-US").replace(/[\u202f]/, " ");
    return Date.parse(`${dateString} GMT`) - Date.parse(`${dateString} ${tz}`);
}
function parseISOLocal(dtStr, tz) {
    const pd = new Date(Date.parse(dtStr));
    if (isNaN(pd)) {
        throw new Error("minitz: Invalid ISO8601 passed to parser.");
    }
    const stringEnd = dtStr.substring(9);
    if (dtStr.includes("Z") || stringEnd.includes("-") || stringEnd.includes("+")) {
        return minitz.tp(pd.getUTCFullYear(), pd.getUTCMonth() + 1, pd.getUTCDate(), pd.getUTCHours(), pd.getUTCMinutes(), pd.getUTCSeconds(), "Etc/UTC");
    } else {
        return minitz.tp(pd.getFullYear(), pd.getMonth() + 1, pd.getDate(), pd.getHours(), pd.getMinutes(), pd.getSeconds(), tz);
    }
}
minitz.minitz = minitz;
const DaysOfMonth = [
    31,
    28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
];
const RecursionSteps = [
    [
        "month",
        "year",
        0
    ],
    [
        "day",
        "month",
        -1
    ],
    [
        "hour",
        "day",
        0
    ],
    [
        "minute",
        "hour",
        0
    ],
    [
        "second",
        "minute",
        0
    ]
];
function CronDate(d, tz) {
    this.tz = tz;
    if (d && d instanceof Date) {
        if (!isNaN(d)) {
            this.fromDate(d);
        } else {
            throw new TypeError("CronDate: Invalid date passed to CronDate constructor");
        }
    } else if (d === void 0) {
        this.fromDate(new Date());
    } else if (d && typeof d === "string") {
        this.fromString(d);
    } else if (d instanceof CronDate) {
        this.fromCronDate(d);
    } else {
        throw new TypeError("CronDate: Invalid type (" + typeof d + ") passed to CronDate constructor");
    }
}
CronDate.prototype.fromDate = function(inDate) {
    if (this.tz) {
        const d = minitz.toTZ(inDate, this.tz);
        this.ms = inDate.getMilliseconds();
        this.second = d.s;
        this.minute = d.i;
        this.hour = d.h;
        this.day = d.d;
        this.month = d.m - 1;
        this.year = d.y;
    } else {
        this.ms = inDate.getMilliseconds();
        this.second = inDate.getSeconds();
        this.minute = inDate.getMinutes();
        this.hour = inDate.getHours();
        this.day = inDate.getDate();
        this.month = inDate.getMonth();
        this.year = inDate.getFullYear();
    }
};
CronDate.prototype.fromCronDate = function(d) {
    this.tz = d.tz;
    this.year = d.year;
    this.month = d.month;
    this.day = d.day;
    this.hour = d.hour;
    this.minute = d.minute;
    this.second = d.second;
    this.ms = d.ms;
};
CronDate.prototype.apply = function() {
    if (this.month > 11 || this.day > DaysOfMonth[this.month] || this.hour > 59 || this.minute > 59 || this.second > 59) {
        const d = new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms));
        this.ms = d.getUTCMilliseconds();
        this.second = d.getUTCSeconds();
        this.minute = d.getUTCMinutes();
        this.hour = d.getUTCHours();
        this.day = d.getUTCDate();
        this.month = d.getUTCMonth();
        this.year = d.getUTCFullYear();
        return true;
    } else {
        return false;
    }
};
CronDate.prototype.fromString = function(str) {
    return this.fromDate(minitz.fromTZISO(str, this.tz));
};
CronDate.prototype.findNext = function(options, target, pattern, offset) {
    const originalTarget = this[target];
    let lastDayOfMonth;
    if (pattern.lastDayOfMonth) {
        if (this.month !== 1) {
            lastDayOfMonth = DaysOfMonth[this.month];
        } else {
            lastDayOfMonth = new Date(Date.UTC(this.year, this.month + 1, 0, 0, 0, 0, 0)).getUTCDate();
        }
    }
    const fDomWeekDay = !pattern.starDOW && target == "day" ? new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay() : undefined;
    for(let i = this[target] + offset; i < pattern[target].length; i++){
        let match = pattern[target][i];
        if (target === "day" && pattern.lastDayOfMonth && i - offset == lastDayOfMonth) {
            match = true;
        }
        if (target === "day" && !pattern.starDOW) {
            const dowMatch = pattern.dow[(fDomWeekDay + (i - offset - 1)) % 7];
            if (options.legacyMode && !pattern.starDOM) {
                match = match || dowMatch;
            } else {
                match = match && dowMatch;
            }
        }
        if (match) {
            this[target] = i - offset;
            return originalTarget !== this[target] ? 2 : 1;
        }
    }
    return 3;
};
CronDate.prototype.recurse = function(pattern, options, doing) {
    const res = this.findNext(options, RecursionSteps[doing][0], pattern, RecursionSteps[doing][2]);
    if (res > 1) {
        let resetLevel = doing + 1;
        while(resetLevel < RecursionSteps.length){
            this[RecursionSteps[resetLevel][0]] = -RecursionSteps[resetLevel][2];
            resetLevel++;
        }
        if (res === 3) {
            this[RecursionSteps[doing][1]]++;
            this[RecursionSteps[doing][0]] = -RecursionSteps[doing][2];
            this.apply();
            return this.recurse(pattern, options, 0);
        } else if (this.apply()) {
            return this.recurse(pattern, options, doing - 1);
        }
    }
    doing += 1;
    if (doing >= RecursionSteps.length) {
        return this;
    } else if (this.year >= 3000) {
        return null;
    } else {
        return this.recurse(pattern, options, doing);
    }
};
CronDate.prototype.increment = function(pattern, options, hasPreviousRun) {
    if (options.interval > 1 && hasPreviousRun) {
        this.second += options.interval;
    } else {
        this.second += 1;
    }
    this.ms = 0;
    this.apply();
    return this.recurse(pattern, options, 0);
};
CronDate.prototype.getDate = function(internal) {
    if (internal || !this.tz) {
        return new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms);
    } else {
        return minitz(this.year, this.month + 1, this.day, this.hour, this.minute, this.second, this.tz);
    }
};
CronDate.prototype.getTime = function() {
    return this.getDate().getTime();
};
function CronPattern(pattern, timezone) {
    this.pattern = pattern;
    this.timezone = timezone;
    this.second = Array(60).fill(0);
    this.minute = Array(60).fill(0);
    this.hour = Array(24).fill(0);
    this.day = Array(31).fill(0);
    this.month = Array(12).fill(0);
    this.dow = Array(8).fill(0);
    this.lastDayOfMonth = false;
    this.starDOM = false;
    this.starDOW = false;
    this.parse();
}
CronPattern.prototype.parse = function() {
    if (!(typeof this.pattern === "string" || this.pattern.constructor === String)) {
        throw new TypeError("CronPattern: Pattern has to be of type string.");
    }
    if (this.pattern.indexOf("@") >= 0) this.pattern = this.handleNicknames(this.pattern).trim();
    const parts = this.pattern.replace(/\s+/g, " ").split(" ");
    if (parts.length < 5 || parts.length > 6) {
        throw new TypeError("CronPattern: invalid configuration format ('" + this.pattern + "'), exacly five or six space separated parts required.");
    }
    if (parts.length === 5) {
        parts.unshift("0");
    }
    if (parts[3].indexOf("L") >= 0) {
        parts[3] = parts[3].replace("L", "");
        this.lastDayOfMonth = true;
    }
    if (parts[3] == "*") {
        this.starDOM = true;
    }
    if (parts[4].length >= 3) parts[4] = this.replaceAlphaMonths(parts[4]);
    if (parts[5].length >= 3) parts[5] = this.replaceAlphaDays(parts[5]);
    if (parts[5] == "*") {
        this.starDOW = true;
    }
    if (this.pattern.indexOf("?") >= 0) {
        const initDate = new CronDate(new Date(), this.timezone).getDate(true);
        parts[0] = parts[0].replace("?", initDate.getSeconds());
        parts[1] = parts[1].replace("?", initDate.getMinutes());
        parts[2] = parts[2].replace("?", initDate.getHours());
        if (!this.starDOM) parts[3] = parts[3].replace("?", initDate.getDate());
        parts[4] = parts[4].replace("?", initDate.getMonth() + 1);
        if (!this.starDOW) parts[5] = parts[5].replace("?", initDate.getDay());
    }
    this.throwAtIllegalCharacters(parts);
    this.partToArray("second", parts[0], 0);
    this.partToArray("minute", parts[1], 0);
    this.partToArray("hour", parts[2], 0);
    this.partToArray("day", parts[3], -1);
    this.partToArray("month", parts[4], -1);
    this.partToArray("dow", parts[5], 0);
    if (this.dow[7]) {
        this.dow[0] = 1;
    }
};
CronPattern.prototype.partToArray = function(type, conf, valueIndexOffset) {
    const arr = this[type];
    if (conf === "*") return arr.fill(1);
    const split = conf.split(",");
    if (split.length > 1) {
        for(let i = 0; i < split.length; i++){
            this.partToArray(type, split[i], valueIndexOffset);
        }
    } else if (conf.indexOf("-") !== -1 && conf.indexOf("/") !== -1) {
        this.handleRangeWithStepping(conf, type, valueIndexOffset);
    } else if (conf.indexOf("-") !== -1) {
        this.handleRange(conf, type, valueIndexOffset);
    } else if (conf.indexOf("/") !== -1) {
        this.handleStepping(conf, type, valueIndexOffset);
    } else if (conf !== "") {
        this.handleNumber(conf, type, valueIndexOffset);
    }
};
CronPattern.prototype.throwAtIllegalCharacters = function(parts) {
    const reValidCron = /[^/*0-9,-]+/;
    for(let i = 0; i < parts.length; i++){
        if (reValidCron.test(parts[i])) {
            throw new TypeError("CronPattern: configuration entry " + i + " (" + parts[i] + ") contains illegal characters.");
        }
    }
};
CronPattern.prototype.handleNumber = function(conf, type, valueIndexOffset) {
    const i = parseInt(conf, 10) + valueIndexOffset;
    if (isNaN(i)) {
        throw new TypeError("CronPattern: " + type + " is not a number: '" + conf + "'");
    }
    if (i < 0 || i >= this[type].length) {
        throw new TypeError("CronPattern: " + type + " value out of range: '" + conf + "'");
    }
    this[type][i] = 1;
};
CronPattern.prototype.handleRangeWithStepping = function(conf, type, valueIndexOffset) {
    const matches = conf.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (matches === null) throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '" + conf + "'");
    let [, lower, upper, steps] = matches;
    lower = parseInt(lower, 10) + valueIndexOffset;
    upper = parseInt(upper, 10) + valueIndexOffset;
    steps = parseInt(steps, 10);
    if (isNaN(lower)) throw new TypeError("CronPattern: Syntax error, illegal lower range (NaN)");
    if (isNaN(upper)) throw new TypeError("CronPattern: Syntax error, illegal upper range (NaN)");
    if (isNaN(steps)) throw new TypeError("CronPattern: Syntax error, illegal stepping: (NaN)");
    if (steps === 0) throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
    if (steps > this[type].length) throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part (" + this[type].length + ")");
    if (lower < 0 || upper >= this[type].length) throw new TypeError("CronPattern: Value out of range: '" + conf + "'");
    if (lower > upper) throw new TypeError("CronPattern: From value is larger than to value: '" + conf + "'");
    for(let i = lower; i <= upper; i += steps){
        this[type][i] = 1;
    }
};
CronPattern.prototype.handleRange = function(conf, type, valueIndexOffset) {
    const split = conf.split("-");
    if (split.length !== 2) {
        throw new TypeError("CronPattern: Syntax error, illegal range: '" + conf + "'");
    }
    const lower = parseInt(split[0], 10) + valueIndexOffset, upper = parseInt(split[1], 10) + valueIndexOffset;
    if (isNaN(lower)) {
        throw new TypeError("CronPattern: Syntax error, illegal lower range (NaN)");
    } else if (isNaN(upper)) {
        throw new TypeError("CronPattern: Syntax error, illegal upper range (NaN)");
    }
    if (lower < 0 || upper >= this[type].length) {
        throw new TypeError("CronPattern: Value out of range: '" + conf + "'");
    }
    if (lower > upper) {
        throw new TypeError("CronPattern: From value is larger than to value: '" + conf + "'");
    }
    for(let i = lower; i <= upper; i++){
        this[type][i] = 1;
    }
};
CronPattern.prototype.handleStepping = function(conf, type) {
    const split = conf.split("/");
    if (split.length !== 2) {
        throw new TypeError("CronPattern: Syntax error, illegal stepping: '" + conf + "'");
    }
    let start = 0;
    if (split[0] !== "*") {
        start = parseInt(split[0], 10);
    }
    const steps = parseInt(split[1], 10);
    if (isNaN(steps)) throw new TypeError("CronPattern: Syntax error, illegal stepping: (NaN)");
    if (steps === 0) throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
    if (steps > this[type].length) throw new TypeError("CronPattern: Syntax error, max steps for part is (" + this[type].length + ")");
    for(let i = start; i < this[type].length; i += steps){
        this[type][i] = 1;
    }
};
CronPattern.prototype.replaceAlphaDays = function(conf) {
    return conf.replace(/-sun/gi, "-7").replace(/sun/gi, "0").replace(/mon/gi, "1").replace(/tue/gi, "2").replace(/wed/gi, "3").replace(/thu/gi, "4").replace(/fri/gi, "5").replace(/sat/gi, "6");
};
CronPattern.prototype.replaceAlphaMonths = function(conf) {
    return conf.replace(/jan/gi, "1").replace(/feb/gi, "2").replace(/mar/gi, "3").replace(/apr/gi, "4").replace(/may/gi, "5").replace(/jun/gi, "6").replace(/jul/gi, "7").replace(/aug/gi, "8").replace(/sep/gi, "9").replace(/oct/gi, "10").replace(/nov/gi, "11").replace(/dec/gi, "12");
};
CronPattern.prototype.handleNicknames = function(pattern) {
    const cleanPattern = pattern.trim().toLowerCase();
    if (cleanPattern === "@yearly" || cleanPattern === "@annually") {
        return "0 0 1 1 *";
    } else if (cleanPattern === "@monthly") {
        return "0 0 1 * *";
    } else if (cleanPattern === "@weekly") {
        return "0 0 * * 0";
    } else if (cleanPattern === "@daily") {
        return "0 0 * * *";
    } else if (cleanPattern === "@hourly") {
        return "0 * * * *";
    } else {
        return pattern;
    }
};
function CronOptions(options) {
    if (options === void 0) {
        options = {};
    }
    options.legacyMode = options.legacyMode === void 0 ? true : options.legacyMode;
    options.paused = options.paused === void 0 ? false : options.paused;
    options.maxRuns = options.maxRuns === void 0 ? Infinity : options.maxRuns;
    options.catch = options.catch === void 0 ? false : options.catch;
    options.interval = options.interval === void 0 ? 0 : parseInt(options.interval, 10);
    options.kill = false;
    if (options.startAt) {
        options.startAt = new CronDate(options.startAt, options.timezone);
    }
    if (options.stopAt) {
        options.stopAt = new CronDate(options.stopAt, options.timezone);
    }
    if (options.interval !== null) {
        if (isNaN(options.interval)) {
            throw new Error("CronOptions: Supplied value for interval is not a number");
        } else if (options.interval < 0) {
            throw new Error("CronOptions: Supplied value for interval can not be negative");
        }
    }
    return options;
}
const maxDelay = Math.pow(2, 32 - 1) - 1;
function Cron(pattern, fnOrOptions1, fnOrOptions2) {
    if (!(this instanceof Cron)) {
        return new Cron(pattern, fnOrOptions1, fnOrOptions2);
    }
    let options, func;
    if (typeof fnOrOptions1 === "function") {
        func = fnOrOptions1;
    } else if (typeof fnOrOptions1 === "object") {
        options = fnOrOptions1;
    } else if (fnOrOptions1 !== void 0) {
        throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");
    }
    if (typeof fnOrOptions2 === "function") {
        func = fnOrOptions2;
    } else if (typeof fnOrOptions2 === "object") {
        options = fnOrOptions2;
    } else if (fnOrOptions2 !== void 0) {
        throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");
    }
    this.options = CronOptions(options);
    this.once = void 0;
    this.pattern = void 0;
    if (pattern && (pattern instanceof Date || typeof pattern === "string" && pattern.indexOf(":") > 0)) {
        this.once = new CronDate(pattern, this.options.timezone);
    } else {
        this.pattern = new CronPattern(pattern, this.options.timezone);
    }
    if (func !== void 0) {
        this.fn = func;
        this.schedule();
    }
    return this;
}
Cron.prototype.next = function(prev) {
    const next = this._next(prev);
    return next ? next.getDate() : null;
};
Cron.prototype.enumerate = function(n, previous) {
    if (n > this.options.maxRuns) {
        n = this.options.maxRuns;
    }
    const enumeration = [];
    let prev = previous || this.previousrun;
    while(n-- && (prev = this.next(prev))){
        enumeration.push(prev);
    }
    return enumeration;
};
Cron.prototype.running = function() {
    const msLeft = this.msToNext(this.previousrun);
    const running = !this.options.paused && this.fn !== void 0;
    return msLeft !== null && running;
};
Cron.prototype.previous = function() {
    return this.previousrun ? this.previousrun.getDate() : null;
};
Cron.prototype.msToNext = function(prev) {
    const next = this._next(prev || this.previousrun);
    prev = new CronDate(prev, this.options.timezone);
    if (next) {
        return next.getTime(true) - prev.getTime(true);
    } else {
        return null;
    }
};
Cron.prototype.stop = function() {
    this.options.kill = true;
    if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
    }
};
Cron.prototype.pause = function() {
    return (this.options.paused = true) && !this.options.kill;
};
Cron.prototype.resume = function() {
    return !(this.options.paused = false) && !this.options.kill;
};
Cron.prototype.schedule = function(func, partial) {
    if (func && this.fn) {
        throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");
    } else if (func) {
        this.fn = func;
    }
    let waitMs = this.msToNext(partial ? partial : this.previousrun);
    const target = this.next(partial ? partial : this.previousrun);
    if (waitMs === null) return this;
    if (waitMs > maxDelay) {
        waitMs = maxDelay;
    }
    this.currentTimeout = setTimeout(()=>{
        const now = new Date();
        if (waitMs !== maxDelay && !this.options.paused && now.getTime() >= target) {
            this.options.maxRuns--;
            if (this.options.catch) {
                try {
                    this.fn(this, this.options.context);
                } catch (_e) {}
            } else {
                this.fn(this, this.options.context);
            }
            this.previousrun = new CronDate(void 0, this.options.timezone);
            this.schedule();
        } else {
            this.schedule(undefined, now);
        }
    }, waitMs);
    return this;
};
Cron.prototype._next = function(prev) {
    const hasPreviousRun = prev || this.previousrun ? true : false;
    prev = new CronDate(prev, this.options.timezone);
    if (this.options.startAt && prev && prev.getTime() < this.options.startAt.getTime()) {
        prev = this.options.startAt;
    }
    const nextRun = this.once || new CronDate(prev, this.options.timezone).increment(this.pattern, this.options, hasPreviousRun);
    if (this.once && this.once.getTime() <= prev.getTime()) {
        return null;
    } else if (nextRun === null || this.options.maxRuns <= 0 || this.options.kill || this.options.stopAt && nextRun.getTime() >= this.options.stopAt.getTime()) {
        return null;
    } else {
        return nextRun;
    }
};
Cron.Cron = Cron;
class MutexException extends Exception {
}
class Mutex {
    c_;
    tryLock() {
        if (!this.c_) {
            this.c_ = new Completer();
            return true;
        }
        return false;
    }
    lock() {
        if (this.tryLock()) {
            return;
        }
        return this._lock();
    }
    async _lock() {
        let c = this.c_;
        while(c){
            await c.promise;
            c = this.c_;
        }
        this.c_ = new Completer();
        return this;
    }
    unlock() {
        const c = this.c_;
        if (c) {
            this.c_ = undefined;
            c.resolve();
        } else {
            throw new MutexException('unlock of unlocked mutex');
        }
    }
}
class Service {
    env_;
    mutex_;
    constructor(opts){
        this.opts = opts;
        this.mutex_ = new Mutex();
        this.env_ = {
            rootPassword: Deno.env.get("MYSQL_ROOT_PASSWORD"),
            slaveName: Deno.env.get("MYSQL_SLAVE_NAME"),
            slavePassword: Deno.env.get("MYSQL_SLAVE_PASSWORD")
        };
    }
    serve() {
        throw new Error(`class ${this.constructor.name} not implemented function: serve(): Promise<void> | void`);
    }
    run(opts) {
        log.debug("run", opts.cmd);
        if (this.opts.test) {
            return;
        }
        return Deno.run(opts);
    }
    bash(...strs) {
        const bash = strs.join("");
        console.log("---------------");
        console.log(bash);
        console.log("---------------");
        return this.run({
            cmd: [
                "bash",
                "-c",
                bash
            ]
        });
    }
    gosu(user, ...strs) {
        const bash = strs.join("");
        return this.run({
            cmd: [
                "gosu",
                user,
                "bash",
                "-c",
                bash
            ]
        });
    }
    runMysqd() {
        log.info("run mariadbd");
        return this.run({
            cmd: [
                "docker-entrypoint.sh",
                "mariadbd"
            ]
        });
    }
    async waitMysqld() {
        log.info("wait mysqld");
        const env = this.env_;
        const p = await this.bash(`until mysql -h 127.0.0.1 --user=root --password="${env.rootPassword}" -e "SELECT 1"; do sleep 1; done`);
        if (p) {
            const s = await p.status();
            if (!s.success) {
                throw new Error("waitMysqld not success");
            }
        }
    }
    async createSlave() {
        const env = this.env_;
        log.info(`create slave: name=${env.slaveName} password=${env.slavePassword}`);
        const p = await this.bash(`mysql -h 127.0.0.1 --user=root --password="${env.rootPassword}" -e "`, `CREATE USER IF NOT EXISTS '${this.env_.slaveName}'@'%' IDENTIFIED BY '${env.slavePassword}';`, `GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${this.env_.slaveName}'@'%';`, `FLUSH PRIVILEGES;`, `"`);
        if (p) {
            const s = await p.status();
            if (!s.success) {
                throw new Error("createSlave not success");
            }
        }
    }
    async ncat(createSlave) {
        const opts = this.opts;
        const port = opts.ncat ?? 0;
        if (port == 0) {
            return;
        }
        try {
            if (createSlave) {
                await this.waitMysqld();
                await this.createSlave();
            }
            let dely = 0;
            while(true){
                try {
                    await this.waitMysqld();
                    await this._ncat(port);
                    dely = 0;
                    if (opts.test) {
                        break;
                    }
                } catch (e) {
                    if (dely == 0) {
                        dely = 100;
                    } else {
                        dely *= 2;
                        if (dely > 5000) {
                            dely = 5000;
                        }
                    }
                    log.error(`ncat error:`, e, `, retry on ${dely}ms`);
                    await new Promise((resolve)=>setTimeout(resolve, dely));
                }
            }
        } catch (e1) {
            log.fail(e1);
            Deno.exit(1);
        }
    }
    async _ncat(port) {
        if (port == 0) {
            return;
        }
        log.info("ncat listen:", port);
        const env = this.env_;
        const p = this.gosu("mysql", `ncat --listen --keep-open --send-only --max-conns=1 ${port} -c "`, `mariabackup --backup --slave-info --stream=xbstream --host=127.0.0.1 --user='root' --password='${env.rootPassword}'`, `"`);
        if (p) {
            const s = await p.status();
            if (!s.success) {
                throw new Error("ncat not success");
            }
        }
    }
    async writeServerID() {
        const opts = this.opts;
        if (opts.id < 1 || opts.file == "") {
            return;
        }
        let file = opts.file;
        if (!file.endsWith(".cnf")) {
            file += ".cnf";
        }
        log.info(`write server-id '${opts.id}' to '${file}'`);
        if (opts.test) {
            return;
        }
        await Deno.mkdir("/etc/mysql/conf.d", {
            recursive: true,
            mode: 0o775
        });
        await Deno.writeTextFile(`/etc/mysql/conf.d/${file}`, `[mysqld]
server-id=${opts.id}
`, {
            mode: 0o664
        });
    }
    backup() {
        const opts = this.opts;
        const cron = opts.backup ?? "";
        if (cron == "") {
            return;
        }
        log.info(`cron backup: "${cron}"`);
        const c = new Chan(1);
        new Cron(cron, ()=>{
            c.tryWrite(1);
        });
        this._backup(c);
    }
    async _backup(c) {
        const opts = this.opts;
        const backup = new Backup(opts);
        const m = this.mutex_;
        for await (const _ of c){
            try {
                await m.lock();
                await backup.serve();
            } catch (e) {
                log.error("backup error:", e);
            } finally{
                m.unlock();
            }
        }
    }
    opts;
}
class Master extends Service {
    async serve() {
        try {
            await this.writeServerID();
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
    async _serve() {
        const opts = this.opts;
        if (opts.backupNow) {
            await new Backup(opts).serve();
        }
        this.ncat(true);
        this.backup();
    }
}
const backupCommand = new Command({
    use: "backup",
    short: "backup mariadb",
    prepare (flags, _) {
        const test = flags.bool({
            name: "test",
            short: "t",
            usage: "output execute command, but not execute"
        });
        const output = flags.string({
            name: "output",
            short: "o",
            default: "/backup",
            usage: `backup output dir`
        });
        return async ()=>{
            try {
                await new Backup({
                    test: test.value,
                    output: output.value
                }).serve();
            } catch (e) {
                log.error(e);
                Deno.exit(1);
            }
        };
    }
});
class Slave extends Service {
    async serve() {
        try {
            await this.writeServerID();
            await this._clone();
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
    async _serve() {
        const opts = this.opts;
        if (opts.backupNow) {
            await new Backup(opts).serve();
        }
        await this._slave();
        this.ncat(false);
        this.backup();
    }
    async _slave() {
        const opts = this.opts;
        console.log(`-------------------------------${opts.master}`);
        const p = this.bash(`#!/bin/bash
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
                MASTER_HOST='` + opts.master + `', \
                MASTER_USER='$MYSQL_SLAVE_NAME', \
                MASTER_PASSWORD='$MYSQL_SLAVE_PASSWORD', \
                MASTER_CONNECT_RETRY=10; \
                START SLAVE;" || exit 1
    # In case of container restart, attempt this at-most-once.
    mv change_master_to.sql.in change_master_to.sql.orig
fi`);
        if (p) {
            const s = await p.status();
            if (!s.success) {
                throw new Error(`slave error: ${s.code}`);
            }
        }
    }
    async _clone() {
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
const slaveCommand = new Command({
    use: "slave",
    short: "run slave",
    prepare (flags) {
        const test = flags.bool({
            name: "test",
            short: "t",
            usage: "output execute command, but not execute"
        });
        const id = flags.number({
            name: "id",
            short: "i",
            usage: "create server-id.cnf and write server-id",
            default: 100,
            isValid: (v)=>{
                return Number.isSafeInteger(v) && v >= 0;
            }
        });
        const file = flags.string({
            name: "file",
            usage: "server-id file name",
            default: "server-id.cnf",
            isValid: (v)=>{
                return v.indexOf("/") < 0 || v.indexOf("\\") < 0;
            }
        });
        const ncat = flags.number({
            name: "ncat",
            short: "n",
            usage: "ncat listen port, if 0 not run ncat listen",
            default: 3307,
            isValid: (v)=>{
                return Number.isSafeInteger(v) && v >= 0 && v < 65535;
            }
        });
        const backup = flags.string({
            name: "backup",
            short: "b",
            usage: `backup cron "1 * * * *" (m h DofM M DofW), if empty not run backup cron`,
            isValid: (v)=>{
                v = v.trim();
                if (v == "") {
                    return true;
                }
                const c = new Cron(v);
                return c.next() ? true : false;
            }
        });
        const backupNow = flags.bool({
            name: "backup-now",
            short: "B",
            usage: `run a backup immediately`
        });
        const output = flags.string({
            name: "output",
            short: "o",
            default: "/backup",
            usage: `backup output dir`
        });
        const master = flags.string({
            name: "master",
            short: "m",
            default: "db-master",
            usage: `master address`
        });
        return ()=>{
            const srv = new Slave({
                test: test.value,
                id: id.value,
                file: file.value,
                ncat: ncat.value,
                backup: backup.value.trim(),
                backupNow: backupNow.value,
                output: output.value,
                master: master.value
            });
            srv.serve();
        };
    }
});
const root = new Command({
    use: "main.ts",
    short: "mariadb docker tools",
    prepare (flags) {
        const test = flags.bool({
            name: "test",
            short: "t",
            usage: "output execute command, but not execute"
        });
        const id = flags.number({
            name: "id",
            short: "i",
            usage: "create server-id.cnf and write server-id",
            default: 1,
            isValid: (v)=>{
                return Number.isSafeInteger(v) && v >= 0;
            }
        });
        const file = flags.string({
            name: "file",
            usage: "server-id file name",
            default: "server-id.cnf",
            isValid: (v)=>{
                return v.indexOf("/") < 0 || v.indexOf("\\") < 0;
            }
        });
        const ncat = flags.number({
            name: "ncat",
            short: "n",
            usage: "ncat listen port, if 0 not run ncat listen",
            default: 3307,
            isValid: (v)=>{
                return Number.isSafeInteger(v) && v >= 0 && v < 65535;
            }
        });
        const backup = flags.string({
            name: "backup",
            short: "b",
            usage: `backup cron "1 * * * *" (m h DofM M DofW), if empty not run backup cron`,
            isValid: (v)=>{
                v = v.trim();
                if (v == "") {
                    return true;
                }
                const c = new Cron(v);
                return c.next() ? true : false;
            }
        });
        const backupNow = flags.bool({
            name: "backup-now",
            short: "B",
            usage: `run a backup immediately`
        });
        const output = flags.string({
            name: "output",
            short: "o",
            default: "/backup",
            usage: `backup output dir`
        });
        return ()=>{
            const srv = new Master({
                test: test.value,
                id: id.value,
                file: file.value,
                ncat: ncat.value,
                backup: backup.value.trim(),
                backupNow: backupNow.value,
                output: output.value
            });
            srv.serve();
        };
    }
});
root.add(backupCommand, slaveCommand);
new Parser(root).parse(Deno.args);
