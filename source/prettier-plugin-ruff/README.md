# prettier-plugin-ruff

## Usage

```json
{
  "overrides": [
    {
      "files": ["*.py", "*.pyi"],
      "options": {
        "format.docstring-code-format": false,
        "format.docstring-code-line-length": "dynamic",
        "format.exclude": [],
        "format.indent-style": "space",
        "format.line-ending": "auto",
        "format.nested-string-quote-style": "alternating",
        "format.preview": false,
        "format.quote-style": "double",
        "format.skip-magic-trailing-comma": false,
        "indent-width": 4,
        "line-length": 88,
        "lint.preview": false,
        "lint.select": []
      }
    }
  ],
  "plugins": ["prettier-plugin-ruff"]
}
```

```sh
npm install -D prettier prettier-plugin-ruff
```

```sh
npx prettier -w /path/to/your.py
```
