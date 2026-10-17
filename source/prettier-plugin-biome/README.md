# prettier-plugin-biome

## Usage

```json
{
  "overrides": [
    {
      "files": ["*.ts"],
      "options": {
        "assist.actions.preset": "recommended",
        "assist.actions.recommended": true,
        "assist.actions.source.noDuplicateClasses": "off",
        "assist.actions.source.organizeImports": "on",
        "assist.actions.source.useSortedAttributes": "off",
        "assist.actions.source.useSortedEnumMembers": "off",
        "assist.actions.source.useSortedInterfaceMembers": "off",
        "assist.actions.source.useSortedKeys": "off",
        "assist.actions.source.useSortedPackageJson": "off",
        "assist.actions.source.useSortedProperties": "off",
        "assist.actions.source.useSortedSelectionSet": "off",
        "assist.actions.source.useSortedTypeFields": "off",
        "assist.enabled": true,
        "formatter.attributePosition": "auto",
        "formatter.bracketSameLine": false,
        "formatter.bracketSpacing": true,
        "formatter.delimiterSpacing": false,
        "formatter.enabled": true,
        "formatter.expand": "auto",
        "formatter.indentStyle": "tab",
        "formatter.indentWidth": 2,
        "formatter.lineEnding": "lf",
        "formatter.lineWidth": 80,
        "formatter.trailingNewline": true,
        "javascript.assist.enabled": true,
        "javascript.formatter.arrowParentheses": "always",
        "javascript.formatter.attributePosition": "auto",
        "javascript.formatter.bracketSameLine": false,
        "javascript.formatter.bracketSpacing": true,
        "javascript.formatter.delimiterSpacing": false,
        "javascript.formatter.enabled": true,
        "javascript.formatter.expand": "auto",
        "javascript.formatter.indentStyle": "tab",
        "javascript.formatter.indentWidth": 2,
        "javascript.formatter.jsxQuoteStyle": "double",
        "javascript.formatter.lineEnding": "lf",
        "javascript.formatter.lineWidth": 80,
        "javascript.formatter.operatorLinebreak": "after",
        "javascript.formatter.quoteProperties": "asNeeded",
        "javascript.formatter.quoteStyle": "double",
        "javascript.formatter.semicolons": "always",
        "javascript.formatter.trailingCommas": "all",
        "javascript.formatter.trailingNewline": true,
        "javascript.linter.enabled": true,
        "linter.enabled": true
      }
    }
  ],
  "plugins": ["prettier-plugin-biome"]
}
```

```sh
npm install -D prettier prettier-plugin-biome
```

```sh
npx prettier -w /path/to/your.ts
```
