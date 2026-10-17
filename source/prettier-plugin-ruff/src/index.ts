import { createRequire } from "node:module";

interface Position {
    row: number;
    column: number;
}

interface Edit {
    content: string | null;
    end_location: Position;
    location: Position;
}

interface Diagnostic {
    code: string | null;
    fix: { edits: Edit[] } | null;
    message: string;
    start_location: Position;
}

interface RuffWorkspace {
    check(contents: string): Diagnostic[];
    format(contents: string): string;
}

interface RuffModule {
    PositionEncoding: { Utf16: number };
    Workspace: new (options: unknown, encoding: number) => RuffWorkspace;
}

interface PluginOptions {
    filepath?: string;
    "line-length"?: number;
    "indent-width"?: number;
    "format.exclude"?: string[];
    "format.preview"?: boolean;
    "format.indent-style"?: "space" | "tab";
    "format.quote-style"?: "double" | "single" | "preserve";
    "format.nested-string-quote-style"?: "alternating" | "preferred";
    "format.skip-magic-trailing-comma"?: boolean;
    "format.line-ending"?: "auto" | "lf" | "cr-lf" | "native";
    "format.docstring-code-format"?: boolean;
    "format.docstring-code-line-length"?: number | "dynamic";
    "lint.preview"?: boolean;
    "lint.select"?: string[];
}

interface RuffConfig {
    [key: string]: unknown;
}

interface ResolvedEdit {
    content: string;
    end: number;
    start: number;
}

const SYNTAX_ERROR_CODE = "invalid-syntax";
const SAFE_FIX_RULES: Record<string, true> = {
    F632: true,
    F811: true,
    F901: true,
    FURB167: true,
    I001: true,
    LOG009: true,
    PIE800: true,
    PIE807: true,
    PIE808: true,
    PLC0208: true,
    PLE2510: true,
    PLE2512: true,
    PLE2513: true,
    PLE2514: true,
    PLE2515: true,
    PLR0402: true,
    PLR1716: true,
    PLR1733: true,
    PLR1736: true,
    PLR2044: true,
    PLW0120: true,
    PLW0245: true,
    PYI009: true,
    PYI010: true,
    PYI012: true,
    PYI013: true,
    PYI015: true,
    PYI020: true,
    PYI026: true,
    PYI029: true,
    PYI032: true,
    PYI036: true,
    PYI044: true,
    PYI064: true,
    RUF101: true,
    SIM114: true,
    SIM117: true,
    SIM208: true,
    TC005: true,
    UP001: true,
    UP003: true,
    UP005: true,
    UP009: true,
    UP011: true,
    UP012: true,
    UP019: true,
    UP021: true,
    UP023: true,
    UP024: true,
    UP025: true,
    UP026: true,
    UP032: true,
    UP034: true,
    UP035: true,
    W605: true,
};
const MAX_ITERATIONS = 100;
const OPTION_PATHS = [
    "line-length",
    "indent-width",
    "format.exclude",
    "format.preview",
    "format.indent-style",
    "format.quote-style",
    "format.nested-string-quote-style",
    "format.skip-magic-trailing-comma",
    "format.line-ending",
    "format.docstring-code-format",
    "format.docstring-code-line-length",
    "lint.preview",
    "lint.select",
] as const;
const require = createRequire(import.meta.url);
const workspaceCache = new Map<string, RuffWorkspace>();
let ruffModule: RuffModule | undefined;

function loadRuff(): RuffModule {
    if (!ruffModule) {
        ruffModule = require("@astral-sh/ruff-wasm-nodejs") as RuffModule;
    }
    return ruffModule;
}

function buildRuffOptions(options: PluginOptions): RuffConfig {
    const config: RuffConfig = {};
    for (const path of OPTION_PATHS) {
        let value = options[path];
        if (value === undefined) {
            continue;
        }
        if (path === "lint.select" && Array.isArray(value) && value.length === 0) {
            continue;
        }
        if (path === "format.docstring-code-line-length" && typeof value === "string" && value !== "dynamic") {
            value = Number(value);
        }
        const dot = path.indexOf(".");
        if (dot === -1) {
            config[path] = value;
        } else {
            const section = path.slice(0, dot);
            const scoped = (config[section] as Record<string, unknown> | undefined) ?? {};
            config[section] = scoped;
            scoped[path.slice(dot + 1)] = value;
        }
    }
    return config;
}

function loadWorkspace(options: Record<string, unknown>): RuffWorkspace {
    const key = JSON.stringify(options);
    const cached = workspaceCache.get(key);
    if (cached) {
        return cached;
    }
    const { PositionEncoding, Workspace } = loadRuff();
    const workspace = new Workspace(options, PositionEncoding.Utf16);
    workspaceCache.set(key, workspace);
    return workspace;
}

function lineStarts(text: string): number[] {
    const starts = [0];
    for (let index = 0; index < text.length; index++) {
        if (text[index] === "\n") {
            starts.push(index + 1);
        }
    }
    return starts;
}

function offsetAt(text: string, starts: number[], position: Position): number {
    const lineStart = starts[position.row - 1];
    if (lineStart === undefined) {
        return text.length;
    }
    const offset = lineStart + Math.max(position.column - 1, 0);
    return offset > text.length ? text.length : offset;
}

function editKey(edit: ResolvedEdit): string {
    return `${edit.start}:${edit.end}:${edit.content}`;
}

