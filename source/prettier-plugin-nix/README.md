# prettier-plugin-nix

## Usage

```sh
npm install -D prettier prettier-plugin-nix
```

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-nix
```

```sh
npx prettier -w /path/to/your.nix
```

## Default

```yaml
# .prettierrc.yaml
plugins:
  - prettier-plugin-nix
overrides:
  - files: ["*.nix"]
    options:
      tabWidth: 4
```
