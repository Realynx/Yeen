# Yeen Add-on Package authoring

The packer takes an already-built directory. It never installs dependencies or
runs package-manager scripts.

## 1. Generate an offline signing key

```sh
npm run addon:keygen -- --out ../yeen-private-keys/example-addon
```

Keep `example-addon.private.pem` private and offline. Add
`example-addon.public.pem` to Core Yeen's trusted publisher keys.

Format the public key for the server environment:

```sh
npm run addon:trust-key -- --key ../yeen-private-keys/example-addon.public.pem
```

Copy the printed `YEEN_ADDON_TRUSTED_KEYS=...` line into Yeen's private
server environment. The public key is safe to place there; the private key is
not.

## 2. Prepare the package directory

The directory must include `yeen-addon.json` and at least one referenced,
prebuilt entrypoint:

```json
{
  "schemaVersion": 1,
  "id": "com.example.yeen.example-addon",
  "name": "Example Add-on",
  "version": "1.0.0",
  "addonApiVersion": 1,
  "core": {
    "minimumVersion": "1.0.0",
    "maximumVersionExclusive": "2.0.0"
  },
  "entrypoints": {
    "server": "server/index.cjs",
    "web": "web/index.js"
  },
  "permissions": ["network", "media-library:write"]
}
```

Bundle all non-host JavaScript dependencies into the entrypoints. Do not put a
`node_modules` directory in the package.

## 3. Pack and sign the ZIP

```sh
npm run addon:pack -- \
  --source ../yeen-example-addon-addon/prebuilt \
  --key ../yeen-private-keys/example-addon.private.pem \
  --out ../yeen-example-addon-addon/releases/example-addon-1.0.0.yeen-addon.zip
```

The key ID defaults to the Ed25519 public-key fingerprint. Use `--key-id` only
when Core Yeen's trusted-key configuration assigns a different stable ID.

## Explicit unsigned package for local testing

```sh
npm run addon:pack -- \
  --source ../yeen-example-addon-addon/prebuilt \
  --unsigned \
  --out ../yeen-example-addon-addon/releases/example-addon-unsigned.yeen-addon.zip
```

Unsigned mode must be requested explicitly and cannot be combined with a key.
The packer still writes and validates `integrity.json`, but deliberately omits
`signature.json`. Core Yeen rejects this ZIP unless an Administrator has
enabled unsigned packages and accepts the execution-risk warning. Never use an
unsigned ZIP for normal distribution.
