import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DiagnosticPrinter, Workspace } from "@biomejs/wasm-nodejs";
import type { AstPath, Parser, ParserOptions, Plugin, Printer } from "prettier";

type BiomeAstNode = {
    text: string;
    type: "BiomeRoot";
};

type BiomeModule = {
    DiagnosticPrinter: new (fileName: string, fileSource: string) => DiagnosticPrinter;
    Workspace: { new (): Workspace };
};

type Project = {
    key: number;
    workspace: Workspace;
};

type Configuration = Parameters<Workspace["updateSettings"]>[0]["configuration"];
type Diagnostic = ReturnType<Workspace["pullDiagnostics"]>["diagnostics"][number];

const AST_FORMAT = "biome-ast";
const require = createRequire(import.meta.url);
const projects = new Map<string, Project>();
let biomeModule: BiomeModule | undefined;

function loadBiome(): BiomeModule {
    biomeModule = biomeModule ?? (require("@biomejs/wasm-nodejs") as BiomeModule);
    return biomeModule;
}

function findConfigFile(startDirectory: string): string | undefined {
    for (let directory = startDirectory; ; ) {
        const candidate = path.join(directory, "biome.json");
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

function parseConfiguration(content: string, origin: string): Configuration {
    try {
        return JSON.parse(content) as Configuration;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`biome configuration error: cannot parse ${origin}: ${message}`);
    }
}

function getProject(cacheKey: string, configOrigin: string, projectDirectory: string, configuration: Configuration): Project {
    const opened = projects.get(cacheKey);
    if (opened) {
        return opened;
    }

    const workspace = new (loadBiome().Workspace)();
    const { projectKey } = workspace.openProject({ openUninitialized: true, path: projectDirectory });
    const { diagnostics } = workspace.updateSettings({ configuration, projectKey, workspaceDirectory: projectDirectory });
    const errors = diagnostics.filter(diagnostic => diagnostic.severity === "error" || diagnostic.severity === "fatal");
    if (errors.length) {
        throw createDiagnosticsError(configOrigin, "", errors, "biome configuration error");
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
    const inline = typeof options["biome.json"] === "string" ? options["biome.json"] : undefined;
    const configPath = inline === undefined ? findConfigFile(path.dirname(filePath)) : undefined;
    const projectDirectory = configPath ? path.dirname(configPath) : path.dirname(filePath);
    const origin = inline !== undefined ? "the inline biome.json option" : (configPath ?? filePath);
    const cacheKey = inline !== undefined ? `inline\0${inline}` : (configPath ?? `${projectDirectory}\0defaults`);
    const configuration: Configuration = inline !== undefined ? parseConfiguration(inline, origin) : configPath !== undefined ? parseConfiguration(fs.readFileSync(configPath, "utf8"), origin) : {};
    const { key: projectKey, workspace } = getProject(cacheKey, origin, projectDirectory, configuration);
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
    biome: biomeParser,
};

const printers: { [astFormat: string]: Printer<BiomeAstNode> } = {
    [AST_FORMAT]: {
        print: (path: AstPath<BiomeAstNode>) => path.getValue().text,
    },
};

const plugin: Plugin<BiomeAstNode> = {
    languages,
    options: {
        "biome.json": { category: "biome", description: "Inline biome.json content; overrides discovered biome.json files.", type: "string" },
    },
    parsers,
    printers,
};

export default plugin;
