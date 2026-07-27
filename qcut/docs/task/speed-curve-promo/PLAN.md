# 曲线变速宣传片制作方案(CLI + 虚拟鼠标全自动)

> 目标:用 QCut 自己的 CLI 和虚拟鼠标(Agent Pointer),全自动录制一支 25–35 秒的
> "曲线变速 / 子弹时间" 功能宣传片 —— 从素材生成、导入、界面操作演示到成片导出,
> 全程零人工点击。宣传片本身就是 "QCut 可以被 Agent 驱动" 的最佳证明。

---

## 1. 工具能力速查(调研结论)

### 1.1 CLI 调用方式

| 方式 | 命令 | 说明 |
|---|---|---|
| 仓库内(推荐,无需 build) | `bun run pipeline <cmd>`(在 `qcut/` 目录下) | 直接跑 `electron/native-pipeline/cli/cli.ts` |
| 全局二进制 | `qcut <cmd>` / `qcut-pipeline <cmd>` | 编译快照,改过 CLI 代码必须先 `bun run build` |
| 两种命令形式 | `editor:pointer:click ...` 或 `qcut editor pointer click ...` | 冒号形式与空格形式等价 |

通用 flag:`--json`(机器输出)、`--speed <倍率>`(整体加/减速所有动画)、
`--resume <session>`(粘性会话)。除 `editor:screen-recording:*` 会自动拉起无头实例外,
**其它 `editor:*` 命令都要求 QCut 已在运行**(严格用 `bun run electron` 启动)。

### 1.2 虚拟鼠标(Agent Pointer)

- 渲染层 DOM 覆盖层(`agent-pointer-overlay.tsx`):青色光标 + 点击琥珀色脉冲圈 +
  拖拽轨迹线 + "Agent 正在操作" 状态条。**录屏里可见** —— 这就是宣传片里的"演员的手"。
- 移动带 cubic ease-out 缓动,视觉效果自然;默认走 CDP 后台输入,**窗口不需要前台焦点**
  (但 DevTools 必须关闭,否则 debugger 附加失败)。
- 定位方式四选一:`--target <语义名>`(如 `panel.media`、`timeline.play`、
  `testid:<任意data-testid>`)、`--ref @eN`(来自 `editor:snapshot`)、`--x/--y`
  (CSS 像素)、`--normalized-x/-y`(0–1 比例)。
- 关键命令:`editor:pointer:move|hover|click|double-click|drag|scroll`、
  `editor:keyboard:press|type`。点击/拖拽类属于 confirm 级动作,脚本里要带 `--force`。
- **`editor:pointer:sequence --actions @actions.json --record demo.mp4`**:
  一条命令跑完整个动作序列并同步录屏(preroll/postroll 默认 700ms)。
- **`editor:demo:run --plan plan.json --record demo.mp4`**(终极形态):
  建项目 → 应用时间线 manifest → 预热面板 → 跑动作序列并录屏 → 校验录像 → 导出 → 校验成片,
  一条命令全包。

### 1.3 录屏

- `editor:screen-recording:start/stop`:默认录 **QCut 编辑器窗口本身**,30fps,
  成片恒为 MP4(H.264 CRF17 + faststart);`--recording-quality native|1080p|1440p|4k`。
- demo:run / pointer:sequence 的 `--record` 默认校验分辨率 ≥1920×1080 ——
  **录制前把 QCut 窗口开到全屏**(Retina 下逻辑 1728px 宽也会被放大档位兜住,
  稳妥起见用 `--recording-quality 1080p` 以上并全屏窗口)。
- macOS 首次需要"屏幕录制"TCC 权限(dev 模式授权对象是 Electron)。
- 录完还可以做后期增强:把 MP4 导入项目后
  `editor:export:start --cursor-sway 1.0 --cursor-blur 0.3 --zoom-blur 0.3` 合成摆动光标/缩放模糊。

### 1.4 曲线变速功能(要拍的主角)

入口:时间线选中片段 → 右侧属性面板 **变速** tab(`data-testid="media-speed-properties"`)
→ 三个子模式:**常规变速** / **曲线变速** / **变速卡点**。

- 6 条曲线预设(卡片自带黄色迷你曲线缩略图):蒙太奇、英雄时刻、**子弹时间**
  (4x → 0.2x → 4x,经典 Matrix 节奏)、跳接、闪进、闪出。
  testid:`speed-curve-preset-{montage|hero|bullet|jump|flash-in|flash-out}`。
