import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstPath, Parser, ParserOptions, Plugin, Printer } from "prettier";

type NixAstNode = {
    text: string;
    type: "NixRoot";
};

type NixWasm = {
    format(before: string, path: string, configJson?: string | null): string;
};

const NIX_FORMAT = "nix-ast";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let nixWasm: NixWasm | undefined;

function loadNixWasm(): NixWasm {
    nixWasm = nixWasm ?? (require(path.resolve(__dirname, "../wasm/pkg/alejandra_wasm.js")) as NixWasm);
    return nixWasm;
}

const languages = [
    {
        extensions: [".nix"],
        linguistLanguageId: 252,
        name: "Nix",
        parsers: ["nix"],
        vscodeLanguageId: "nix",
    },
];

const nixParser: Parser<NixAstNode> = {
    astFormat: NIX_FORMAT,
    locEnd: node => node.text.length,
    locStart: () => 0,
    parse: (text: string, options: ParserOptions<NixAstNode>) => {
        try {
            const indentation = options.useTabs ? "Tabs" : options.tabWidth === 2 ? "TwoSpaces" : "FourSpaces";
            const configJson = JSON.stringify({ indentation, space_around_brackets: false });
            const formatted = loadNixWasm().format(text, options.filepath ?? "input.nix", configJson);
            return { text: formatted, type: "NixRoot" };
        } catch (err) {
            const backend = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
            throw new Error(`parse error: ${backend}`);
        }
    },
};

const parsers = {
    nix: nixParser,
};

const printers: { [astFormat: string]: Printer<NixAstNode> } = {
    [NIX_FORMAT]: {
        print: (path: AstPath<NixAstNode>) => path.getValue().text,
    },
};

const plugin: Plugin<NixAstNode> = {
    defaultOptions: {
        tabWidth: 4,
        useTabs: false,
    },
    languages,
    options: {
        tabWidth: {
            category: "Global" as const,
            default: 4,
            description: "Number of spaces per indentation level",
            type: "int" as const,
        },
        useTabs: {
            category: "Global" as const,
            default: false,
            description: "Indent lines with tabs instead of spaces",
            type: "boolean" as const,
        },
    },
    parsers,
    printers,
};

export default plugin;
