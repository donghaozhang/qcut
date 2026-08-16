# TextAnim 家族 — 格式解密与续做清单

# TextAnim Family — Format Decoded & Work Queue

承接 [README.md](./README.md)。本文档记录 TextAnim 家族(120 个去重未移植包)的普查结果、
**已完全解密的数据格式**、可直接复用的解码器,以及 7 个首批目标的逐个进度。
未完成原因是 harness 权限闸门(见 README §3),不是技术障碍。

Continues from [README.md](./README.md). Records the TextAnim family survey (120 deduped
unported packages), the **fully decoded data format**, a reusable decoder, and per-preset
progress on the first 7 targets. Work stopped on the harness permission gate
(README §3), not on any technical obstacle.

---

## 1. 普查结果 / Survey results

判据:driver 是否真的写 `char.position / char.scale / char.rotate / char.color`
(正则计数 `charWrites`),对照 shader/material 调用数 `shaderHits`。

Criterion: does the driver actually write `char.position / scale / rotate / color`
(regex count `charWrites`), weighed against shader/material call count `shaderHits`.

| verdict | 数量 | 入场 | 出场 | 循环 | 字幕 |
|---|---|---|---|---|---|
| **char-math**(有真字符动画数学) | **77** | 27 | 12 | 25 | 13 |
| shader-only(字形不动) | 40 | 23 | 11 | 6 | — |
| mixed | 3 | 1 | 1 | 1 | — |

普查数据在 `textanim_survey.json`(120 条,含每包 `effect_id / charWrites / shaderHits /
verdict`)。**注意:该文件在会话临时目录,会随会话销毁**;重建方法见 README §5,判据脚本
在本文档 §3。

Survey data lives in `textanim_survey.json` (120 rows). **It is in session temp and will be
destroyed**; rebuild per README §5, triage script in §3 below.

---

## 2. 数据格式 — 已完全解密 / Data format — fully decoded ⭐

这是本文档最有价值的部分。TextAnim 家族里的 **External_Producer** 包结构:

The most valuable part of this document. **External_Producer** packages in the TextAnim
family are laid out as:

```
files/
  lua/TextAnim.lua              引擎(~1200 行,各包基本一致)/ engine, near-identical across packages
  lua/src/AE.lua                ← 关键帧数据 / the keyframe data
  lua/src/TextMain.lua          ← 逐包定制的驱动逻辑 / the per-package driver
  lua/src/common/AEAdapter.lua  解码器(各包一致)/ decoder, identical across packages
  lua/src/common/Utils.lua      bezier4x2y 等 / bezier solver etc.
  extra.json                    {"setting": {"animation_duration": N}}
```

### 2.1 AE.lua 轨道结构 / Track structure

```lua
["ADBE Scale"] = {
    ["d"] = 3,                            -- 分量数 / dimensions
    ["k"] = { {t, v1, v2, v3}, ... },     -- 关键帧:时间 + 各分量值 / keys: time + per-component values
    ["s"] = {                             -- 段:每段一个 o/i 手柄对 / segments: one o/i handle pair each
        { ["o"] = {{t, v}, ...}, ["i"] = {{t, v}, ...} },   -- d>1 时每分量一对 / one pair per component when d>1
        ...
    }
}
```

### 2.2 关键结论:手柄是**绝对坐标** / Key finding: handles are ABSOLUTE

由 `AEAdapter._interpolateScalar` 确证 —— 它直接把 `(K0.t, O.t, I.t, K1.t)` 当作 x 控制点、
`(K0.v, O.v, I.v, K1.v)` 当作 y 控制点喂给 `bezier4x2y` 求解。因此**一一对应** QCut 的
`TextKeyframePoint`:

Confirmed by `AEAdapter._interpolateScalar`: it feeds `(K0.t, O.t, I.t, K1.t)` as x control
points and `(K0.v, O.v, I.v, K1.v)` as y control points straight into `bezier4x2y`. So the
mapping onto QCut's `TextKeyframePoint` is one-to-one:

| AE | QCut | 说明 |
|---|---|---|
| `K[i][0]` | `t` | 除以轨道跨度归一化到 0..1 / divide by track span |
| `K[i][c+1]` | `v` | 分量 c 的值 / component c value |
| `S[i].o[c][0] − K[i][0]` | `outTime` | 绝对时间转相对 / absolute → relative |
| `S[i].o[c][1]` | `outValue` | 直接取值 / verbatim |
| `S[i−1].i[c][0] − K[i][0]` | `inTime` | 结果为负 / comes out negative |
| `S[i−1].i[c][1]` | `inValue` | 直接取值 / verbatim |

