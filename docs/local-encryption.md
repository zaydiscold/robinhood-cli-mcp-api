# Encrypted local workspace

The `local/` tree is tracked with `git-crypt`. Git stores ciphertext, while an
unlocked working copy exposes the normal plaintext files to the CLI and agents.
This lets the same personal notes, audit artifacts, account-label overlay, trade
log mirror, and downloaded documents move between trusted machines through Git.

## Security boundary

- `local/**` is encrypted by the rule in `.gitattributes`.
- The public repository still exposes filenames, directory names, file sizes,
  change timing, and deletion history.
- `.env`, `info/`, private fixtures, and raw per-account captures remain
  gitignored. Credentials and bearer tokens must never enter Git history, even
  encrypted.
- Anyone holding the exported git-crypt key can decrypt every encrypted revision
  that used that key. Transfer and back it up as a secret.

## One-time repository initialization

The repository owner initializes git-crypt once and exports the symmetric key
outside the checkout:

```bash
brew install git-crypt
git-crypt init
mkdir -p ~/.config/robinhood-cli
git-crypt export-key ~/.config/robinhood-cli/git-crypt-key
chmod 600 ~/.config/robinhood-cli/git-crypt-key
```

Do not run `git-crypt init` independently on another clone. That would create a
different key and make the encrypted history incompatible.

## Another trusted clone

Install git-crypt, securely copy
`~/.config/robinhood-cli/git-crypt-key` from an already unlocked machine, then:

```bash
git clone https://github.com/zaydiscold/robinhood-cli-mcp-api.git
cd robinhood-cli-mcp-api
git-crypt unlock ~/.config/robinhood-cli/git-crypt-key
git-crypt status
```

The same `git-crypt unlock` command works for an existing clone after it pulls
the migration commit. Without the key, the checkout remains usable for public
code, but files under `local/` are ciphertext and must not be edited.

## Normal workflow

After unlocking, edit, commit, pull, and push normally. The clean/smudge filters
encrypt on the way into Git and decrypt on the way into the working tree.
GitHub cannot render useful plaintext diffs for encrypted files, so review those
diffs locally from an unlocked clone.

Verify the boundary before pushing:

```bash
git-crypt status -e
git check-attr filter diff -- local/PLAN.local.md
git show --no-textconv :local/PLAN.local.md | file -
```

The status command should list every tracked `local/` file as encrypted, the
attributes should report `git-crypt`, and the staged blob should be binary data
rather than Markdown. The Vitest suite also checks the raw index headers so CI
fails if a future change accidentally stages plaintext under `local/`.

## Revocation

Removing a machine's copy of the key does not revoke a key that may already have
been copied. Full revocation requires generating a new key, re-encrypting the
files, and rewriting encrypted history. Treat the exported key as a long-lived
repository secret.
