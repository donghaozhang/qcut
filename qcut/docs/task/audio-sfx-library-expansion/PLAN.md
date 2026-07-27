# 音效库扩充(对标剪映音效面板)

日期:2026-07-27 · 分支:editorgapsv1(未提交,建议独立 commit)

## 背景

用户对照剪映的音效库(热门/转场/提示音/综艺感/笑声/魔法/机械等分类,
每类几十上百条)提出:QCut 的音效太少,要"从网上下载或 AI 生成"补一批。
当时 CDN 目录仅 24 条音效(+ 内置 14 条)。

**素材来源决策**:没有从 YouTube 扒音频——把 YouTube 音频再分发到产品
CDN 有版权风险;等价合法通道是仓库已有的 Freesound CC0 导入器
(`apps/web/scripts/import-freesound-cc0.ts`,CC0 = 公共领域,可再分发、
免署名)。封面用 flux_dev 生成(沿用现有管线)。

## 做了什么

1. **50 条新音效 spec**(`apps/web/audio-cdn/sfx-sources.json`,
   ID -100117…-100166),按剪映分类选题:
   - 提示音 ×10:叮咚、可爱叮、任务完成、噔噔登场、叮叮叮、答错嗡鸣、
     答对叮咚、电梯到站、消息弹出、水滴提示
   - 综艺搞笑 ×12:弹簧噔、唱片急刹、捧哏鼓点、泄气长号、下滑哨、
     捏捏玩具、卡通逃跑、短屁声、气笛、悬念鼓点、尴尬蟋蟀、哇呜惊叹
   - 笑声 ×6:情景剧笑、哄堂爆笑、婴儿咯咯笑、邪恶低笑、偷笑、掌声欢呼
   - 转场 ×8:唰、突然加速、低沉呼啸、激光、打响指、甩镜、渐升混响、弹出
   - 魔法游戏 ×6:仙尘、魔法揭晓、叮铃魔法、金币、升级、8比特跳跃
   - 机械科技 ×6:打字机、机械键盘、相机连拍、时钟滴答、电流故障、伺服
   - 震惊 ×2:震惊定音(管弦 stab)、惊悚刺弦
2. **导入 QA**:首轮 36/50 成功;14 个查询词过窄(Freesound 全词 AND),
   用 API 探测后 13 条 pin 了核对过的 `freesoundId`(全部确认 CC0),
   2 条放宽 query;另重下 2 条劣质匹配(合成蟋蟀→真蟋蟀 #263865、
   数字键盘→真打字机 #138049)。二轮 0 失败。
3. **4 个新侧栏分类**(`audio-library-catalog.ts` + `translations.ts`):
   综艺搞笑 sfx-comedy、笑声 sfx-laugh、魔法游戏 sfx-magic、
   机械科技 sfx-tech;配套中文搜索别名(综艺/搞笑/笑声/魔法/游戏/机械…,
   别名同时服务 Freesound 远端搜索的英译)。
4. **离线兜底**:Boing Spring、Sneaky Giggle 两条 CC0 从 CDN 批次挪进
   内置库(`public/audio/builtin/`,BUILT_IN_AUDIO -2015/-2016),
   保证综艺/笑声分类离线非空;魔法由 Digital Sparkle 覆盖,机械给
   Camera Shutter 补了 `mechanical` 标签。
5. **发布**:`release-audio-cdn.ts --dry-run` 构建 Supabase base-url 的
   manifest;新增 96 个 payload(48 ogg + 48 webp)经 storage REST 只增
   上传(service-role key),manifest.json upsert。
   `verify-audio-cdn-manifest --check-remote` 272 个远端文件全通过。
   线上目录:88 → **136 首(音效 24 → 72)**。
6. **测试**:`audio-library-catalog.test.ts` 分类数断言更新
   (SFX 分类 10→14、内置 SFX 14→16),并新增"每个音效分类在已发布
   目录中 ≥3 条"的保障(原来只查音乐分类)。7/7 通过;tsc、biome 干净。

## 应用内验证(2026-07-27 01:55)

`bun run build` 后重启 `bun run electron`,用 Agent pointer + snapshot CLI 验证:

- 音频面板侧栏出现全部 4 个新分类(综艺搞笑/笑声/魔法游戏/机械科技)。
- 综艺搞笑 13 条、笑声 6 条、魔法游戏 8 条(6 新 + 数字闪光/硬币落下被
  标签匹配)、机械科技 7 条(6 新 + 相机快门)全部列出,封面正常。
- CDN 流播验证:点击"悬念鼓点"(6s,Supabase 远端)→ 卡片切换为暂停态、
  底部预览播放器出现(`audio-preview-player`)。
- 截图:`screenshots/comedy-category.png`、`screenshots/sfx-playing.png`。

## 已知边界

- `apps/web/audio-cdn/tracks/` 里仍有 28 首 7-18 生成的孤儿音乐 payload
  (-100089…-100116,R2 迁移被放弃时留下,从未进过 git 的 tracks.json,
  也不在线上)。本次未动;若要上架,把条目补回 tracks.json 重新发布即可。
- 音效音量未做响度归一(沿用现有管线行为)。
- manifest 客户端 localStorage 缓存 1 小时,老用户最多 1 小时后可见新音效。
