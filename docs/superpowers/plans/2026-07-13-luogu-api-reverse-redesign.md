# Luogu API Reverse & GuluGulu Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Playwright to reverse-engineer Luogu's real API responses, compare against GuluGulu source code (types, stores, components), generate a severity-ranked diff report, and fix all CRITICAL/MAJOR findings.

**Architecture:** Three-phase pipeline: (1) enhanced Playwright scanner captures lentille-context + XHR from 18 Luogu pages, extracts TS field-access paths from source via regex, produces structured diff; (2) fix loop by severity CRITICAL → MAJOR → MINOR; (3) verification re-scan to confirm zero regressions.

**Tech Stack:** Playwright 1.61 (Chromium headless), TypeScript (esno), existing Vue 3 + Pinia + Vite build, webextension-polyfill background workers

## Global Constraints

- Build must stay green: `pnpm build` passes after every fix commit
- No unrelated refactoring — diff lines trace to scan findings only
- Follow existing code patterns (Vue Composition API, Pinia stores, UnoCSS attributify, `bew-*` CSS vars, `apiListenerFactory` background Msg format)
- Playwright scripts run via `npx esno scripts/xxx.ts`
- lentille-context is the source of truth for page data; API calls use `_contentOnly=1` for JSON-only endpoints

---

### Task 1: Install Playwright browser and verify capture

**Files:** (no source changes — generates `scripts/api-data/` output)

- [ ] **Step 1: Install Chromium browser for Playwright**

```bash
cd /home/shu/code/GuluGulu && pnpm exec playwright install chromium 2>&1
```
Expected: downloads chromium to `~/.cache/ms-playwright/`, exit 0

- [ ] **Step 2: Run the reverse scanner on all pages**

```bash
cd /home/shu/code/GuluGulu && npx esno scripts/reverse-api.ts 2>&1
```
Expected: visits all luogu pages, writes `scripts/api-data/all-pages.json` with lentille-context and API call data

- [ ] **Step 3: Verify captured data structure**

```bash
cd /home/shu/code/GuluGulu && python3 -c "
import json
d = json.load(open('scripts/api-data/all-pages.json'))
for name, data in sorted(d.items()):
    has_lc = 'lentilleContext' in data and data['lentilleContext'] and '_error' not in str(data.get('lentilleContext',''))
    has_err = 'error' in data
    n_apis = len(data.get('apiCalls',[]))
    status = 'ERR' if has_err else ('OK' if has_lc else 'NO_LC')
    print(f'{status} | {name}: apis={n_apis}')
"
```
Expected: most pages show "OK", some may show "NO_LC" for `_contentOnly` variants

- [ ] **Step 4: Commit**

```bash
git -C /home/shu/code/GuluGulu add scripts/api-data/ scripts/reverse-api.ts
git -C /home/shu/code/GuluGulu commit -m "feat: add Playwright API reverse-engineering scanner

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Extract TypeScript field-access paths from source code

**Files:**
- Create: `scripts/extract-types.ts`

**Interfaces:**
- Produces: `scripts/api-data/source-field-paths.json` — `{ "file.ts": ["currentData.problem.pid", "currentData.problem.title", ...], ... }`

- [ ] **Step 1: Write the field-path extractor**

Create `scripts/extract-types.ts`:

```typescript
/**
 * Extract all lentille-context / API response property access paths
 * from GuluGulu source files. Each path represents a field the code
 * expects to read from Luogu's JSON.
 *
 * Usage: npx esno scripts/extract-types.ts
 */
import * as fs from 'fs-extra';
import * as path from 'path';

const SRC = path.resolve('src');
const OUT = path.resolve('scripts/api-data/source-field-paths.json');

/** Patterns that capture data access paths from lentille-context or API responses */
const PATTERNS: { name: string; re: RegExp }[] = [
  // currentData.xxx.yyy (lentille-context top-level key)
  { name: 'currentData', re: /\bcurrentData\??\.([\w.]+)/g },
  // data.xxx.yyy (team page uses `data.*` top-level)
  { name: 'data', re: /(?<!\w\.)\bdata\??\.([\w.]+)/g },
  // Destructured: problem.xxx, contest.xxx, user.xxx, team.xxx
  { name: 'destructured', re: /\b(problem|contest|user|post|training|record|team|solutions?|ranking|records)\.([\w.]+)/g },
  // ctx.xxx (common alias for lentille-context root)
  { name: 'ctx', re: /\bctx\??\.([\w.]+)/g },
];

