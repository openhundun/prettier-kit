# prettier-plugin-ruff

## Usage

```sh
npm install -D prettier prettier-plugin-ruff
```

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-ruff
```

```sh
npx prettier -w /path/to/your.py
```

## Default

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-ruff
overrides:
  - files: ["*.py", "*.pyi"]
    options:
      ruff.toml: |
        indent-width = 4
        line-length  = 88

        [format]
        docstring-code-format      = false
        docstring-code-line-length = "dynamic"
        exclude                    = []
        indent-style               = "space"
        line-ending                = "auto"
        nested-string-quote-style  = "alternating"
        preview                    = false
        quote-style                = "double"
        skip-magic-trailing-comma  = false

        [lint]
        preview = false
        select  = []
```