- 曲线编辑器(`speed-curve-editor`):可拖拽的速度点(双向拖动)、播放头白色细线实时骑在
  曲线上、点击曲面直接 seek 预览、`speed-curve-point-toggle`(+/− 加减速度点)、
  `speed-curve-reset`(重置)、时长实时读数("10.0s → 4.2s")。
- **预览完全实时**:播放时 `video.playbackRate` 逐帧跟随曲线 —— 不用导出就能看到
  快-慢-快的子弹时间效果,这是全片的 money shot。
- 应用曲线后时间线片段顶部出现**琥珀色速度点标记**(clip 宽 <48px 时隐藏,拍摄前把时间线放大),
  并显示"曲线"徽标;片段长度立即变化。
- 智能补帧开关:`speed-frame-interpolation`(AI 丝滑慢动作卖点)。
- 变速卡点:音乐节拍检测后一键"节拍脉冲/节拍慢放/节拍停顿"
  (`speed-beat-shape-{pulse|dip|hold}`);组合预设 `speed-point-preset-{flash|flash-black-focus|retro-camera|rainbow|impact}`
  = 曲线 + 特效一键套装。节拍检测可用 CLI:`editor:analyze:beats`。

### 1.5 素材获取

> **2026-07-26 更新(已执行)**:按用户要求改用 **YouTube CC 素材**(生成要花钱)。
> 实际做法:yt-dlp + YouTube 搜索 CC 过滤(`&sp=EgIwAQ%253D%253D`),逐条用
> `yt-dlp --print "%(license)s"` 核验为 Creative Commons Attribution,下载后 ffmpeg
> 统一裁成 1080p30 无声片段。三段素材(滑板 4K 特技 / 跑酷跳跃 / 水花慢动作)与署名
> 见 `assets/ATTRIBUTION.md`。公开发布成片时描述里要带 CC-BY 署名。
> 下面的 AI 生成路线保留作为备选。

CLI **没有** YouTube/素材站下载命令(只有 `youtube:upload`),下载素材版权要自己核验
(所以只选 CC 授权);AI 生成路线版权干净、一把 FAL key 通吃视频+音乐:

- 视频:`create-video`(默认模型走 IMAROUTER key,**必须显式 `-m`**;
  `-o` 必传,否则落到 tmp 目录)。动作大片首选 `kling_2_6_pro`(人体运动最好)、
  `seedance_2_0`(便宜快)、`veo3_fast`(物理/水花)—— 都走 `FAL_API_KEY`。
- **提示词要点:让模型生成"本来就慢/凝滞"的动作**(mid-air、frozen、suspended),
  变速的戏剧性交给 QCut 的曲线来做,这样 4x 段不糊、0.2x 段不卡。
- 音乐:`generate-music`(MiniMax v2.6 via FAL,`--instrumental`,prompt 10–300 字符)。
- 音效(whoosh/impact):Freesound 只有应用内 Sounds 面板能搜,CLI 没有 —— 可选项,
  初版可以不加音效。
- 导入:`editor:media:batch-import --project-id <id> --sources a.mp4,b.mp4,music.wav`(≤20 个)。

---

## 2. 宣传片分镜脚本(约 30 秒,1080p 16:9)

背景音乐:140BPM 电子 trailer,在"子弹时间慢放段"故意留一个 drop。

| # | 时长 | 画面(编辑器内动作,虚拟鼠标全程可见) | 要传达的点 |
|---|---|---|---|
| S1 | 0–3s | 项目已就绪:三段动作素材躺在时间线上;光标滑入,点中第一段 clip,属性面板亮起 | 开场即正题 |
| S2 | 3–6s | 光标点 **变速** tab → 点 **曲线变速** 子 tab,6 张预设卡片(带迷你曲线图)横向排开,光标缓慢扫过 hover | "预设即所得" |
| S3 | 6–12s | 点击 **子弹时间** 卡片 → 片段瞬间缩短、顶部琥珀色速度点浮现、"曲线"徽标出现;光标点 timeline.play,**预览实时快-慢-快**,曲线编辑器里播放头细线同步骑着曲线走 | money shot:实时预览 |
| S4 | 12–18s | 暂停;光标拖拽中间的 0.2x 速度点再往下压(慢放更狠),时长读数实时跳动;seek 到曲线中段,点 **+** 在播放头处加一个速度点 | 可精修、不是黑盒 |
| S5 | 18–23s | 打开 **智能补帧** 开关;再播一次慢放段(丝滑) | AI 补帧卖点 |
| S6 | 23–28s | 切到 **变速卡点**:点 **节拍慢放**(音乐已做过节拍检测),播放 —— 画面卡着鼓点慢放,时间线上速度点齐齐落在节拍上 | 音乐卡点自动化 |
| S7 | 28–32s | 光标点导出按钮,导出进度条走完,成片缩略图一闪;收尾 logo/标语(后期贴字) | 闭环 |

