"""Extract Luogu cookies from Firefox profile for Playwright use."""
import sqlite3, json, shutil, sys, os
from pathlib import Path

FF_PROFILE = Path.home() / '.config/mozilla/firefox'
DOMAIN = sys.argv[1] if len(sys.argv) > 1 else 'luogu.com.cn'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).parent.parent / '.claude/cookies.json')

# Find profile
profiles = sorted(FF_PROFILE.glob('*default-release*'))
if not profiles:
    print('No Firefox profile found', file=sys.stderr)
    sys.exit(1)

cookie_db = profiles[0] / 'cookies.sqlite'
tmp = Path('/tmp/ff_cookies.sqlite')
shutil.copy2(cookie_db, tmp)

db = sqlite3.connect(str(tmp))
rows = db.execute(
    f"SELECT host, name, value FROM moz_cookies WHERE host LIKE '%{DOMAIN}%'"
).fetchall()
db.close()
tmp.unlink()

cookies = {r[1]: r[2] for r in rows}
with open(OUTPUT, 'w') as f:
    json.dump(cookies, f, indent=2)

print(f'Saved {len(cookies)} cookies to {OUTPUT}')
for r in rows:
    print(f'  {r[1]:25s} = {r[2][:40]}')
