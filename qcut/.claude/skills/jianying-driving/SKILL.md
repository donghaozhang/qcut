---
name: jianying-driving
description: 驱动本机剪映专业版(JianyingPro)做参照采集/导出/草稿实验的操作手册——进程管理、副屏纪律、UI 自动化配方、已知陷阱。凡要操作剪映(打开草稿、导出视频、采平价参照、改片段参数)先读本 skill。
---

# 剪映专业版操作手册

本机剪映的驱动知识库,按实战持续更新。每次踩到新坑/摸清新配方,**就地补进对应小节**并在文末更新记录加一行。

## 0. 铁律

- **所有 UI 操作只在副屏进行**(用户主屏在干活):禁 `osascript` 抢前台;能无头就不驱动 UI。
- **剪映衍生物绝不进 Git / 绝不公开分发**:参照视频、包、截图产物一律放 `.local/`(gitignored)或 `docs/task/recordly/screenshots/`。
- 不解密加密草稿(反规避红线),只走 inspect 或 UI 重作。

## 1. 应用识别与进程管理

| 事实 | 值 |
|---|---|
| App 路径 | `/Applications/VideoFusion-macOS.app` |
| Bundle id | `com.lemon.lvpro`(进程名 `VideoFusion-macOS`,窗口 owner 名「剪映专业版」) |
| 版本查询 | `plutil -p /Applications/VideoFusion-macOS.app/Contents/Info.plist \| grep -i version`(本机 2026-08:`11.3.0-beta5`) |
| 草稿目录 | `~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/<草稿名>/` |
| 资源缓存 | `~/Movies/JianyingPro/User Data/Cache/`(artistEffect、effect、ressdk_db/rp.db) |

**进程操作(全部免 UI):**

- 找主进程:`pgrep -f "VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS$"`
  (⚠️ 会有十几个 Helper/service 子进程,`Frameworks/` 路径下带 `--service-name` 的都不是主进程,别杀错)。
- **退出:AppleScript `quit` 会被无视;窗口红点的 AX click 也被自绘 UI 无视。有效方法 = 对主进程 `kill -TERM`**(剪映持续自动保存,顶栏可确认「已自动保存」,TERM 安全)。
- 启动不抢焦点:`open -g -b com.lemon.lvpro`。⚠️ 首页窗口可能开在**主屏中央**(不记忆位置),编辑器窗口才记忆上次位置;启动后立即用 CGWindowList 查窗口位置,在主屏就要处理。
- 查窗口(AX 被 TCC 收回时用 Swift):
  `swift -e 'import CoreGraphics; ...CGWindowListCopyWindowInfo...'` 过滤 owner「剪映专业版」+ Width>700。

## 2. 草稿目录与版本行为

- **beta5 草稿已加密**:`draft_info.json` + `crypto_key_store.dat`,meta 也是密文。
- **beta5 对 beta4 明文草稿(裸 `draft_content.json`)的行为:能扫描列出(显示 0.0B/00:00),但打开报「无法打开草稿——草稿内容已损坏」**。直接注册明文草稿让它打开这条路对 beta5 不通;参照采集走 §4 的 UI 重作路线。
- 往草稿目录增删文件夹后,剪映**启动时**才重新扫描;删掉草稿再启动会弹「草稿列表异常」(点「取消」即可)。
- 「无法打开草稿」弹窗**没有关闭按钮**,Escape/点外部都无效——唯一出路是 `kill -TERM` 重启。

## 3. computer-use 驱动要点

1. `request_access` 申请 `剪映专业版`(full tier)。
2. 副屏名用 `swift -e 'import AppKit; for s in NSScreen.screens { print(s.localizedName, s.frame) }'` 查
   (本机:主屏 DELL U2719D 2560×1440 @ (0,0);副屏 DELL P2719H 1920×1080 @ (-1920,360))。
3. `switch_display` 到副屏 → `open_application`(把剪映前置到它所在显示器)→ 截图定位 → 批量点击。
4. **焦点竞争**:用户在主屏点击会把 Chrome 变前台,computer-use 的门禁即拒绝点击。解法 = 跟用户约一个免打扰窗口(几分钟),期间批量完成;别抢焦点竞速。
5. 数值字段编辑配方:`double_click` 字段 → `cmd+a` → `type` → `return`,**然后必须 `zoom` 验证值真的变了再继续**——旋转字段一次成功,不透明度字段曾静默不生效导出了假参照(所幸未落盘)。
6. 无焦点观察:`screencapture -x -R<负坐标>` 可直接截副屏区域;被遮挡窗口用 CGWindowID + `screencapture -l`。

## 4. UI 配方:从零做参照草稿并导出

前置:素材文件先备好(如 `.local/jianying-parity/_assets/parity-plate.mp4`)。