> 备选彩蛋:S6 换成组合预设 **彩虹**(hero 曲线 + 彩虹光线特效),视觉更炸。
> 初版先拍 S1–S5 + S7(不依赖节拍检测),S6 作为二期镜头。

---

## 3. 实施步骤

### Phase 0 — 环境准备(一次性)

```bash
# 1. key 检查(FAL 必须有;素材生成只用 FAL)
bun run pipeline check-keys

# 2. 启动编辑器(严格用这条命令),窗口最大化/全屏
bun run electron

# 3. 录屏权限 + 连通性体检
bun run pipeline editor:screen-recording:diagnose --json
bun run pipeline editor:health --json
```

注意:**关闭 DevTools**(否则虚拟鼠标的 CDP 后台输入模式失败);
多实例时先 `qcut instances list` + `instances use --port <p>`。

### Phase 1 — 素材(✅ 已完成:YouTube CC 下载,见 assets/ATTRIBUTION.md;以下生成路线仅作备选)

```bash
mkdir -p docs/task/speed-curve-promo/assets

# 主镜头:滑板凌空(动作凝滞,留给曲线去做戏)
bun run pipeline create-video \
  -t "skateboarder suspended mid-kickflip above a concrete bowl, motion nearly frozen, golden-hour rim light, dust particles hanging in air, cinematic 35mm, camera slowly orbiting" \
  -m kling_2_6_pro -d 5s --aspect-ratio 16:9 --resolution 1080p --count 2 \
  -o docs/task/speed-curve-promo/assets

# B-roll:跑酷腾跃
bun run pipeline create-video \
  -t "parkour athlete vaulting between rooftops at dusk, time nearly frozen mid-air, jacket ripples suspended, orbital camera, cinematic" \
  -m seedance_2_0 -d 5s --aspect-ratio 16:9 \
  -o docs/task/speed-curve-promo/assets

# 物理镜头:水花皇冠
bun run pipeline create-video \
  -t "dancer spinning through a sheet of water, droplets frozen in a crown around her, backlit against black, ultra detailed" \
  -m veo3_fast -d 5s --aspect-ratio 16:9 \
  -o docs/task/speed-curve-promo/assets

# 配乐:强节奏 trailer(卡点镜头要靠它)
bun run pipeline generate-music \
  -t "High-energy cinematic electronic trailer, 140 BPM, punchy drums, tension riser into a hard drop, dramatic pause" \
  --instrumental --audio-format wav -o docs/task/speed-curve-promo/assets
```

人工筛选一轮(--count 多 take 里挑最顺眼的),坏 take 删掉。

### Phase 2 — 搭演示项目

```bash
# 建项目并打开
bun run pipeline editor:project:create --name "Speed Curve Promo" --open --wait-ready --json
# 记下返回的 PROJECT_ID

# 导入素材(顺手上时间线)
bun run pipeline editor:media:batch-import --project-id $PID \
  --sources assets/skate.mp4,assets/parkour.mp4,assets/splash.mp4,assets/music.wav --json
bun run pipeline editor:timeline:arrange --project-id $PID --mode sequence --json

# S6 需要:先对音乐轨做节拍检测
bun run pipeline editor:analyze:beats --project-id $PID --json

# 时间线放大到速度点标记可见(clip 渲染宽度 ≥48px),预置好初始播放头
bun run pipeline editor:timeline:seek --project-id $PID --time 0 --json
```

时间线布局也可以改用 `editor:timeline:apply --manifest @timeline.json --replace`
固化成 manifest 文件,保证每次重拍布局一致(demo:run 的 plan 可直接引用)。

### Phase 3 — 摸清界面坐标(写动作脚本前必做)

