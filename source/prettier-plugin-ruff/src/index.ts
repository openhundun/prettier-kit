import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { AstPath, Parser, ParserOptions, Plugin, Printer } from "prettier";
import { parse as parseTOML } from "smol-toml";

type Position = { row: number; column: number };

type Edit = {
    content: string | null;
    end_location: Position;
    location: Position;
};

type Diagnostic = {
    code: string | null;
    fix: { edits: Edit[] } | null;
    message: string;
    start_location: Position;
};

type RuffWorkspace = {
    check(contents: string): Diagnostic[];
    format(contents: string): string;
};

type RuffModule = {
    PositionEncoding: { Utf16: number };
    Workspace: new (options: unknown, encoding: number) => RuffWorkspace;
};

type RuffConfig = { [key: string]: unknown };

type ResolvedEdit = {
    content: string;
    end: number;
    start: number;
};

type RuffAstNode = {
    text: string;
    type: "RuffRoot";
};

const RUFF_FORMAT = "ruff-ast";
const SYNTAX_ERROR_CODE = "invalid-syntax";
const SAFE_FIX_RULES: Record<string, true> = {
    F632: true,
    F811: true,
    F901: true,
    FURB167: true,
    RUF022: true,
    RUF023: true,
};
const MAX_ITERATIONS = 100;
const require = createRequire(import.meta.url);
const workspaceCache = new Map<string, RuffWorkspace>();
let ruffModule: RuffModule | undefined;

function loadRuff(): RuffModule {
    ruffModule = ruffModule ?? (require("@astral-sh/ruff-wasm-nodejs") as RuffModule);
    return ruffModule;
}

function parseTomlText(content: string, origin: string): Record<string, unknown> {
    try {
        return parseTOML(content) as Record<string, unknown>;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`ruff configuration error: cannot parse ${origin}: ${message}`);
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function findConfig(startDirectory: string): { config: RuffConfig; path: string } | undefined {
    for (let directory = startDirectory; ; ) {
        for (const name of ["ruff.toml", ".ruff.toml"] as const) {
            const candidate = path.join(directory, name);
            if (fs.existsSync(candidate)) {
                return { config: parseTomlText(fs.readFileSync(candidate, "utf8"), candidate), path: candidate };
            }
        }
        const pyproject = path.join(directory, "pyproject.toml");
        if (fs.existsSync(pyproject)) {
            const parsed = parseTomlText(fs.readFileSync(pyproject, "utf8"), pyproject);
            const tool = asRecord(parsed.tool);
            const ruff = tool ? asRecord(tool.ruff) : undefined;
            if (ruff) {
                return { config: ruff, path: pyproject };
            }
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

function loadWorkspace(cacheKey: string, config: RuffConfig): RuffWorkspace {
    const cached = workspaceCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const { PositionEncoding, Workspace } = loadRuff();
    const workspace = new Workspace(config, PositionEncoding.Utf16);
    workspaceCache.set(cacheKey, workspace);
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
    const lineStart = starts[position.row - 1] ?? 0;
    const offset = lineStart + position.column - 1;
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

function applySelectedFixes(workspace: RuffWorkspace, text: string, lintPreview: boolean): string {
    let current = text;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const diagnostics = workspace.check(current);
        const syntaxError = diagnostics.find(diagnostic => diagnostic.code === SYNTAX_ERROR_CODE);
        if (syntaxError) {
            const { row, column } = syntaxError.start_location;
            throw new Error(`parse error: ${syntaxError.message} (line ${row}, column ${column})`);
        }
        if (lintPreview) {
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

function formatPython(text: string, options: ParserOptions<any>): string {
    const inline = typeof options["ruff.toml"] === "string" ? options["ruff.toml"] : undefined;
    const directory = path.dirname(path.resolve(options.filepath ?? "input.py"));
    const found = inline === undefined ? findConfig(directory) : undefined;
    const cacheKey = inline !== undefined ? `inline\0${inline}` : (found?.path ?? `${directory}\0defaults`);
    const config: RuffConfig = inline !== undefined ? parseTomlText(inline, "the inline ruff.toml option") : (found?.config ?? {});
    const workspace = loadWorkspace(cacheKey, config);
    const lint = asRecord(config.lint);
    const lintPreview = typeof lint?.preview === "boolean" && lint.preview;
    const fixed = applySelectedFixes(workspace, text, lintPreview);
    try {
        return workspace.format(fixed);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`parse error: ${message}`);
    }
}

const ruffParser: Parser<RuffAstNode> = {
    astFormat: RUFF_FORMAT,
    locEnd: node => node.text.length,
    locStart: () => 0,
    parse: (text: string, options: ParserOptions<RuffAstNode>) => ({
        text: formatPython(text, options),
        type: "RuffRoot",
    }),
};

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
    "ruff-python": ruffParser,
};

const printers: { [astFormat: string]: Printer<RuffAstNode> } = {
    [RUFF_FORMAT]: {
        print: (path: AstPath<RuffAstNode>) => path.getValue().text,
    },
};

const plugin: Plugin<RuffAstNode> = {
    languages,
    options: {
        "ruff.toml": { category: "Ruff", description: "Inline ruff.toml content; overrides discovered ruff.toml, .ruff.toml and pyproject.toml files.", type: "string" },
    },
    parsers,
    printers,
};

export default plugin;
