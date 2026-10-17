import { createRequire } from "node:module";
import path from "node:path";
import type { DiagnosticPrinter, Workspace } from "@biomejs/wasm-nodejs";
import type { AstPath, Parser, ParserOptions, Plugin, Printer, SupportOptions } from "prettier";

interface BiomeAstNode {
    text: string;
    type: "BiomeRoot";
}

interface BiomeModule {
    DiagnosticPrinter: new (fileName: string, fileSource: string) => DiagnosticPrinter;
    Workspace: { new (): Workspace };
}

interface Project {
    key: number;
    workspace: Workspace;
}

type Configuration = Parameters<Workspace["updateSettings"]>[0]["configuration"];
type Diagnostic = ReturnType<Workspace["pullDiagnostics"]>["diagnostics"][number];

const AST_FORMAT = "biome-ast";
const BOOLEAN: SupportOptions[string] = { category: "biome", description: "Biome option", type: "boolean" };
const CHOICE = (values: string[]): SupportOptions[string] => ({
    category: "biome",
    choices: values.map(value => ({ description: value, value })),
    description: "Biome option",
    type: "choice",
});
const INT: SupportOptions[string] = { category: "biome", type: "int" };
const table: SupportOptions = {
    "assist.actions.preset": CHOICE(["recommended", "all", "none"]),
    "assist.actions.recommended": BOOLEAN,
    "assist.actions.source.noDuplicateClasses": CHOICE(["on", "off"]),
    "assist.actions.source.organizeImports": CHOICE(["on", "off"]),
    "assist.actions.source.preset": CHOICE(["recommended", "all", "none"]),
    "assist.actions.source.recommended": BOOLEAN,
    "assist.actions.source.useSortedAttributes": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedEnumMembers": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedInterfaceMembers": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedKeys": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedPackageJson": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedProperties": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedSelectionSet": CHOICE(["on", "off"]),
    "assist.actions.source.useSortedTypeFields": CHOICE(["on", "off"]),
    "assist.enabled": BOOLEAN,
    "formatter.attributePosition": CHOICE(["auto", "multiline"]),
    "formatter.bracketSameLine": BOOLEAN,
    "formatter.bracketSpacing": BOOLEAN,
    "formatter.delimiterSpacing": BOOLEAN,
    "formatter.enabled": BOOLEAN,
    "formatter.expand": CHOICE(["auto", "always", "never"]),
    "formatter.indentStyle": CHOICE(["tab", "space"]),
    "formatter.indentWidth": INT,
    "formatter.lineEnding": CHOICE(["lf", "crlf", "cr", "auto"]),
    "formatter.lineWidth": INT,
    "formatter.trailingNewline": BOOLEAN,
    "javascript.assist.enabled": BOOLEAN,
    "javascript.formatter.arrowParentheses": CHOICE(["always", "asNeeded"]),
    "javascript.formatter.attributePosition": CHOICE(["auto", "multiline"]),
    "javascript.formatter.bracketSameLine": BOOLEAN,
    "javascript.formatter.bracketSpacing": BOOLEAN,
    "javascript.formatter.delimiterSpacing": BOOLEAN,
    "javascript.formatter.enabled": BOOLEAN,
    "javascript.formatter.expand": CHOICE(["auto", "always", "never"]),
    "javascript.formatter.indentStyle": CHOICE(["tab", "space"]),
    "javascript.formatter.indentWidth": INT,
    "javascript.formatter.jsxQuoteStyle": CHOICE(["double", "single"]),
    "javascript.formatter.lineEnding": CHOICE(["lf", "crlf", "cr", "auto"]),
    "javascript.formatter.lineWidth": INT,
    "javascript.formatter.operatorLinebreak": CHOICE(["after", "before"]),
    "javascript.formatter.quoteProperties": CHOICE(["asNeeded", "preserve"]),
    "javascript.formatter.quoteStyle": CHOICE(["double", "single"]),
    "javascript.formatter.semicolons": CHOICE(["always", "asNeeded"]),
    "javascript.formatter.trailingCommas": CHOICE(["all", "es5", "none"]),
    "javascript.formatter.trailingNewline": BOOLEAN,
    "javascript.linter.enabled": BOOLEAN,
    "linter.enabled": BOOLEAN,
};
const require = createRequire(import.meta.url);
const projects = new Map<string, Project>();
let biomeModule: BiomeModule | undefined;

function loadBiome(): BiomeModule {
    biomeModule ??= require("@biomejs/wasm-nodejs") as BiomeModule;
    return biomeModule;
}