1. 首页 → 点「开始创作」→ 新编辑器(空时间线)。
2. 导入素材:点素材区「导入」→ 系统文件对话框 → `cmd+shift+g` → 输完整路径 → `return` → `return`。
3. 素材缩略图拖到时间线(`left_click_drag` 到轨道区),片段自动选中。
4. 右侧 画面→基础 面板字段:缩放(%)、位置 X/Y、旋转(°);混合组展开后有 混合模式/不透明度(%)。变速在顶部「变速」页签。
   - **语义记录:UI 旋转 +30° = 屏幕顺时针(与 CSS 同向)**。2026-08-19 最初目测成逆时针,
     帧比对器抓出镜像才纠正——**旋转方向绝不要靠肉眼截图判断,必须走比对器**。
   - 剪映导出带 bt709 色彩标签;与无标签输出对比时提帧要统一 `setparams` 解码假设,
     否则饱和色上凭空多 ~17 RMSE 底噪。
   - **坐标系:剪映 Y 轴上正(数学系),UI 负值向下**;X 右正与屏幕一致;UI 数值 = 2× 实际
     渲染像素(2026-08-19 平移匹配实测)。位移语义映射到屏幕系时 Y 要取负。
   - 关键帧配方:选中片段 → home 归播放头到 0 → 点属性组右侧 ◇(变青=已键)→ →×N 精确
     步进 N 帧 → 改字段值(自动加关键帧)。⚠️ 点击时间线片段会同时挪动播放头;◇ 在
     非关键帧时刻显示空心属正常,不代表关键帧丢失。
5. 导出:右上「导出」→ 弹窗改「标题」(triple_click 标题框 → cmd+a → type)→ 分辨率选「原始」(= 草稿尺寸)→ 点「导出」→ 等待 → 成功弹窗点「关闭」。
   - 导出路径记忆上次目录(查盘:`mdfind -name <标题>`);格式默认 MOV(h264,ffmpeg 可直接吃)。
6. 单变量纪律:先导 off(全默认)再改一个字段导 on;**改完下个 case 前把上个字段归零**。
   同一草稿可连续出多个 case 的 on;**一份全默认 off 导出可复用为所有单变量案例的共享基线**。
7. 数值框编辑细节(2026-08-19 四案实采):**triple_click 比 double_click 可靠**(不透明度框
   double_click 曾静默失败);变速倍数框输 "2" 会追加成 1.20x,**必须输完整 "2.0"**;
   Escape 会取消片段选中导致右面板整体置灰(不是弹窗)。
8. 转场案例配方(transition-move-left,2026-08-19 已采,一次成型约 2 分钟):
   文件菜单→新建草稿(弹确认)→ 导入两块板 → 依次拖同一轨道自动贴合 → off 直接导出 →
   顶部「转场」页签搜「左移」(搜索结果第二个纯「左移」)→ 拖到接缝 → 右面板时长改 0.5
   (triple_click + cmd+a,zoom 验证)→ on 导出。导出落在上次记忆目录(mdfind 找),默认 MOV。
   - **无余量转场语义**:素材出点无 handle 时弹「添加重复帧创建转场——不改变片段时长」,
     确认即可(勾选不再提示)。
   - **左移实测语义**:0.5s 窗口接缝居中、对称 quint 类缓动,与 QCut move-left 推挤曲线
     逐帧边界偏差 ≤9px、中点完全一致;但原生左移在两翼(±0.1s)有模糊/缩放复合的风格化
     修饰(时移、纯缩放假设均被匹配测试否定),QCut 纯推挤不含 → parity 15.0 vs 严格上限
     11.0,回执 verdict fail 属预期(诚实近似声明)。别只看 verdict:先看边界曲线是否对齐。

## 5. 无头替代品(能不开 UI 就用这些)

- 特效逐帧渲染:`dist/electron/jianying-effect/render.js`(runtime bridge,blit/texture_blit)+ 批渲脚本 `scripts/jianying-effect-reference-batch.cjs`(node 跑,勿用 bun)。
- 名称/分类目录:`Cache/ressdk_db/*/rp.db` 的 `http_cache` 表(node:sqlite),不用驱动 UI。
- 平价采集流水线:`scripts/jianying-parity/`(build-case / compare,见其 README)。
- 文字动画/花字:electron/jianying-text-* 系列(本地包扫描,免 UI)。

## 更新记录

- 2026-08-19 初版:L1 平价采集实战(beta5 拒开明文草稿、TERM 退出、UI 导出配方、旋转逆时针语义、不透明度字段陷阱)。
- 2026-08-19 L5:转场案例配方与 QCut 窗口语义(接缝居中 + easeInOutQuint);教训:改完 editor-core 必须 `bun run build` 再做真机验证,旧包曾复现「段丢失」假象。
