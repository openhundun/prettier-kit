# prettier-plugin-biome

## Usage

```sh
npm install -D prettier prettier-plugin-biome
```

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-biome
```

```sh
npx prettier -w /path/to/your.ts
```

## Default

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-biome
overrides:
  - files: ["*.cjs", "*.cts", "*.js", "*.jsx", "*.mjs", "*.mts", "*.ts", "*.tsx"]
    options:
      biome.json: |
        {
          "assist": {
            "actions": {
              "preset": "recommended",
              "recommended": true,
              "source": {
                "noDuplicateClasses": "off",
                "organizeImports": "on",
                "useSortedAttributes": "off",
                "useSortedEnumMembers": "off",
                "useSortedInterfaceMembers": "off",
                "useSortedKeys": "off",
                "useSortedPackageJson": "off",
                "useSortedProperties": "off",
                "useSortedSelectionSet": "off",
                "useSortedTypeFields": "off"
              }
            },
            "enabled": true
          },
          "formatter": {
            "attributePosition": "auto",
            "bracketSameLine": false,
            "bracketSpacing": true,
            "delimiterSpacing": false,
            "enabled": true,
            "expand": "auto",
            "indentStyle": "tab",
            "indentWidth": 2,
            "lineEnding": "lf",
            "lineWidth": 80,
            "trailingNewline": true
          },
          "javascript": {
            "assist": {
              "enabled": true
            },
            "formatter": {
              "arrowParentheses": "always",
              "attributePosition": "auto",
              "bracketSameLine": false,
              "bracketSpacing": true,
              "delimiterSpacing": false,
              "enabled": true,
              "expand": "auto",
              "indentStyle": "tab",
              "indentWidth": 2,
              "jsxQuoteStyle": "double",
              "lineEnding": "lf",
              "lineWidth": 80,
              "operatorLinebreak": "after",
              "quoteProperties": "asNeeded",
              "quoteStyle": "double",
              "semicolons": "always",
              "trailingCommas": "all",
              "trailingNewline": true
            },
            "linter": {
              "enabled": true
            }
          },
          "linter": {
            "enabled": true
          }
        }
```