`S[i].hold == true` → 阶跃保持,不发手柄 / step-hold, emit no handles.

**这条规则对全部 120 个 TextAnim 包通用**,不需要每个包重新推导。

**This rule holds for all 120 TextAnim packages** — no per-package re-derivation needed.

### 2.3 空间轨道 / Spatial tracks

`["spatial"] = true` 的轨道(通常是 `ADBE Position`)不同:`s[1].p` 是预计算的弧长表,
`p[0]` 是累积弧长数组,`p[1..d]` 是各分量的采样点。求值分两步:

Tracks with `["spatial"] = true` (usually `ADBE Position`) differ: `s[1].p` is a
precomputed arc-length table — `p[0]` is cumulative arc length, `p[1..d]` are per-component
samples. Evaluation is two-stage:

1. 用 `(K0.t, o[0], i[0], K1.t)` × `(0, o[1], i[1], totalLength)` 的贝塞尔把时间映射到弧长
   Map time → arc length through the bezier on `(K0.t, o[0], i[0], K1.t)` × `(0, o[1], i[1], total)`
2. 在弧长表里二分查位置,线性插值取各分量
   Binary-search that arc length in the table and lerp the components

**陷阱**:手柄时间可能退化(实测 随机上升 的 `i = {0, 234}`,in-handle 时间 0 早于段起点),
x 控制点非单调,闭式手柄转换不成立 —— **这类轨道必须数值采样**(解码器的 `samples` 参数)。

**Trap**: handle times can be degenerate (随机上升 has `i = {0, 234}` — in-handle time 0,
earlier than the segment start), making the x control points non-monotonic so closed-form
handle conversion breaks down. **Such tracks must be numerically sampled** (the decoder's
`samples` argument).

---

## 3. 可复用脚本 / Reusable scripts

放在 scratchpad 根目录下运行(与 `packages/` 同级)。

Run from the scratchpad root (sibling of `packages/`).

### 3.1 `decode_ae.py` — AE.lua → QCut 关键帧

用法 / Usage:`python3 decode_ae.py <effect_id> [span] [samples]`
`span` 是归一化除数(通常等于 driver 的 `CHAR_DURATION`);`samples` > 0 时对空间轨采样。