function applyFixes(text: string, diagnostics: Diagnostic[]): string {
    const starts = lineStarts(text);
    const fixes: { edits: ResolvedEdit[]; start: number }[] = [];
    for (const diagnostic of diagnostics) {
        const edits = (diagnostic.fix?.edits ?? [])
            .map(edit => {
                const start = offsetAt(text, starts, edit.location);
                const end = offsetAt(text, starts, edit.end_location);
                return {
                    content: edit.content ?? "",
                    end: Math.max(start, end),
                    start: Math.min(start, end),
                };
            })
            .sort((a, b) => a.start - b.start);
        const [first] = edits;
        if (first) {
            fixes.push({ edits, start: first.start });
        }
    }
    fixes.sort((a, b) => a.start - b.start);

    const applied = new Set<string>();
    let output = "";
    let lastPosition: number | null = null;
    for (const fix of fixes) {
        const pending = fix.edits.filter(edit => !applied.has(editKey(edit)));
        const [first] = pending;
        if (!first || (lastPosition !== null && lastPosition >= first.start)) {
            continue;
        }
        for (const edit of pending) {
            output += text.slice(lastPosition ?? 0, edit.start);
            output += edit.content;
            lastPosition = edit.end;
            applied.add(editKey(edit));
        }
    }
    return output + text.slice(lastPosition ?? 0);
}

function parseError(diagnostic: Diagnostic): Error {
    const { row, column } = diagnostic.start_location;
    return new Error(`parse error: ${diagnostic.message} (line ${row}, column ${column})`);
}

function applySelectedFixes(workspace: RuffWorkspace, text: string, options: PluginOptions): string {
    let current = text;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const diagnostics = workspace.check(current);
        const syntaxError = diagnostics.find(diagnostic => diagnostic.code === SYNTAX_ERROR_CODE);
        if (syntaxError) {
            throw parseError(syntaxError);
        }
        if (options["lint.preview"] === true) {
            return current;
        }
        const fixable = diagnostics.filter(diagnostic => diagnostic.fix && diagnostic.code !== null && SAFE_FIX_RULES[diagnostic.code] === true);
        if (fixable.length === 0) {
            return current;
        }
        const fixed = applyFixes(current, fixable);
        if (fixed === current) {
            return current;
        }
        current = fixed;
    }
    throw new Error(`parse error: fixes did not converge after ${MAX_ITERATIONS} iterations`);
}

function formatPython(text: string, options: PluginOptions | undefined): string {
    const resolvedOptions = options ?? {};
    const workspace = loadWorkspace(buildRuffOptions(resolvedOptions));
    const fixed = applySelectedFixes(workspace, text, resolvedOptions);
    try {
        return workspace.format(fixed);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`parse error: ${message}`);
    }
}

const languages = [
    {
        extensions: [".py", ".pyi"],
        linguistLanguageId: 303,
        name: "Python",
        parsers: ["ruff-python"],
        vscodeLanguageId: "python",
    },
];

const parsers = {
    "ruff-python": {
        astFormat: "ruff-ast",
        locEnd(node: { text: string }) {
            return node.text.length;
        },
        locStart() {
            return 0;
        },
        parse(text: string, options?: PluginOptions) {
            return { text: formatPython(text, options), type: "RuffRoot" };
        },
    },
};

const printers = {
    "ruff-ast": {
        print(path: { getValue: () => { text: string } }) {
            return path.getValue().text;
        },
    },
};

const plugin = {
    languages,
    options: {
        "format.docstring-code-format": { category: "Ruff", description: "Format code examples in docstrings.", type: "boolean" },
        "format.docstring-code-line-length": {
            category: "Ruff",
            exception: (value: unknown) => value === undefined || typeof value === "number" || value === "dynamic",
            type: "string",
        },
        "format.exclude": { array: true, category: "Ruff", default: [{ value: [] }], type: "string" },
        "format.indent-style": {
            category: "Ruff",
            choices: [
                { description: "Use spaces.", value: "space" },
                { description: "Use tabs.", value: "tab" },
            ],
            type: "choice",
        },
        "format.line-ending": {
            category: "Ruff",
            choices: [
                { description: "Automatically detect line endings.", value: "auto" },
                { description: "Use LF line endings.", value: "lf" },
                { description: "Use CRLF line endings.", value: "cr-lf" },
                { description: "Use the platform line ending.", value: "native" },
            ],
            type: "choice",
        },
        "format.nested-string-quote-style": {
            category: "Ruff",
            choices: [
                { description: "Alternate nested string quotes.", value: "alternating" },
                { description: "Use the configured quote style.", value: "preferred" },
            ],
            type: "choice",
        },
        "format.preview": { category: "Ruff", description: "Enable Ruff formatter preview features.", type: "boolean" },
        "format.quote-style": {
            category: "Ruff",
            choices: [
                { description: "Use double quotes.", value: "double" },
                { description: "Use single quotes.", value: "single" },
                { description: "Preserve quote style.", value: "preserve" },
            ],
            type: "choice",
        },
        "format.skip-magic-trailing-comma": { category: "Ruff", description: "Skip magic trailing commas when formatting.", type: "boolean" },
        "indent-width": { category: "Ruff", type: "int" },
        "line-length": { category: "Ruff", type: "int" },
        "lint.preview": { category: "Ruff", description: "Enable Ruff linter preview features.", type: "boolean" },
        "lint.select": { array: true, category: "Ruff", default: [{ value: [] }], type: "string" },
    },
    parsers,
    printers,
};

export default plugin;
