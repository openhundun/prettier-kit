import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface NixPluginOptions {
    filepath?: string;
    tabWidth?: number;
    useTabs?: boolean;
}

interface NixWasm {
    format(before: string, path: string, configJson?: string | null): string;
}

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let nixWasm: NixWasm | undefined;

function loadNixWasm(): NixWasm {
    if (!nixWasm) {
        nixWasm = require(path.resolve(__dirname, "../wasm/pkg/alejandra_wasm.js")) as NixWasm;
    }
    return nixWasm;
}

function buildNixConfig(options: NixPluginOptions | undefined): string {
    const indentation = options?.useTabs ? "Tabs" : options?.tabWidth === 2 ? "TwoSpaces" : "FourSpaces";
    return JSON.stringify({ indentation, space_around_brackets: false });
}

function toSyntaxError(err: unknown): Error {
    const backend = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
    return new Error(`parse error: ${backend}`);
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

const parsers = {
    nix: {
        astFormat: "nix-ast",
        locEnd(node: { text: string }) {
            return node.text.length;
        },
        locStart() {
            return 0;
        },
        parse(text: string, _parsers: unknown, options: NixPluginOptions) {
            try {
                const formatted = loadNixWasm().format(text, options?.filepath || "input.nix", buildNixConfig(options));
                return { text: formatted, type: "NixRoot" };
            } catch (err) {
                throw toSyntaxError(err);
            }
        },
    },
};

const printers = {
    "nix-ast": {
        print(path: { getValue: () => { text: string } }) {
            return path.getValue().text;
        },
    },
};

const options = {
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
};

const plugin = {
    defaultOptions: {
        tabWidth: 4,
        useTabs: false,
    },
    languages,
    options,
    parsers,
    printers,
};
export default plugin;
