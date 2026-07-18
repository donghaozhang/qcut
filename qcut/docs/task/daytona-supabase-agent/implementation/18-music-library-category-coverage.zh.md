# 音乐库分类覆盖检查

日期：2026-07-18

## 目标

确认 QCut 音乐库的大类齐全，并且每个主要分类至少能展示 2-3 首音乐。

## 当前覆盖

这次处理后，发布库的状态是：

- 音乐分类从 15 个增加到 16 个。
- bundled 内置音频 + CDN manifest 合并后，可见音乐共 73 首。
- 每个音乐分类都至少有 3 首发布曲目。
- 当前最少的是 `music-kpop`，有 6 首；新增的 `music-mandopop` 有 7 首。

| 分类 | 发布曲目数 | 说明 |
| --- | ---: | --- |
| 推荐 | 73 | 使用全部 music tracks。 |
| 热门榜 | 73 | 使用全部 music tracks，按下载量排序。 |
| 最新 | 73 | 使用全部 music tracks，按创建时间排序。 |
| 纯音乐 | 11 | bundled + CDN。 |
| 毕业季 | 8 | bundled + CDN。 |
| 轻快 | 12 | bundled + CDN。 |
| K-POP 热单 | 6 | bundled + CDN。 |
| 华语流行 | 7 | 新增分类，使用版权安全的华语流行风格曲目。 |
| 旅行 | 7 | bundled + CDN。 |
| 短视频热门 | 9 | bundled + CDN。 |
| 卡点 | 11 | bundled + CDN。 |
| 冬天 | 7 | bundled + CDN。 |
| 治愈 | 13 | bundled + CDN。 |
| 动感 | 11 | bundled + CDN。 |
| VLOG | 11 | bundled + CDN。 |
| 情绪 | 10 | bundled + CDN。 |

## 已实现

1. 新增 `music-mandopop` 分类。
2. 新增中英文文案：
   - English: `Mandopop`
   - 中文：`华语流行`
3. 新增中文搜索 alias：
   - `华语`
   - `周杰伦`
   - `国风流行`
4. 给现有安全曲目补分类 tag：
   - Bundled：`Warm Window`、`Moonlit Farewell`、`Snow Lantern`
   - CDN：`Bubble Tea Crush`、`Warm Tide`、`Farewell Letter`、`Silent Embrace`
5. 同步更新 `track-specs.json` 和 `tracks.json`，下一次 CDN build 会从源数据生成发布 manifest。
6. 新增回归测试：读取 `audio-cdn/tracks.json`，和 bundled audio 合并后检查每个音乐分类至少 3 首。

## 截图分类映射

| 截图里的分类 | QCut 分类 | 状态 |
| --- | --- | --- |
| 推荐音乐 | 推荐 | 已覆盖。 |
| 会员热榜 | 热门榜 | 已覆盖；会员 gating 不属于音频 catalog 本身。 |
| 最新 | 最新 | 已覆盖。 |
| 纯音乐 | 纯音乐 | 已覆盖。 |
| 毕业季 | 毕业季 | 已覆盖。 |
| 轻快 | 轻快 | 已覆盖。 |
| K-POP 热单 | K-POP 热单 | 已覆盖。 |
| 旅行 | 旅行 | 已覆盖。 |
| 抖音热门 | 短视频热门 | 已覆盖；避免直接绑定某个平台名。 |
| 卡点 | 卡点 | 已覆盖。 |
| 周杰伦 | 华语流行 | 已覆盖；搜索 alias 包含 `周杰伦`，但实际发布内容是版权安全的华语流行风格音乐，不是原曲。 |
| 冬天 | 冬天 | 已覆盖。 |

## 版权策略

不要从 YouTube 下载商业歌曲来填内置音乐库。如果使用 YouTube，只能使用明确标注 royalty-free / CC0 / 创作者授权的素材，并记录 license metadata。对于类似“某歌手风格”的分类，应该使用 `mandopop`、`chinese-pop`、`piano` 这类描述性 tag，而不是发布原曲。

## 验证

已通过：

```bash
bunx vitest run apps/web/src/lib/audio/__tests__/audio-library-catalog.test.ts apps/web/src/lib/audio/__tests__/audio-cdn-catalog.test.ts
bun apps/web/scripts/verify-audio-cdn-manifest.ts --manifest apps/web/audio-cdn/dist/manifest.json
bunx tsc --noEmit --pretty false -p apps/web/tsconfig.json
```

结果：

- 2 个测试文件通过。
- 13 个测试通过。
- Audio CDN manifest 验证通过：共 88 条，64 条 music，24 条 sound effects。
- TypeScript 检查通过。

## 下一步子任务

1. 启动编辑器 UI，确认音乐库侧边栏出现 `华语流行`。
2. 如果这个分类还需要更像独立歌曲的内容，用 FAL 生成 2-3 首新曲，例如：
   - `Mandopop piano ballad instrumental, warm vocal-like lead, no vocals`
   - `Chinese pop R&B instrumental, soft groove, nostalgic city night`
   - `Modern guofeng pop instrumental, guzheng textures, soft drums`
3. 将生成音频转换/标准化为 OGG，补 artwork，更新 `tracks.json`，跑 `assets:audio:release-cdn --dry-run`，再上传到 Supabase Storage。
4. 如果加入非生成音频，发布前必须补齐 license/source metadata。