```python
import re, sys, json

def parse_lua(src):
    """Minimal Lua-table parser for these AE.lua files."""
    i = 0
    def skip():
        nonlocal i
        while i < len(src):
            if src[i] in " \t\r\n,;": i += 1
            elif src.startswith("--", i):
                j = src.find("\n", i); i = len(src) if j < 0 else j
            else: break
    def value():
        nonlocal i
        skip()
        if src[i] == "{":
            i += 1
            arr, obj = [], {}
            while True:
                skip()
                if src[i] == "}":
                    i += 1; break
                if src[i] == "[":                      # ["key"] = v
                    j = src.index("]", i)
                    key = src[i+1:j].strip().strip('"\'')
                    i = j + 1; skip()
                    assert src[i] == "="; i += 1
                    obj[key] = value()
                else:
                    m = re.match(r'([A-Za-z_]\w*)\s*=', src[i:])
                    if m:
                        i += m.end(); obj[m.group(1)] = value()
                    else:
                        arr.append(value())
            return obj if obj else arr
        m = re.match(r'-?\d+\.?\d*(?:[eE][-+]?\d+)?', src[i:])
        if m:
            i += m.end(); return float(m.group(0))
        m = re.match(r'(true|false)', src[i:])
        if m:
            i += m.end(); return m.group(1) == "true"
        m = re.match(r'"([^"]*)"', src[i:])
        if m:
            i += m.end(); return m.group(1)
        raise ValueError(f"parse at {src[i:i+40]!r}")
    j = src.index("=", src.index("local AE"))
    i = j + 1
    return value()

def bez_y(x1,x2,x3,x4, y1,y2,y3,y4, T):
    lo, hi = 0.0, 1.0
    for _ in range(60):
        s = (lo+hi)/2
        x = (1-s)**3*x1 + 3*(1-s)**2*s*x2 + 3*(1-s)*s*s*x3 + s**3*x4
        if x < T: lo = s
        else: hi = s
    s = (lo+hi)/2
    return (1-s)**3*y1 + 3*(1-s)**2*s*y2 + 3*(1-s)*s*s*y3 + s**3*y4

def track_keys(track, comp=0, span=None, samples=0):
    """Return QCut-style keys normalised to 0..1 over `span` (default: key range)."""
    K = track["k"]; S = track.get("s", [])
    t0, t1 = K[0][0], K[-1][0]
    span = span or t1
    if track.get("spatial"):
        P = S[0]["p"]; L = P[0]; total = L[-1]
        O, I = S[0]["o"], S[0]["i"]
        out = []
        n = samples or 9
        for m in range(n):
            T = t0 + (t1-t0)*m/(n-1)
            l = bez_y(K[0][0], O[0], I[0], K[-1][0], 0, O[1], I[1], total, T)
            k = max(0, min(len(L)-2, next((z for z in range(len(L)-1) if L[z] <= l <= L[z+1]), 0)))
            f = 0 if L[k+1] == L[k] else (l - L[k])/(L[k+1]-L[k])
            v = P[comp+1][k] + (P[comp+1][k+1] - P[comp+1][k])*f
            out.append({"t": round(T/span, 4), "v": round(v, 4)})
        return out
    pts = []
    for idx, key in enumerate(K):
        p = {"t": round(key[0]/span, 4), "v": round(key[comp+1], 4)}
        if idx > 0 and idx-1 < len(S) and not S[idx-1].get("hold"):
            I = S[idx-1]["i"]; ih = I[comp] if isinstance(I[0], list) else I
            p["inValue"] = round(ih[1], 4); p["inTime"] = round((ih[0]-key[0])/span, 4)
        if idx < len(S) and not S[idx].get("hold"):
            O = S[idx]["o"]; oh = O[comp] if isinstance(O[0], list) else O
            p["outValue"] = round(oh[1], 4); p["outTime"] = round((oh[0]-key[0])/span, 4)
        pts.append(p)
    return pts

def dump(eid, span=None, samples=0):
    src = open(f"packages/{eid}/files/lua/src/AE.lua", encoding="utf-8").read()
    ae = parse_lua(src)
    def walk(node, prefix=""):
        for name, tr in node.items():
            if isinstance(tr, dict) and "k" in tr:
                d = int(tr.get("d", 1))
                print(f"  {prefix}{name}  d={d} span={tr['k'][-1][0]} spatial={bool(tr.get('spatial'))}")
                for c in range(min(d, 2 if tr.get("spatial") else d)):
                    print(f"    [{c}] {json.dumps(track_keys(tr, c, span, samples))}")
            elif isinstance(tr, dict):
                walk(tr, prefix + name + "/")
    print(f"=== {eid} ===")
    walk(ae)

if __name__ == "__main__":
    dump(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else None,
         int(sys.argv[3]) if len(sys.argv) > 3 else 0)
```

### 3.2 普查判据 / Triage predicate

```python
CHAR_WRITE   = re.compile(r"\bchar(?:s\[\w+\]|\w*)?\.(position|scale|rotate|color|alpha)\s*=")
LETTER_WRITE = re.compile(r"\bletter\w*\.(position|scale|rotate|color|posX|posY)\s*=")
SHADER       = re.compile(r"setFloat|setVector|\.material|Material|uniform|u_[A-Za-z]")
# verdict: charWrites>=2 → char-math; ==1 → mixed; ==0 → shader-only
# 最优候选:char-math 且 shaderHits<=5 且 panel!=caption
```

---

## 4. 首批 7 个目标 / First 7 targets

| # | 剪映名 | effect_id | 相位 | 时长 | charWrites | 状态 |
|---|---|---|---|---|---|---|
| 1 | 逐字旋出 | 7229520513586958908 | exit | 1.5 | 28 | ✅ **已完全转录**,见 §4.1 |
| 2 | 随机上升 | 7233662263805088314 | entrance | 1.5 | 26 | ⚠️ driver 已解,位置轨待数值采样,见 §4.2 |
| 3 | 炸开 Ⅲ | 7308274161992864266 | exit | 1.2 | 16 | ⬜ 未开始 |
| 4 | 随机集合 | 7223959789175312954 | entrance | 2.5 | 14 | ⬜ 未开始 |
| 5 | 放大缩小 | 7224077152587616805 | loop | — | 12 | ⬜ 未开始 |
| 6 | 拉住 | 7221747595884892731 | loop | 1.2 | 12 | ⬜ 未开始 |
| 7 | 二段缩放 | 7238519014866031162 | exit | 1.5 | 8 | ⬜ 未开始 |