```bash
# 拿到变速面板各控件的 ref / testid / bounds
bun run pipeline editor:snapshot --interactive --json > snapshot.json
```

优先用 `testid:` 目标(跨次运行稳定,不怕 ref 漂移):
`testid:speed-mode-curve`、`testid:speed-curve-preset-bullet`、
`testid:speed-curve-point-2`、`testid:speed-curve-point-toggle`、
`testid:speed-frame-interpolation`、`testid:speed-beat-shape-dip`、
语义目标 `timeline.play` / `timeline.pause` / `timeline.zoom-in`。

两处没有稳定 testid,需要 snapshot ref 或坐标:

1. **变速 tab 触发器**(`media-properties.tsx:744` 的 `TabsTrigger value="speed"` 只有外层
   TabsList 带 `media-properties-primary-tabs`)—— snapshot 里按 `role=tab` + 名称"变速"找 ref;
   更省事的做法是先给它加一行 `data-testid="media-properties-tab-speed"`(一行代码,顺手提交)。
2. **时间线上的 clip 本体** —— 用 snapshot ref 或 normalized 坐标点选,
   或者用 API 先 `editor:timeline:select` 选中、镜头里光标再"补一下"点击动作。

先用单条命令逐个试点位(不录屏),确认每步都命中:

```bash
bun run pipeline editor:pointer:click --target testid:speed-mode-curve --force --json
```

### Phase 4 — 写 demo plan 并试跑

`docs/task/speed-curve-promo/promo-plan.json` 骨架(动作 schema 与
`editor:pointer:sequence` 相同;`sleep` 是给观众留的呼吸感,`--skip-idle` 试跑时可跳过):

```json
{
  "project": { "id": "<PROJECT_ID>" },
  "capture": {
    "record": "promo-raw.mp4",
    "prerollMs": 700,
    "postrollMs": 900,
    "actions": [
      { "action": "click", "ref": "@e<首个clip>", "waitFor": "testid:media-properties" },
      { "action": "click", "ref": "@e<变速tab,snapshot按role=tab名称变速查找>" },
      { "action": "click", "target": "testid:speed-mode-curve" },
      { "action": "sleep", "durationMs": 600, "idle": true },
      { "action": "hover", "target": "testid:speed-curve-preset-montage" },
      { "action": "hover", "target": "testid:speed-curve-preset-hero" },
      { "action": "click", "target": "testid:speed-curve-preset-bullet" },
      { "action": "sleep", "durationMs": 800, "idle": true },
      { "action": "click", "target": "timeline.play" },
      { "action": "sleep", "durationMs": 5000 },
      { "action": "click", "target": "timeline.pause" },
      { "action": "drag", "fromRef": "@e<速度点3>", "toY": 520, "durationMs": 900, "holdMs": 200 },
      { "action": "click", "target": "testid:speed-curve-seek-surface", "normalizedX": 0.55, "normalizedY": 0.5 },
      { "action": "click", "target": "testid:speed-curve-point-toggle" },
      { "action": "click", "target": "testid:speed-frame-interpolation" },
      { "action": "click", "target": "timeline.play" },
      { "action": "sleep", "durationMs": 4000 },
      { "action": "click", "target": "timeline.pause" }
    ]
  },
  "export": false
}
```

```bash
# 快速试跑(不录屏、跳过 idle,验证每个点位)
bun run pipeline editor:pointer:sequence --actions @promo-actions.json --skip-idle --json

# 正式录制(1.0 倍速拍,节奏后期再调)
bun run pipeline editor:demo:run --plan promo-plan.json \
  --record docs/task/speed-curve-promo/promo-raw.mp4 \
  --recording-quality 1080p --json
```

demo:run 会自动生成 `promo-raw.mp4.pointer.json` 事件轨(每个动作的起止毫秒),
后期剪辑对时间轴时直接用它,不用逐帧找。

### Phase 5 — 后期成片(用 QCut 自己剪,吃自己的狗粮)

1. 新建 "Promo Master" 项目,导入 `promo-raw.mp4` + 配乐 wav。
2. 按事件轨掐头去尾、给 S3 money shot 段加"闪黑聚焦"式强调(甚至可以对录屏素材本身
   再用一次曲线变速 —— 宣传片自我指涉,S6 drop 处慢放)。
3. 贴片头/片尾标语文字(text 面板),LOGO 收尾。
4. 导出:

