"""
Quick token injection (shorthand version of inject-token.py).
Assumes .env.frostbyte is in the repo root.
Usage: python inject.py
"""
import os, re, sys, yaml

REPO = os.path.dirname(os.path.abspath(__file__))

def find_hermes_config():
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~\\AppData\\Local'))
    else:
        base = os.environ.get('XDG_CONFIG_HOME', os.path.expanduser('~/.config'))
    return os.path.join(base, 'hermes', 'config.yaml')

src = os.path.join(REPO, '.env.frostbyte')
if not os.path.exists(src):
    print(f"FAIL: {src} not found — scp it from frostbyte first")
    sys.exit(1)

token = None
with open(src) as f:
    for line in f:
        if 'ROBINHOOD_BROKERAGE_TOKEN' in line:
            token = line.strip().split('=', 1)[1]
            break
os.remove(src)

env_path = os.path.join(REPO, '.env')
with open(env_path) as f:
    c = f.read()
old = re.findall(r'ROBINHOOD_BROKERAGE_TOKEN=.*', c)[0]
c = c.replace(old, f'ROBINHOOD_BROKERAGE_TOKEN={token}')
with open(env_path, 'w') as f:
    f.write(c)

cfg_path = find_hermes_config()
with open(cfg_path) as f:
    cfg = yaml.safe_load(f)
cfg['mcp_servers']['robinhood']['env'] = {'ROBINHOOD_BROKERAGE_TOKEN': token}
with open(cfg_path, 'w') as f:
    yaml.safe_dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

print(f"OK: token injected")