### 4.1 逐字旋出 → `spin-out-each` ✅ 可直接粘贴

**driver 语义**(`TextMain.lua`):`CHAR_INTERVAL = 3/30 = 0.1s`,`CHAR_DURATION = 33/30 = 1.1s`,
每字窗口 `[(i−1)·0.1, +1.1]`。**关键:`elapsed = env.duration − elapsed` 整条倒放** ——
AE 轨写的是入场,倒过来才是出场。窗口外:之前 `scale=0`(隐藏),之后恒等。
锚点 `(0, −0.3·height)`,配 `pos.y += height·0.3·(scale−1)` 补偿。

**Driver semantics**: per-char window of 1.1 s staggered by 0.1 s; **the whole thing plays
in reverse** (`elapsed = duration − elapsed`), so the AE tracks describe an entrance and the
exit is their time-reversal. Anchor `(0, −0.3·height)` with `pos.y += height·0.3·(scale−1)`.

**符号链**/ sign chain:driver 写 `rotate.z = −z_AE`,Amaz→CSS 再取反一次 ⇒ `rotationDeg = +z_AE`。
**stagger**:`staggerRatio = (n−1)·0.1 / ((n−1)·0.1 + 1.1)`,6 字 → 0.31;`order` 为 `reverse`
(倒放使最后一个字先动)。

```ts
"spin-out-each": {
    sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.31 },
    effect: {
        kind: "keyframes",
        channels: {
            scaleX: [
                { t: 0, v: 1, outValue: 1, outTime: 0.076 },
                { t: 0.455, v: 0.95, inValue: 0.95, inTime: -0.076, outValue: 0.95, outTime: 0.051 },
                { t: 0.758, v: 1.3, inValue: 1.3, inTime: -0.051, outValue: 1.3, outTime: 0.158 },
                { t: 1, v: 0.35, inValue: 0.508, inTime: -0.04 },
            ],
            scaleY: [
                { t: 0, v: 1, outValue: 1, outTime: 0.076 },
                { t: 0.455, v: 0.95, inValue: 0.95, inTime: -0.076, outValue: 0.95, outTime: 0.051 },
                { t: 0.758, v: 1.3, inValue: 1.3, inTime: -0.051, outValue: 1.3, outTime: 0.158 },
                { t: 1, v: 0.35, inValue: 0.508, inTime: -0.04 },
            ],
            rotationDeg: [
                { t: 0, v: 0, outValue: 0, outTime: 0.076 },
                { t: 0.455, v: 5, inValue: 5, inTime: -0.076, outValue: 5, outTime: 0.051 },
                { t: 0.758, v: -25, inValue: -25, inTime: -0.051, outValue: -25, outTime: 0.158 },
                { t: 1, v: 46, inValue: 34.167, inTime: -0.04 },
            ],
            // 锚点补偿:0.3·(1 − scale),与 scale 轨的仿射拷贝
            // Anchor compensation: 0.3·(1 − scale), an affine copy of the scale track
            translateYEm: [
                { t: 0, v: 0, outValue: 0, outTime: 0.076 },
                { t: 0.455, v: 0.015, inValue: 0.015, inTime: -0.076, outValue: 0.015, outTime: 0.051 },
                { t: 0.758, v: -0.09, inValue: -0.09, inTime: -0.051, outValue: -0.09, outTime: 0.158 },
                { t: 1, v: 0.195, inValue: 0.148, inTime: -0.04 },
            ],
            opacity: [
                { t: 0, v: 1 },
                { t: 0.848, v: 1, outValue: 0.858, outTime: 0.025 },
                { t: 1, v: 0.15, inValue: 0.292, inTime: -0.025 },
            ],
        },
    },
},
```

集成参数 / Integration params:`presetId: "spin-out-each"`,`enName: "Spin out each"`,
`zhName: "逐字旋出"`,`previewKind: "keyframes"`,`defaultDuration: 1.5`,phase `exit`。
**注**:源在窗口外把 scale 硬切为 0,即末帧 scale 0.35 / alpha 0.15 后突然消失 —— 已忠实转录,
因为那时字已近乎不可见,无观感问题。

**Note**: the source hard-snaps scale to 0 outside the window, so the last visible frame
(scale 0.35, alpha 0.15) pops out. Transcribed faithfully — at that point the glyph is
already all but invisible.

### 4.2 随机上升 → `random-rise` ⚠️ 差一条曲线