```bash
bun run pipeline editor:export:start --project-id $PID2 --poll \
  --output docs/task/speed-curve-promo/promo-final.mp4 --fps 30 --json
```

### Phase 6 — 验收清单

- [ ] 成片 ≥1920×1080、30fps、时长 25–35s,`--verify-frames` 抽帧非黑非白
- [ ] 虚拟鼠标全程可见:移动缓动自然、点击有脉冲圈、拖拽有轨迹线
- [ ] S3 实时预览段速度变化肉眼清晰(4x 段与 0.2x 段对比强烈)
- [ ] 曲线编辑器时长读数、播放头细线、琥珀色速度点标记均入镜清晰(时间线已放大)
- [ ] 音乐 drop 与慢放段对齐(±100ms)
- [ ] 中文 UI 录制(卖点名词:曲线变速/子弹时间/智能补帧/变速卡点)

---

## 4. 风险与坑(前车之鉴)

| 风险 | 对策 |
|---|---|
| DevTools 开着 → CDP 后台输入失败 | 录制前关 DevTools;或降级 `--foreground` |
| snapshot ref 漂移(UI 重挂载) | 能用 `testid:` 就不用 `@eN`;每次重拍前重新 snapshot |
| 变速 tab 触发器无 testid(已确认) | snapshot 按 role=tab+"变速"找 ref;或加一行 `data-testid` 后用 `testid:` 定位;备选:右键 clip → 上下文菜单"变速" |
| 录像分辨率校验失败(<1920×1080) | 窗口全屏 + `--recording-quality 1080p`;必要时 plan 里调 `capture.minimumWidth/Height` |
| 点击类动作被策略拦截 | sequence/plan 内部动作不需要,但单条命令调试时记得 `--force` |
| `create-video` 默认模型要 IMAROUTER key | 永远显式 `-m kling_2_6_pro` 等 FAL 系模型 |
| 生成视频不传 `-o` 落到 tmp | 永远传 `-o docs/task/speed-curve-promo/assets` |
| 速度点标记在窄 clip 上隐藏 | 拍摄前 `timeline.zoom-in` 放大到 clip ≥48px |
| 全局 `qcut` 二进制是旧快照 | 本方案统一用 `bun run pipeline`,不依赖全局 bin |
| S6 节拍按钮灰着 | 必须先 `editor:analyze:beats` 且音乐 clip 在时间线上 |

## 4.5 实际执行记录(2026-07-26,take 1 已录成)

- 演示项目:`Speed Curve Promo`(projectId `c60bd8a6-e308-46d9-b545-2bf3d9a5ed5c`),
  时间线:jump(0–10s,主角)→ water → skate,单 media 轨。
- 动作脚本:`promo-actions.json`(36 步全过);录像 `promo-take1.mp4`
  (30.9s,2048×1128@30fps)+ 事件轨 `promo-take1.events.json`。
- **重录一条命令**(前提:QCut 运行中、该项目打开、状态已复位):

```bash
bun run pipeline editor:pointer:sequence \
  --actions @docs/task/speed-curve-promo/promo-actions.json \
  --record docs/task/speed-curve-promo/promo-take2.mp4 \
  --recording-quality native --preroll-ms 800 --postroll-ms 1000 --force --json
```

- 状态复位(每次重录前):点 `testid:speed-frame-interpolation`(关补帧)→
  点 `testid:speed-curve-preset-none` → 点画面 tab(坐标 1463,171)→
  `editor:timeline:clear-selection` → `editor:timeline:seek --time 0` → `editor:pointer:hide`。
- 实测经验(已回填到风险表):
  - 面板重挂载后 snapshot ref 会失效(@e73 变速 tab 复选后 miss)——变速 tab 用**坐标 (1635,171)**
    点击 + 紧跟 `wait testid:speed-mode-curve` 兜底;其余控件全部用 `testid:` 动态定位。
  - `testid:timeline-element` 有重复时解析到第一个(x 最小的 clip),正好是主角 jump。
  - 序列第一步加 `"foreground": true`,把窗口带到前台防后台节流。
  - 曲线上速度点坐标可从几何推算:x = 1464 + position×547,y = 476 − 80×log10(rate)。
- 窗口 2048×1096(录出 2048×1128 含标题栏),满足 ≥1080p 校验。

## 4.6 第二轮执行记录(2026-07-26 晚,双语成片交付)

用户反馈四点:双语版本 + seed_audio 配音、preview"卡住"、清晰度、加说明字幕。处理结果:

1. **"卡住"根因**:不是冻结——0.11x 慢放 × 30fps 素材 = 每 0.3s 才出一帧新画面。
   治本:`ffmpeg minterpolate=fps=120:mi_mode=mci` 把 jump.mp4 插帧成 jump120.mp4,
   0.2x 慢放有效帧率 24fps;同时把演示里的拖拽目标从 0.11x 收敛到 0.16x。
2. **清晰度**:`--recording-quality 2160p` 能吃到 Retina 物理像素(3840×2160)但 4K 实时
   VP9 编码过载,采集流会出现零星黑边帧(分辨率重协商);**1440p 是甜点**——锐利且无毛刺。
   录屏"native"档只采逻辑像素(2048 宽),文字发虚,不要用。
3. **双语 take**:UI 语言切换 = 顶栏 `testid:language-selector` → 菜单点 中文/English
   (菜单是 portal,snapshot 抓不到,用截图定位坐标)。TabsList 是固定 grid,中英文界面
   坐标完全一致,同一个 promo-actions.json 两种语言直接复用。
4. **配音**:`generate-speech -m seed_audio`(ByteDance Seed Audio 1.0 via FAL)逐句生成
   `vo/zh|en/01-06.mp3`;注意 `bun run` 会把 cwd 重置到仓库根,`--output-dir` 必须用绝对路径。
   英文 5/6 句首版偏长(5-6s)塞不进分镜,改短文案重生成。
5. **字幕**:成片项目里用 QCut text 元素(`editor:timeline:batch-add`,
   `{"type":"text","content",...,"style":{y:400,fontSize:46,...}}`)。
   **坑:文字轨必须 `track:move --index 0` 到最上层**,否则被主轨视频盖住不渲染
   (应用内建文字轨永远插 index 0,CLI 创建的默认排尾部)。
6. **导出**:`editor:export:start --output <abs>.mp4 --poll`,youtube-1080p 预设
   (1920×1080@30,libx264 8Mbps),native-cli 引擎,29.9s 约 15s 导完。

产物:`promo-take3-zh.mp4` / `promo-take4-en.mp4`(2560×1440 原始 take)、
`promo-final-zh.mp4` / `promo-final-en.mp4`(1080p 成片,含配音+字幕)、
`vo/`(12 句配音)、`assemble-zh|en.json`(成片时间线布局,可复现)。
成片项目:`Speed Curve Promo Final ZH`(20e9cacd)/ `Final EN`(007a0dc8)。

## 4.7 第三轮执行记录(2026-07-26 深夜,v2 成片:清晰度 + 动感重做)

用户复审意见:成片仍不够清楚、慢放段仍显呆滞;建议换素材/加特效。处理:

1. **清晰度根因**:v1 成片被导出压回 1080p——1440p 录屏 → 1080p 导出白白降档。
   v2 用 **youtube-4k 预设(45Mbps)** 导出,1440p 素材无损上 4K 容器,UI 文字根根分明。
2. **"呆滞"根因**:跑酷侧视是静止机位,人悬空时画面内容几乎不动,慢放再流畅也显得像卡住。
   v2 换 **滑板 4K 特技段**(skate120.mp4,minterpolate 120fps)当主角——板在空中持续
   旋转,慢放全程"活着"。
3. **新增变速卡点段**:demo 尾部追加 `speed-mode-beat` → `speed-point-preset-rainbow`
   (彩虹:hero 曲线 + 彩虹光线特效一键套装)+ 第三次播放,画面更炸;take 增至 ~40s,
   动作脚本 47 步(promo-actions.json 已更新)。
4. **发现产品 bug**:导出预设分辨率 ≠ 项目分辨率时(youtube-4k vs 1080p 项目),
   native-cli 导出引擎**丢失全部 text 元素**(预览正常);youtube-1080p 正常。
   已 spawn 修复任务(task_b0a1c49a)。本轮字幕改为后期烧录:本机 ffmpeg 8.1 无
   libass/drawtext,用 PIL 渲字幕透明 PNG + ffmpeg overlay `enable=between(t,a,b)` 叠加
   (burn-zh.sh / burn-en.sh,坐标 y=1880/2160)。
5. 素材替换后时间线会漂移:delete + add-clip 之后 `timeline:move` 必须带 `--to-track`。

