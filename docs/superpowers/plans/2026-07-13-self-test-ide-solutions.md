# Self-Test IDE Rewrite & Solutions Embed & Code Templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite self-test to use Luogu's `/api/ide_submit` + WebSocket (no real submission records), embed solutions list in the Solutions tab, and fill all 31 language code templates.

**Architecture:** Three independent phases sharing only `ProblemDetail.vue`. Phase 1 adds `runIdeCode()` to `luogu-api.ts` and rewrites `_runTest()`. Phase 2 adds inline solution list loading to the Solutions tab. Phase 3 fills `getDefaultCode()` with all languages.

**Tech Stack:** Existing Vue 3 + browser WebSocket API + form-urlencoded fetch

## Global Constraints

- Build must stay green: `pnpm build` passes after every commit
- IDE submit uses form-urlencoded (`application/x-www-form-urlencoded`), not JSON
- CSRF token from `window.__guly_user.csrfToken`
- Follow existing code patterns (Composition API, `bew-*` CSS vars, UnoCSS attributify)

---

### Task 1: Add IDE submit API to luogu-api.ts

**Files:**
- Modify: `src/utils/luogu-api.ts`

**Interfaces:**
- Produces: `runIdeCode(opts: { code: string; lang: number; input: string; o2: boolean }): Promise<{ rid?: string; error?: string }>`

- [ ] **Step 1: Add `runIdeCode` function**

Add after the existing `submitCode` function in `src/utils/luogu-api.ts`:

```typescript
export async function runIdeCode(opts: {
  code: string; lang: number; input: string; o2: boolean
}): Promise<{ rid?: string; error?: string }> {
  const csrf = getCsrfToken()
  const params = new URLSearchParams({
    code: opts.code, lang: String(opts.lang), input: opts.input,
    o2: opts.o2 ? '1' : '0', 'csrf-token': csrf,
  })
  try {
    const res = await fetch('https://www.luogu.com.cn/api/ide_submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: params.toString(),
    })
    const json = await res.json()
    if (json?.data?.rid) return { rid: String(json.data.rid) }
    return { error: json?.errorMessage || 'IDE 提交失败' }
  } catch (e: any) { return { error: e.message || 'IDE 请求失败' } }
}
```

- [ ] **Step 2: Build**

```bash
cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5
```
Expected: all steps succeed

- [ ] **Step 3: Commit**

```bash
git -C /home/shu/code/GuluGulu add src/utils/luogu-api.ts
git -C /home/shu/code/GuluGulu commit -m "feat: add runIdeCode() for IDE self-test API

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Rewrite _runTest() to use IDE API + WebSocket

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`
  - Replace `_runTest()` function body
  - Add `runIdeCode` to the import from `~/utils/luogu-api`

- [ ] **Step 1: Update import**

Find the import line that imports from `luogu-api` and add `runIdeCode`:

```typescript
import { extractProblemData, isLoggedIn as checkLuoguLogin, LUOGU_LANGUAGES, runIdeCode, submitCode } from '~/utils/luogu-api'
```

- [ ] **Step 2: Replace `_runTest` function**

```typescript
async function _runTest() {
  if (!codeContent.value.trim()) { testVerdict.value = '无代码'; return }
  if (!isLoggedIn.value) { testVerdict.value = '请先登录'; return }

  testRunning.value = true
  testVerdict.value = ''
  testActualOutput.value = '编译运行中…'

  const result = await runIdeCode({
    code: codeContent.value, lang: selectedLang.value.id,
    input: testInput.value, o2: enableO2.value,
  })

  if (result.error || !result.rid) {
    testRunning.value = false
    testVerdict.value = '失败'
    testActualOutput.value = result.error || 'IDE 提交失败'
    return
  }

  let resolved = false
  const ws = new WebSocket('wss://ws.luogu.com.cn/ws')
  const timeout = setTimeout(() => {
    if (!resolved) { resolved = true; ws.close(); testRunning.value = false; testVerdict.value = '超时'; testActualOutput.value = '评测超时，请重试' }
  }, 15000)

  ws.onopen = () => ws.send(JSON.stringify({ type: 'join_channel', channel: 'ide.track', channel_param: result.rid }))
  ws.onmessage = (event) => {
    if (resolved) return
    try {
      const msg = JSON.parse(event.data)
      if (msg._ws_type === 'heartbeat' || msg._ws_type === 'join_result') return
      resolved = true; clearTimeout(timeout); ws.close(); testRunning.value = false
      const data = msg.result || msg.data || msg
      if (data?.compileError || data?.compile?.message) {
        testVerdict.value = 'CE'; testActualOutput.value = data.compileError || data.compile?.message || '编译错误'
      } else if (data?.output !== undefined) {
        testActualOutput.value = String(data.output)
        const exp = testExpectedOutput.value.trim()
        testVerdict.value = exp ? (String(data.output).trim() === exp ? 'AC' : 'WA') : '运行完成'
      } else {
        testVerdict.value = '完成'; testActualOutput.value = JSON.stringify(data, null, 2)
      }
    } catch {}
  }
  ws.onerror = () => {
    if (!resolved) { resolved = true; clearTimeout(timeout); testRunning.value = false; testVerdict.value = '错误'; testActualOutput.value = 'WebSocket 连接失败' }
  }
}
```