function collectPaths(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const paths = new Set<string>();

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const full = `${name}.${m[1]}`;
      // Skip false positives
      if (full.includes('import ') || full.includes('//') || full.includes('*')
          || full.includes('require(') || full.includes('export ')) continue;
      paths.add(full);
    }
  }

  return [...paths].sort();
}

async function main() {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      } else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  }
  walk(SRC);

  const result: Record<string, string[]> = {};
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const paths = collectPaths(file);
    if (paths.length > 0) result[rel] = paths;
  }

  await fs.ensureDir(path.dirname(OUT));
  await fs.writeJSON(OUT, result, { spaces: 2 });
  console.log(`Extracted paths from ${Object.keys(result).length} files → ${OUT}`);
}

main().catch((e: any) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the extractor**

```bash
cd /home/shu/code/GuluGulu && npx esno scripts/extract-types.ts 2>&1
```
Expected: prints "Extracted paths from N files → scripts/api-data/source-field-paths.json"

- [ ] **Step 3: Verify output**

```bash
cd /home/shu/code/GuluGulu && python3 -c "
import json; d = json.load(open('scripts/api-data/source-field-paths.json'))
print(f'files: {len(d)}')
for k in sorted(d)[:6]:
    print(f'  {k}: {len(d[k])} paths')
    for p in d[k][:3]: print(f'    {p}')
"
```
Expected: shows files and sample paths

- [ ] **Step 4: Commit**

```bash
git -C /home/shu/code/GuluGulu add scripts/extract-types.ts scripts/api-data/source-field-paths.json
git -C /home/shu/code/GuluGulu commit -m "feat: add TS field-path extractor for API diff

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Build the diff engine

**Files:**
- Create: `scripts/diff-api.ts`
- Modify: `scripts/reverse-api.ts` — add JSON path extraction + PAGES export

**Interfaces:**
- Consumes: `scripts/api-data/all-pages.json` (Task 1), `scripts/api-data/source-field-paths.json` (Task 2)
- Produces: `scripts/api-data/diff-report.json` — `{ "findings": [{ "severity": "CRITICAL|MAJOR|MINOR", "dimension": "missing-field|capture-error|parse-error", "sourceFile": "...", "codePath": "...", "actualShape": "...", "fix": "..." }] }`

- [ ] **Step 1: Add JSON path extraction and PAGES export to reverse-api.ts**

In `scripts/reverse-api.ts`, add this function after the `PAGES` array definition:

```typescript
/** Recursively extract all dot-separated leaf paths from a JSON object */
function extractJsonPaths(obj: any, prefix = ''): Set<string> {
  const paths = new Set<string>();
  if (obj === null || obj === undefined) return paths;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    paths.add(prefix);
    return paths;
  }
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      for (const p of extractJsonPaths(val, fullKey)) paths.add(p);
    } else {
      paths.add(fullKey);
    }
  }
  return paths;
}
```

Then replace `const PAGES: PageTarget[] = [` with:

```typescript
export const PAGES: PageTarget[] = [
```

In the capture loop, after `entry.lentilleContext = lentilleJson;`, add:

```typescript
if (entry.lentilleContext && !(entry.lentilleContext as any)._error) {
  entry.jsonPaths = [...extractJsonPaths(entry.lentilleContext)];
}
```

- [ ] **Step 2: Write the diff engine**

Create `scripts/diff-api.ts`:

```typescript
/**
 * Compare captured Luogu API JSON against GuluGulu source code field references.
 * Outputs severity-ranked diff report to scripts/api-data/diff-report.json
 *
 * Usage: npx esno scripts/diff-api.ts
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import { PAGES } from './reverse-api';

const DATA_DIR = path.resolve('scripts/api-data');

interface Finding {
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  dimension: string;
  sourceFile: string;
  codePath: string;
  actualShape: string;
  expectedShape: string;
  evidence: string;
  fix: string;
}

/** Map page names to regex that matches relevant source files */
const PAGE_TO_SOURCE: Record<string, RegExp> = {
  'home': /home/i,
  'problem-list': /problem.*list/i,
  'problem-detail': /problem.*detail|problemPage/i,
  'problem-detail-contentonly': /problem.*detail|problemPage/i,
  'contest-list': /contest.*list/i,
  'contest-detail': /contest.*detail|contestDetail/i,
  'ranking': /ranking/i,
  'discuss-list': /blog|discuss/i,
  'discuss-detail': /blog|discuss/i,
  'discuss-detail-contentonly': /blog|discuss/i,
  'user-profile': /user.*profile|userSpace/i,
  'training-list': /training/i,
  'training-detail': /training/i,
  'record-list': /record/i,
  'record-list-contentonly': /record/i,
  'solution': /solution/i,
  'article': /article/i,
  'search': /search/i,
};

function normalizePath(p: string): string {
  return p.replace(/\?\./g, '.');
}

async function main() {
  const pages = await fs.readJSON(path.join(DATA_DIR, 'all-pages.json'));
  const sourcePaths = await fs.readJSON(path.join(DATA_DIR, 'source-field-paths.json'));
  const findings: Finding[] = [];

  // Build page → captured JSON paths map
  const pagePaths: Record<string, Set<string>> = {};
  for (const [name, data] of Object.entries(pages) as [string, any][]) {
    if (data.jsonPaths) pagePaths[name] = new Set(data.jsonPaths);
  }

  // Dimension 1: Source field paths not found in captured JSON
  for (const [srcFile, paths] of Object.entries(sourcePaths) as [string, string[]][]) {
    for (const [pageName, pattern] of Object.entries(PAGE_TO_SOURCE)) {
      if (!pattern.test(srcFile)) continue;
      const captured = pagePaths[pageName];
      if (!captured || captured.size === 0) continue;

      for (const rawPath of paths) {
        const codePath = normalizePath(rawPath);

        // Remove prefix to match against lentille-context keys directly
        // e.g. "currentData.problem.pid" → try "currentData.problem.pid" and "problem.pid"
        const candidates = [codePath];
        for (const prefix of ['currentData.', 'data.']) {
          if (codePath.startsWith(prefix)) {
            candidates.push(codePath.slice(prefix.length));
          }
        }

        let found = false;
        for (const cand of candidates) {
          const parts = cand.split('.');
          for (let i = parts.length; i >= 1; i--) {
            const pre = parts.slice(0, i).join('.');
            if (captured.has(pre) || [...captured].some(p => p.startsWith(pre + '.'))) {
              found = true;
              break;
            }
          }
          if (found) break;
        }

        if (!found) {
          const topKey = codePath.split('.')[1] || codePath.split('.')[0];
          const nearby = [...captured]
            .filter(p => p.startsWith(topKey) || p.includes(topKey))
            .slice(0, 5)
            .join(', ') || '(none)';

          findings.push({
            severity: 'MAJOR',
            dimension: 'missing-field',
            sourceFile: srcFile,
            codePath,
            actualShape: `NOT FOUND; nearby: ${nearby}`,
            expectedShape: 'field exists in captured lentille-context or API response',
            evidence: `page: ${pageName}`,
            fix: `Verify ${codePath} exists in Luogu API; check field rename or removal`,
          });
        }
      }
    }
  }

  // Dimension 2: Capture errors (page load failures, JSON parse failures)
  for (const [name, data] of Object.entries(pages) as [string, any][]) {
    if (data.error) {
      findings.push({
        severity: 'CRITICAL',
        dimension: 'capture-error',
        sourceFile: `page:${name}`,
        codePath: '-',
        actualShape: data.error,
        expectedShape: 'successful page load',
        evidence: `${PAGES.find((p: any) => p.name === name)?.url || '?'}`,
        fix: 'URL may have changed or page requires auth; verify accessibility',
      });
    }
    if (data.lentilleContext?._error) {
      findings.push({
        severity: 'CRITICAL',
        dimension: 'parse-error',
        sourceFile: `page:${name}`,
        codePath: '#lentille-context',
        actualShape: data.lentilleContext._error,
        expectedShape: 'valid JSON',
        evidence: `preview: ${data.lentilleContext._preview || 'N/A'}`,
        fix: 'lentille-context selector or JSON format may have changed',
      });
    }
  }

  // Sort by severity: CRITICAL first
  const rank = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  await fs.writeJSON(path.join(DATA_DIR, 'diff-report.json'), { findings }, { spaces: 2 });
  console.log(`Diff: ${findings.length} findings`);
  console.log(`  CRITICAL: ${findings.filter(f => f.severity === 'CRITICAL').length}`);
  console.log(`  MAJOR: ${findings.filter(f => f.severity === 'MAJOR').length}`);
  console.log(`  MINOR: ${findings.filter(f => f.severity === 'MINOR').length}`);
}

main().catch((e: any) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Commit**

```bash
git -C /home/shu/code/GuluGulu add scripts/diff-api.ts scripts/reverse-api.ts
git -C /home/shu/code/GuluGulu commit -m "feat: add API diff engine comparing captured JSON to source paths

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Run full scan and generate initial diff report

**Files:** (none — generates `scripts/api-data/diff-report.json`)

- [ ] **Step 1: Run scanner + extractor + diff together**

```bash
cd /home/shu/code/GuluGulu && \
  npx esno scripts/reverse-api.ts 2>&1 && \
  npx esno scripts/extract-types.ts 2>&1 && \
  npx esno scripts/diff-api.ts 2>&1
```
Expected: three success messages, final counts of CRITICAL/MAJOR/MINOR

- [ ] **Step 2: Review top findings**

```bash
cd /home/shu/code/GuluGulu && python3 -c "
import json
d = json.load(open('scripts/api-data/diff-report.json'))
for f in d['findings'][:20]:
    print(f\"[{f['severity']}] {f['dimension']}: {f.get('codePath','-')}\")
    print(f\"  file: {f['sourceFile']}\")
    print(f\"  actual: {str(f.get('actualShape',''))[:100]}\")
    print(f\"  fix: {f.get('fix','')[:120]}\")
    print()
"
```
Expected: displays top 20 findings with severity, file, path, and fix suggestion

- [ ] **Step 3: Commit scan results**

```bash
git -C /home/shu/code/GuluGulu add scripts/api-data/
git -C /home/shu/code/GuluGulu commit -m "data: initial API scan diff report

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Fix CRITICAL findings

**Files:** Modify files identified in diff-report CRITICAL findings

- [ ] **Step 1: List all CRITICAL findings**

```bash
cd /home/shu/code/GuluGulu && python3 -c "
import json
d = json.load(open('scripts/api-data/diff-report.json'))
for f in d['findings']:
    if f['severity'] == 'CRITICAL':
        print(f\"  [{f['dimension']}] {f['sourceFile']}\")
        print(f\"    fix: {f['fix']}\")
        print()
"
```

- [ ] **Step 2-N: Fix each finding — one commit per file group**

For each CRITICAL finding:
1. Read the source file
2. Apply the fix
3. Run: `cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5`
4. Verify build passes (exit 0)

```bash
git -C /home/shu/code/GuluGulu add <modified files>
git -C /home/shu/code/GuluGulu commit -m "fix: resolve CRITICAL <dimension> — <codePath>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Fix MAJOR findings

**Files:** Modify files identified in diff-report MAJOR findings

Same pattern as Task 5: list → fix each → build verify → commit.

```bash
git -C /home/shu/code/GuluGulu add <modified files>
git -C /home/shu/code/GuluGulu commit -m "fix: resolve MAJOR <dimension> — <codePath>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Verification re-scan

**Files:** (none)

- [ ] **Step 1: Re-run the full pipeline**

```bash
cd /home/shu/code/GuluGulu && \
  npx esno scripts/reverse-api.ts 2>&1 && \
  npx esno scripts/extract-types.ts 2>&1 && \
  npx esno scripts/diff-api.ts 2>&1
```

- [ ] **Step 2: Verify zero CRITICAL + MAJOR**

```bash
cd /home/shu/code/GuluGulu && python3 -c "
import json
d = json.load(open('scripts/api-data/diff-report.json'))
c = [f for f in d['findings'] if f['severity'] == 'CRITICAL']
m = [f for f in d['findings'] if f['severity'] == 'MAJOR']
print(f'CRITICAL: {len(c)} (target 0)  {"✓" if len(c)==0 else "✗"}')
print(f'MAJOR: {len(m)} (target 0)  {"✓" if len(m)==0 else "✗"}')
"
```
Expected: CRITICAL=0 ✓, MAJOR=0 ✓

- [ ] **Step 3: Final build check**

```bash
cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5
```
Expected: all build steps succeed, exit 0

- [ ] **Step 4: Commit verification**

```bash
git -C /home/shu/code/GuluGulu add scripts/api-data/
git -C /home/shu/code/GuluGulu commit -m "verify: post-fix re-scan confirms zero CRITICAL/MAJOR findings

Co-Authored-By: Claude <noreply@anthropic.com>"
```