function createConfiguration(options: ParserOptions<any>): Configuration {
    const configuration: Record<string, unknown> = {};
    for (const path of Object.keys(table)) {
        const value = options[path];
        if (value === undefined) {
            continue;
        }
        const segments = path.split(".");
        const leaf = segments.pop();
        let node: Record<string, unknown> = configuration;
        for (const segment of segments) {
            node[segment] ??= {};
            node = node[segment] as Record<string, unknown>;
        }
        if (leaf !== undefined) {
            node[leaf] = value;
        }
    }
    return configuration as Configuration;
}

function getProject(filePath: string, configuration: Configuration): Project {
    const projectDirectory = path.dirname(filePath);
    const cacheKey = `${projectDirectory}\0${JSON.stringify(configuration)}`;
    const opened = projects.get(cacheKey);
    if (opened) {
        return opened;
    }

    const workspace = new (loadBiome().Workspace)();
    const { projectKey } = workspace.openProject({ openUninitialized: true, path: projectDirectory });
    const { diagnostics } = workspace.updateSettings({ configuration, projectKey, workspaceDirectory: projectDirectory });
    const errors = diagnostics.filter(diagnostic => diagnostic.severity === "error" || diagnostic.severity === "fatal");
    if (errors.length) {
        throw createDiagnosticsError(filePath, "", errors, "biome configuration error");
    }
    const project = { key: projectKey, workspace };
    projects.set(cacheKey, project);
    return project;
}

function createDiagnosticsError(filePath: string, source: string, diagnostics: Diagnostic[], prefix: string): Error {
    const printer = new (loadBiome().DiagnosticPrinter)(filePath, source);
    try {
        for (const diagnostic of diagnostics) {
            printer.print_simple(diagnostic);
        }
        return new Error(`${prefix}: ${filePath}\n${printer.finish()}`);
    } catch (error) {
        printer.free();
        throw error;
    }
}

function format(text: string, options: ParserOptions<any>): string {
    const filePath = path.resolve(options.filepath ?? "input.tsx");
    const configuration = createConfiguration(options);
    const { key: projectKey, workspace } = getProject(filePath, configuration);
    workspace.openFile({ content: { content: text, type: "fromClient", version: 0 }, path: filePath, projectKey });
    try {
        const syntax = workspace.pullDiagnostics({ categories: ["syntax"], path: filePath, projectKey });
        if (syntax.errors) {
            throw createDiagnosticsError(filePath, text, syntax.diagnostics, "parse error");
        }
        return workspace.fixFile({
            fixFileMode: "safeFixes",
            path: filePath,
            projectKey,
            ruleCategories: ["syntax", "lint", "action"],
            shouldFormat: true,
        }).code;
    } finally {
        workspace.closeFile({ path: filePath, projectKey });
    }
}

const biomeParser: Parser<BiomeAstNode> = {
    astFormat: AST_FORMAT,
    locEnd: node => node.text.length,
    locStart: () => 0,
    parse: (text: string, options: ParserOptions<BiomeAstNode>) => ({
        text: format(text, options),
        type: "BiomeRoot",
    }),
};

const languages = [
    {
        extensions: [".cjs", ".js", ".mjs"],
        linguistLanguageId: 183,
        name: "JavaScript",
        parsers: ["biome"],
        tmScope: "source.js",
        vscodeLanguageId: "javascript",
    },
    {
        extensions: [".jsx"],
        linguistLanguageId: 183,
        name: "JSX",
        parsers: ["biome"],
        tmScope: "source.js.jsx",
        vscodeLanguageId: "javascriptreact",
    },
    {
        extensions: [".cts", ".mts", ".ts"],
        linguistLanguageId: 378,
        name: "TypeScript",
        parsers: ["biome"],
        tmScope: "source.ts",
        vscodeLanguageId: "typescript",
    },
    {
        extensions: [".tsx"],
        linguistLanguageId: 94901924,
        name: "TSX",
        parsers: ["biome"],
        tmScope: "source.tsx",
        vscodeLanguageId: "typescriptreact",
    },
];

const parsers = {
    "babel": biomeParser,
    "babel-ts": biomeParser,
    "biome": biomeParser,
    "typescript": biomeParser,
};

const printers: { [astFormat: string]: Printer<BiomeAstNode> } = {
    [AST_FORMAT]: {
        print: (path: AstPath<BiomeAstNode>) => path.getValue().text,
    },
};

const plugin: Plugin<BiomeAstNode> = {
    languages,
    options: table,
    parsers,
    printers,
};

export default plugin;