- [ ] **Step 3: Build**

```bash
cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5
```
Expected: all steps succeed

- [ ] **Step 4: Commit**

```bash
git -C /home/shu/code/GuluGulu add src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git -C /home/shu/code/GuluGulu commit -m "feat: rewrite self-test with IDE API + WebSocket

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Embed solutions list in Solutions tab

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue`

- [ ] **Step 1: Add state and fetch function**

Add after the `discussions` ref:

```typescript
const solutions = ref<Array<{ id: number; title: string; author: any; time: number; votes: number }>>([])
const solutionsLoading = ref(false)
async function loadSolutions() {
  if (solutionsLoading.value) return
  solutionsLoading.value = true
  try {
    const res = await fetch(`https://www.luogu.com.cn/problem/solution/${problemId.value}`, { credentials: 'same-origin' })
    const html = await res.text()
    const m = html.match(/<script\s+id="lentille-context"\s+type="application\/json"[^>]*>([^<]*)<\/script>/)
    if (m?.[1]) {
      const ctx = JSON.parse(m[1])
      const list = ctx?.data?.solutions?.result || ctx?.currentData?.solutions?.result || []
      solutions.value = list.map((s: any) => ({
        id: s.id || 0, title: s.title || '', author: s.author || {}, time: s.time || 0, votes: s.votes || s.thumbUp || 0,
      }))
    }
  } catch {}
  solutionsLoading.value = false
}
```

- [ ] **Step 2: Trigger load on Solutions tab switch**

Add to `handleTabChange` after `submitError.value = ''`:

```typescript
  if (tab === 'solutions' && solutions.value.length === 0) loadSolutions()
```

- [ ] **Step 3: Replace Solutions tab template**

Replace the `v-else-if="activeTab === 'solutions'"` block with:

```html
<div v-else-if="activeTab === 'solutions'" key="solutions"
  bg="$bew-content" rounded="$bew-radius" p-6
  shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
  border="1 $bew-border-color" style="backdrop-filter: var(--bew-filter-glass-1)">
  <Loading v-if="solutionsLoading" />
  <div v-else-if="solutions.length === 0" flex="~ col" items="center" justify="center" py-12 text="$bew-text-2">
    <span style="display:contents" v-html="renderIcon('mingcute:bulb-line', 48)" />
    <p text="lg" mt-4 mb-2>暂无题解</p>
    <p text="sm $bew-text-3" mb-4>这道题目还没有题解</p>
  </div>
  <div v-else>
    <h2 mb-4 style="font-size:var(--bew-base-font-size);font-weight:700;color:var(--bew-text-1)">题解 ({{ solutions.length }})</h2>
    <div v-for="(s, idx) in solutions" :key="s.id" class="stagger-row hover:bg-$bew-fill-2"
      :style="{ '--row-index': idx }" p="x-4 y-3" flex="~ items-center gap-4"
      border="b-1 $bew-border-color" cursor="pointer" duration-200
      @click="navigateTo(AppPage.Solution, `https://www.luogu.com.cn/problem/solution/${problemId}?sid=${s.id}`)">
      <div flex="1" min-w-0>
        <div style="font-size:var(--bew-base-font-size);color:var(--bew-text-1);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ s.title }}</div>
        <div flex="~ items-center gap-2" mt-1>
          <img :src="s.author?.avatar" style="width:20px;height:20px;border-radius:50%;object-fit:cover" @error="(e:any) => { e.target.style.display = 'none' }">
          <span text="xs" :style="{ color: s.author?.color ? `var(--bew-${s.author.color})` : 'var(--bew-text-2)' }">{{ s.author?.name }}</span>
          <span text="xs $bew-text-3">{{ timeAgo(s.time) }}</span>
        </div>
      </div>
      <div flex="~ items-center gap-1" shrink-0 text="sm $bew-text-3">
        <span style="display:contents" v-html="renderIcon('mingcute:thumb-up-line', 14)" />{{ s.votes }}
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Build and commit**

