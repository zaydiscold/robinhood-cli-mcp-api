# robinhood-cli on mothership — keep it up to date

Public code comes from GitHub; private bits (info/, .env) come via this Syncthing
folder (~/Sync/robinhood-cli-private, shared frostbyte <-> mothership).

## First-time setup (on mothership)
```bash
git clone https://github.com/zaydiscold/robinhood-cli.git
cd robinhood-cli
# overlay the private bits from the synced folder:
cp -r "$HOME/Sync/robinhood-cli-private/info" ./info
cp "$HOME/Sync/robinhood-cli-private/.env" ./.env
pnpm install && pnpm build
node cli/dist/index.js quote MRVL --json   # smoke test
```

## Refresh (on mothership, whenever frostbyte pushes/updates)
```bash
cd robinhood-cli && git pull
cp -rf "$HOME/Sync/robinhood-cli-private/info" ./info
cp -f "$HOME/Sync/robinhood-cli-private/.env" ./.env
pnpm install && pnpm build
```
Note: the token in .env expires ~weekly; re-run auth refresh on frostbyte and it
re-syncs here automatically.