最终交付:**promo-final-zh-v2-sub.mp4 / promo-final-en-v2-sub.mp4**
(3840×2160、40s、配音 + 烧录字幕 + 彩虹特效段)。
中间产物:promo-take5-zh / take6-en(1440p 原始 take)、caps-zh|en.ass(字幕时间码)、
assemble-zh2|en2.json(成片时间线)。成片项目:Final ZH v2(fd3b9859)/ EN v2(e571b8a8)。

## 4.8 第四轮执行记录(2026-07-26 深夜,导出文字 bug 根治)

排查 4.7 发现的"4K 导出丢字幕",实际挖出**两个叠加的根因 + 一个接口坑**:

1. **PlayRes 用错坐标系**(claude-export-handler/export-engine.ts):`buildTextAss` 拿
   导出分辨率当画布,而文字元素 x/y/fontSize 是项目画布(1080p)单位 → 4K 导出时字幕
   字号减半、跑到 68% 高度。修复:`executeExportJob` 新增 `projectCanvas` 参数
   (取自 ClaudeTimeline.width/height),PlayRes 固定用项目画布,libass 自动缩放到输出。
2. **CJK 全是豆腐块——从来就是**(text-overlay.ts):libass 向 CoreText 要 CJK 回退字体,
   被指到系统保留的 PingFangUI.ttc(第三方进程禁止打开)→ 所有中文渲染成空框。
   v1"验证通过"的 1080p 字幕其实也是豆腐块(缩略图上误判)。`fontsdir` 无效
   (回退链不查 fontsdir);唯一可靠解法:内容含 CJK 时样式直接点名可打开的字体——
   macOS "Hiragino Sans GB"(实测 ✓)/ Windows "Microsoft YaHei" / Linux "Noto Sans CJK SC"。
   ("PingFang SC" 同样被封,不可用。)
3. **导出接口忽略 --project-id**(已修复):时间线快照来自 `accessor.requestTimeline()` =
   当前打开的项目;打开 A 时对 B 发导出,导出的是 A。修复:ClaudeTimeline 快照新增
   `projectId`(渲染端 claude-timeline-bridge-request.ts 填入 activeProject.id),
   导出路由(claude-http-shared-routes.ts)在快照 projectId 与 :projectId 不匹配时返回
   409 并提示先 `editor:navigator:open`;旧渲染端(无 projectId)保持原行为。
   实机验证:错配 → 409 + 明确提示;匹配 → 正常导出。
   回归测试:`electron/__tests__/claude-export-project-guard.test.ts`(3 用例)。

改动文件:`electron/claude/handlers/claude-export-handler/{export-engine,public-api,text-overlay}.ts`
+ 回归测试 `electron/__tests__/claude-export-text-overlay.test.ts`(3 用例全过,tsc/biome 干净)。
验证:ZH 项目 youtube-4k 与 youtube-1080p 各导一次,字幕位置/字号/中文字形全部正确。

最终交付升级为原生导出(无需 ffmpeg 烧录 workaround):
**promo-final-zh-v3.mp4 / promo-final-en-v3.mp4**(3840×2160,45Mbps,QCut 原生字幕+配音)。

## 5. 工作量预估

| 阶段 | 预估 |
|---|---|
| Phase 1 素材生成 + 筛选 | 0.5 天(多数是等待,可并行写脚本) |
| Phase 2–4 项目搭建 + 动作脚本调试 + 录制 | 1 天(点位调试是大头) |
| Phase 5 后期 + 导出 | 0.5 天 |
| 合计 | ~2 天 |

## 6. 参考文件

- 虚拟鼠标:`electron/native-pipeline/cli/cli-handlers-pointer.ts`、
  `electron/claude/handlers/agent-pointer-{controller,input,motion}.ts`、
  `apps/web/src/components/editor/agent-pointer-overlay.tsx`
- 演示编排:`electron/native-pipeline/cli/editor-demo-run.ts`
- 录屏:`electron/screen-recording-handler/`、`docs/task/recordly/CLI-RECORDING-GUIDE.md`
- 曲线变速:`apps/web/src/components/editor/properties-panel/{media-speed-properties,speed-curve-editor,speed-curve-preset-card}.tsx`、
  `apps/web/src/lib/video/{speed-presets,speed-beat-sync,speed-curve-path}.ts`
- E2E 操作流参考:`apps/web/src/test/e2e/speed-change.e2e.ts`
