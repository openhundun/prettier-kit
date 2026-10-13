# prettier-plugin-nix

## Usage

```json
{
  "overrides": [
    {
      "files": ["*.nix"],
      "options": { "tabWidth": 4 }
    }
  ],
  "plugins": ["prettier-plugin-nix"]
}
```

```sh
npm install -D prettier prettier-plugin-nix
```

```sh
npx prettier -w /path/to/your.nix
```
