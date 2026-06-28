"""
Token injection script — reads ROBINHOOD_BROKERAGE_TOKEN from a frostbyte
.env copy and injects it into the local .env + MCP config.

Usage: python inject-token.py [--frostbyte-env PATH]

Default reads .env.frostbyte from the repo root (scp'd from frostbyte).
"""
import argparse, os, re, shutil, sys, yaml

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))

def find_hermes_config():
    """Locate Hermes config.yaml — platform-aware."""
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~\\AppData\\Local'))
    else:
        base = os.environ.get('XDG_CONFIG_HOME', os.path.expanduser('~/.config'))
    path = os.path.join(base, 'hermes', 'config.yaml')
    if os.path.exists(path):
        return path
    raise FileNotFoundError(f"Hermes config not found at {path}")

def main():
    parser = argparse.ArgumentParser(description="Inject Robinhood token from frostbyte .env")
    parser.add_argument('--frostbyte-env', default=os.path.join(REPO_ROOT, '.env.frostbyte'),
                        help='Path to frostbyte .env file')
    args = parser.parse_args()

    # Extract token
    if not os.path.exists(args.frostbyte_env):
        print(f"FAIL: {args.frostbyte_env} not found")
        sys.exit(1)

    token = None
    with open(args.frostbyte_env) as f:
        for line in f:
            if 'ROBINHOOD_BROKERAGE_TOKEN' in line and '=' in line:
                token = line.strip().split('=', 1)[1]
                break

    if not token:
        print("FAIL: no ROBINHOOD_BROKERAGE_TOKEN found")
        sys.exit(1)

    # Inject into repo .env
    env_path = os.path.join(REPO_ROOT, '.env')
    with open(env_path) as f:
        content = f.read()

    old = re.findall(r'ROBINHOOD_BROKERAGE_TOKEN=.*', content)[0]
    content = content.replace(old, f'ROBINHOOD_BROKERAGE_TOKEN={token}')
    with open(env_path, 'w') as f:
        f.write(content)

    # Update MCP config
    config_path = find_hermes_config()
    with open(config_path) as f:
        config = yaml.safe_load(f)

    if 'mcp_servers' in config and 'robinhood' in config['mcp_servers']:
        config['mcp_servers']['robinhood']['env'] = {'ROBINHOOD_BROKERAGE_TOKEN': token}
        config['mcp_servers']['robinhood']['workdir'] = REPO_ROOT
        with open(config_path, 'w') as f:
            yaml.safe_dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    # Clean up the frostbyte env copy
    os.remove(args.frostbyte_env)
    print(f"OK: token injected into .env + MCP config")

if __name__ == '__main__':
    main()