```bash
cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5
git -C /home/shu/code/GuluGulu add src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git -C /home/shu/code/GuluGulu commit -m "feat: embed solutions list in Solutions tab

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Fill all 31 language code templates

**Files:**
- Modify: `src/contentScripts/views/ProblemDetail/ProblemDetail.vue` — replace `getDefaultCode()`

- [ ] **Step 1: Replace `getDefaultCode`**

```typescript
function getDefaultCode(lang: number): string {
  const t: Record<number, string> = {
    1: 'program APlusB;\nvar a, b: longint;\nbegin\n    readln(a, b);\n    writeln(a + b);\nend.\n',
    2: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d%d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
    3: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    4: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    5: '',
    7: 's = input().split()\nprint(int(s[0]) + int(s[1]))\n',
    8: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner cin = new Scanner(System.in);\n        int a = cin.nextInt(), b = cin.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
    9: 'const fs = require("fs");\nconst data = fs.readFileSync("/dev/stdin");\nconst result = data.toString("ascii").trim().split(" ").map(x => parseInt(x)).reduce((a, b) => a + b, 0);\nconsole.log(result);\nprocess.exit();\n',
    10: 'a = io.read("*n")\nb = io.read("*n")\nprint(a + b)\n',
    11: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    12: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    13: 'Scanf.scanf "%i %i\\n" (fun a b -> print_int (a + b))\n',
    14: 'package main\n\nimport "fmt"\n\nfunc main() {\n    var a, b int\n    fmt.Scanf("%d%d", &a, &b)\n    fmt.Println(a + b)\n}\n',
    15: 'use std::io;\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_line(&mut input).unwrap();\n    let mut s = input.trim().split(\' \');\n    let a: i32 = s.next().unwrap().parse().unwrap();\n    let b: i32 = s.next().unwrap().parse().unwrap();\n    println!("{}", a + b);\n}\n',
    16: '<?php\n$input = trim(file_get_contents("php://stdin"));\nlist($a, $b) = explode(\' \', $input);\necho $a + $b;\n',
    17: 'using System;\n\npublic class APlusB {\n    private static void Main() {\n        string[] input = Console.ReadLine().Split(\' \');\n        Console.WriteLine(int.Parse(input[0]) + int.Parse(input[1]));\n    }\n}\n',
    18: 'a, b = gets.split.map(&:to_i)\nprint a + b\n',
    19: 'main = do\n    [a, b] <- (map read . words) `fmap` getLine\n    print (a + b)\n',
    20: 'fun main(args: Array<String>) {\n    val (a, b) = readLine()!!.split(\' \').map(String::toInt)\n    println(a + b)\n}\n',
    21: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner cin = new Scanner(System.in);\n        int a = cin.nextInt(), b = cin.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
    22: 'import java.util.Scanner\n\nobject Main {\n    def main(args: Array[String]): Unit = {\n        val cin = new Scanner(System.in)\n        val a = cin.nextInt()\n        val b = cin.nextInt()\n        println(a + b)\n    }\n}\n',
    23: 'nums = map(x -> parse(Int, x), split(readline(), " "))\nprintln(nums[1] + nums[2])\n',
    24: 's = raw_input().split()\nprint int(s[0]) + int(s[1])\n',
    25: 's = input().split()\nprint(int(s[0]) + int(s[1]))\n',
    26: 'my $in = <STDIN>;\nchomp $in;\n$in = [split /[\\s,]+/, $in];\nmy $c = $in->[0] + $in->[1];\nprint "$c\\n";\n',
    27: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    28: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
    29: 'open System\n\n[<EntryPoint>]\nlet main argv =\n    let input = Console.ReadLine().Split(\' \')\n    let a = int input.[0]\n    let b = int input.[1]\n    printfn "%d" (a + b)\n    0\n',
    31: 'import std.stdio;\n\nvoid main() {\n    int a, b;\n    readf("%d %d", &a, &b);\n    writeln(a + b);\n}\n',
    34: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
  }
  return t[lang] || ''
}
```

- [ ] **Step 2: Build and commit**

```bash
cd /home/shu/code/GuluGulu && pnpm build 2>&1 | tail -5
git -C /home/shu/code/GuluGulu add src/contentScripts/views/ProblemDetail/ProblemDetail.vue
git -C /home/shu/code/GuluGulu commit -m "feat: add code templates for all 31 Luogu languages

Co-Authored-By: Claude <noreply@anthropic.com>"
```