**driver 语义**:`CHAR_DURATION = 1s`,`unitDelay = 1/30`,
`Utils.createOrderList(#line, 0, 1, true)` 最后一个参数 `true` = **打乱** ⇒ `order: "random"`。
每字 `t = elapsed − delay`:`t<=0` 隐藏(alpha 0 + scale 0),`t>=1` 恒等,区间内:

- `opacity = AE.opacity(t) × 0.01`,但**仅在 `t < 0.7·CHAR_DURATION` 时施加**,之后强制 alpha 1
- `py = (AE.position(t).y − 352.5) / 800`;`pos.y −= py · char.height · 4`
  ⇒ 源 y 向上为正,故 **CSS `translateYEm = +4·py`**,起始 `py = 233.975/800 = 0.2925` ⇒ **1.17 em**

**stagger**:每字窗口 = `1 / ((n−1)/30 + 1)`,8 字 → 0.811 ⇒ `staggerRatio ≈ 0.19`。

**opacity 轨**(已解,span 1.0,值 ÷100)—— 注意末段是**闪烁**:

```
keys: (0, 0) (0.5667, 100) (0.7333, 100) (0.8, 30) (0.8667, 100) (0.9333, 20) (1, 100)
handles: o=(0.0944,16.667) i=(0.4722,83.333) | o=(0.5944,100) i=(0.7056,100)
         o=(0.7444,88.333) i=(0.7889,41.667) | o=(0.8111,41.667) i=(0.8556,88.333)
         o=(0.8778,86.667) i=(0.9222,33.333) | o=(0.9444,33.333) i=(0.9889,86.667)
```
按 §2.2 规则直接转换即可(除以 100 得 0..1)。**但注意 driver 只在 t<0.7 施加 alpha**,
所以 0.7 之后的闪烁段实际被 `alpha=1` 覆盖 —— 转录时应在 `t=0.7` 截断并保持 1。

**position 轨** ⚠️:`spatial = true`,直线上升(x 恒定 383.387,y 586.475 → 352.475,总弧长 234),
但 in-handle 退化(`i = {0, 234}`,时间 0 早于段起点),x 控制点非单调 ⇒
**必须用 `decode_ae.py 7233662263805088314 1.0 9` 数值采样 9 个点**,这是唯一缺口。
采样后 `translateYEm[k] = 4 × (y_k − 352.5) / 800`,轨道跨度 0.6667(占字窗口前 2/3)。

The position track is the only gap: run the decoder with sampling, then map each sampled
`y` through `translateYEm = 4·(y − 352.5)/800`. The track spans the first 2/3 of the char
window.

---

## 5. 续做流程 / Resume procedure

闸门解除后(README §3),每个预设按这个循环:

Once the gate is clear (README §3), each preset follows this loop:

1. `Read packages/<id>/files/lua/src/TextMain.lua` — 拿 driver 语义:窗口长度、错峰间隔、
   顺序(是否 shuffle)、是否倒放、锚点补偿、各轨道怎么落到字符属性上
2. `python3 decode_ae.py <id> <CHAR_DURATION> [samples]` — 拿归一化关键帧
3. 按 README §5 的通用映射规则组装 `TextKeyframeDocument`(Y 取反、rotate 取反、
   1000 单位 ≈ 1 em、颜色轨走乘法 tint)
4. 追加到 `apps/web/src/lib/text/text-animation-presets/keyframe-documents-textanim.ts`
   (新文件,**每文件 < 800 行**,biome 格式化后行数约翻倍)
5. 接线五处:index / catalog / i18n(zh+en)/ RESTART(循环不回起点时)/ intensity 闸门
6. 验证:biome → `bun check-types` → preset registry + translations 测试 → 逐文件 commit

---

## 6. 后续候选 / Next candidates

7 个做完后,`textanim_survey.json` 里 **char-math 且 shaderHits ≤ 5** 的还有一批,
按 charWrites 降序:波浪弹跳(18)、站起(16)、躺下(16)、甩出(12)、甩回(12)、
旋转缩放(12)、拉开(10)、二段缩放(8)……共 77 个 char-math 候选,是目前最大的可移植池。

After these 7, `textanim_survey.json` still holds the rest of the 77 char-math candidates —
the largest remaining portable pool. Sorted by `charWrites`: 波浪弹跳 (18), 站起 (16),
躺下 (16), 甩出 (12), 甩回 (12), 旋转缩放 (12), 拉开 (10) …
