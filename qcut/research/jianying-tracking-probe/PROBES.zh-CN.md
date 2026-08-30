# 独立跟踪探针

同目录有三组工具：

1. Node 旁车探针：读取和审计已有运动/平面跟踪 JSON；
2. Python 视频探针：直接读取普通视频，自行计算运动框或平面四角轨迹。
3. 私有 Bingo oracle：从普通视频调用本机缓存的剪映 11.3.0 运动跟踪 runtime。

前两组不启动剪映、不调用剪映二进制、不读取剪映默认目录，也不需要剪映账号或网络。Python 探针是透明的 OpenCV 参考实现，用于 POC、回归测试和 QCut 接入验证；其结果不能单独证明与剪映逐帧一致。

第三组不需要剪映进程、账号、草稿或网络，但会加载仓库外的本机私有剪映二进制和 Bingo 模型。它只能作为不可分发的研究 oracle，不能打包进 QCut，也不算 QCut 自研实现。

## 1. Node 旁车探针

文件：

- `tracking-probe-core.mjs`：稳定的分析与报告入口，不读取文件系统，可被其他 Node 程序直接导入。
- `tracking-probe-planar.mjs`：平面四角几何验证与统计。
- `tracking-probe-motion.mjs`：运动矩形、baseline 和稠密 cache 验证。
- `tracking-probe-shared.mjs`：分类器共用的数值、状态和问题模型。
- `tracking-probe.mjs`：命令行入口，负责发现和读取旁车文件。
- `tracking-probe.test.mjs`：全合成测试，不读取任何用户草稿。
- `package.json`：仅提供本地命令；没有第三方依赖。

### 1.1 环境

- Node.js 18 或更新版本。
- 不需要 `npm install`。
- 不需要剪映进程、剪映目录、账号或网络。

### 1.2 输入形状

一个 bundle 目录可以包含：

```text
bundle/
  desc.json   可选
  data.json   必需
  cache.json  可选，仅运动跟踪常见
```

也可以直接传入单独的 `data.json` 或其他 JSON 文件。探针不会默认查找 `~/Movies/JianyingPro`；调用方必须显式传路径。

### 1.3 常用命令

在探针目录中运行：

```bash
node ./tracking-probe.mjs /path/to/bundle
```

检查一个 `materials/videoTracking` 根目录下的各个 bundle：

```bash
node ./tracking-probe.mjs /path/to/materials/videoTracking
```

递归扫描任意归档目录：

```bash
node ./tracking-probe.mjs --recursive /path/to/archive
```

输出机器可读 JSON：

```bash
node ./tracking-probe.mjs --json /path/to/bundle > report.json
```

用于 CI；发现几何无效时退出 2：

```bash
node ./tracking-probe.mjs --fail-on-invalid /path/to/bundle
```

退出码：

- `0`：成功读取并输出报告；默认模式即使发现无效轨迹也返回 0。
- `1`：参数、文件读取或 JSON 解析失败。
- `2`：启用 `--fail-on-invalid` 且至少一个报告含 error 级问题。

默认报告只显示 bundle 名称。确实需要绝对路径时显式添加：

```bash
node ./tracking-probe.mjs --show-paths /path/to/bundle
```

### 1.4 可检测内容

#### 平面跟踪

- 根据 `p_x1..p_y4` 识别，而不是只信 `resType`。
- 检查 NaN/Infinity、全零 sentinel、面积退化、边折叠和四边形自交。
- 统计四点顺序、面积、最大逐帧角点跳变、PTS 与 status。
- 同一个 status 同时出现在有效和无效几何上时给出警告。
- 坐标超出 `[0, 1]` 只警告，不直接判错；平面可以暂时出画。

#### 运动跟踪

- 根据 `left/top/right/bottom` 识别。
- 检查非有限数、非正宽度和非正高度。
- 统计矩形面积、中心最大跳变、非零角度、PTS 和 status。
- `baseline` 单独报告；`.data` 中与 baseline 完全相同的镜像记录归为 control，不按普通矩形验证。
- 若有 `cache.json`，单独验证 `[timeSeconds, [x1,y1,x2,y2]]` 稠密框。

#### 时间和描述符

- 检查 PTS 缺失、倒序和重复。
- 比较 `desc.startTime/endTime` 与样例覆盖范围，但差异只记为 info。
- 样例字段与 `resType` 冲突时，以字段分类并报告冲突。
- `resType` 只被视为当前已观察配置的提示，不当作跨版本协议。

### 1.5 直接作为库调用

```js
import { analyzeTrackingBundle } from "./tracking-probe-core.mjs";

const report = analyzeTrackingBundle({
  desc: optionalDescriptorObject,
  data: requiredDataObject,
  cache: optionalCacheObject,
  sourceLabel: "uploaded-sidecar",
});

if (!report.outcome.valid) {
  console.error(report.issues);
}
```

这个入口不访问文件系统，适合在 QCut worker、上传校验服务或测试中调用。

### 1.6 测试

```bash
npm test
```

测试数据在运行时生成到系统临时目录，覆盖：

- 有效平面四点；
- `status = 0` 的全零失败结果；
- 同 status 的有效/无效混合；
- 自交四边形；
- 有效与反向边界的运动矩形；
- 稠密 motion cache；
- `resType` 与字段冲突；
- PTS 重复；
- CLI JSON 输出与严格退出码。

## 2. Python 视频探针

文件：

- `probe_motion_video.py`：OpenCV CSRT/KCF/MOSSE 单目标矩形跟踪；
- `probe_planar_video.py`：特征点、金字塔 LK 光流、前后向误差和 RANSAC homography 平面跟踪；
- `video_probe_common.py`：视频、时间范围、坐标和 bundle 写出公共层；
- `requirements-video-probes.txt`：可选 Python 依赖；
- `test_video_probes.py`：带已知透视 ground truth 的合成视频测试。

### 2.1 安装独立环境

在探针目录运行：

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements-video-probes.txt
```

这只安装 NumPy 和无界面的 OpenCV contrib 包，不安装或链接剪映。当前实测环境为 Python 3.14、NumPy 2.5.2、OpenCV 4.14.0。

### 2.2 运动跟踪

输入归一化矩形，顺序为 `left,top,right,bottom`：

```bash
./.venv/bin/python ./probe_motion_video.py /path/to/input.mp4 \
  --output /path/to/motion-result \
  --bbox-normalized 0.30,0.25,0.62,0.70 \
  --anchor-frame 45 \
  --direction both \
  --tracker csrt \
  --fail-on-lost
```

也可以使用像素矩形，顺序为 `x,y,width,height`：

```bash
./.venv/bin/python ./probe_motion_video.py /path/to/input.mp4 \
  --output /path/to/motion-result \
  --bbox 216,320,230,576
```

`csrt` 较稳但慢，`kcf` 较快，`mosse` 最轻。这个探针输出矩形，不估计旋转角；`angle` 固定为 `0`。

### 2.3 平面跟踪

输入四点顺序固定为：左上、左下、右下、右上，即 `TL, BL, BR, TR`。归一化示例：

```bash
./.venv/bin/python ./probe_planar_video.py /path/to/input.mp4 \
  --output /path/to/planar-result \
  --quad-normalized 0.30,0.25,0.30,0.70,0.62,0.70,0.62,0.25 \
  --anchor-frame 45 \
  --direction both \
  --fail-on-lost
```

像素坐标使用 `--quad x1,y1,x2,y2,x3,y3,x4,y4`。平面探针只在锚点四边形内部取特征，逐帧做 LK 光流和前后向一致性筛选，再用 RANSAC 求单应矩阵并投影锚点四角。低纹理、遮挡、运动模糊或非刚性目标可能输出 `lost`。

### 2.4 锚点、范围和方向

- `--anchor-frame`：用户框选目标的帧，默认 `0`；
- `--start-frame` / `--end-frame`：闭区间，默认整段视频；
- `--direction forward`：从锚点向后；
- `--direction backward`：从锚点向前；
- `--direction both`：两边分别从锚点初始化，最后按帧号合并。

范围内不属于所选方向的帧不会出现在结果中。锚点始终包含一次，不会被双向分支重复写入。

### 2.5 输出

每次运行写一个独立目录：

```text
result/
  desc.json
  data.json
  cache.json  仅运动跟踪
```

- `desc.json` 使用 `qcut.standalone-tracking-probe/1` schema，记录算法、视频尺寸、FPS、锚点、范围、方向和参数；
- 运动 `data.json` 使用归一化 `left/top/right/bottom`；
- 平面 `data.json` 使用归一化 `p_x1..p_y4`，并附带特征点数、内点率和重投影误差；
- `lost` 平面帧写全零四点，同时显式写 `validity: "lost"`；
- `pts` 单位为微秒，由帧号和视频 FPS 计算；
- 默认拒绝覆盖现有输出；确需覆盖时使用 `--overwrite`。新 bundle 会先在同级临时目录完整序列化，再替换目标，序列化失败不会破坏旧结果。

输出可以立刻交给 Node 探针复核：

```bash
node ./tracking-probe.mjs --fail-on-invalid /path/to/planar-result
node ./tracking-probe.mjs --fail-on-invalid /path/to/motion-result
```

视频探针正常完成返回 `0`，参数/视频/算法/写出错误返回 `1`；使用 `--fail-on-lost` 且至少一帧失跟时返回 `2`。即使返回 `2`，结果仍会写出，便于定位失跟区间。

### 2.6 作为 Python 库调用

两个入口都把文件写出与求解拆开。调用方可以构造 `MotionProbeConfig` 或 `PlanarProbeConfig` 后调用 `solve_motion_video(...)` / `solve_planar_video(...)`，先在内存中检查 `descriptor` 和 `data`，确认后再调用 `write_bundle(...)`。所有函数参数使用关键字，避免矩形、四点和时间范围的位置参数混淆。

### 2.7 测试

```bash
./.venv/bin/python -m unittest -v ./test_video_probes.py
```

测试会在系统临时目录生成视频，覆盖已知透视变形、CSRT 矩形跟踪、双向帧范围、描述符实际覆盖区间、四边形自交、失跟后空点集、显式覆盖和写出失败时保留旧结果。测试不读取用户视频或剪映草稿。

## 3. 私有 Bingo 运动跟踪 oracle

文件：

- `cache-private-runtime.ts`：创建或校验 11.3.0 私有 runtime 快照；
- `bingo-tracking-bridge.cpp`：隔离的原生 Bingo API 桥；
- `track-motion.ts`：普通视频入口、FFmpeg 解码、manifest 校验和 JSON 发布；
- `track-motion.test.ts`：不依赖私有文件的 CLI 合同单元测试；
- `run-private-runtime-acceptance.ts`：生成 ground truth 视频并完成两次脱离剪映验收。

### 3.1 缓存私有 runtime

先确认安装的是国内剪映专业版 `com.lemon.lvpro`。在仓库根目录运行：

```bash
bun research/jianying-tracking-probe/cache-private-runtime.ts
```

缓存默认写到：

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTracking/
  11.3.0-<arm64-uuid>-<sha256-prefix>/
    Frameworks/
    Resources/models/
    manifest.json
  current -> 11.3.0-...
```

它会递归解析 `libcccreator.dylib` 的非系统依赖，使用 staging 目录复制，校验所有字节数和 SHA-256，收紧目录权限后再原子发布。当前 11.3.0 快照包含 23 个动态库和两份跟踪模型，共 `294,090,115` 字节。私有文件不会进入 Git。

重新校验现有快照：

```bash
bun research/jianying-tracking-probe/cache-private-runtime.ts --verify-only
```

### 3.2 从普通视频跟踪

输入框使用归一化 `left,top,right,bottom`：

```bash
bun research/jianying-tracking-probe/track-motion.ts \
  --video /path/to/input.mp4 \
  --rect 0.30,0.25,0.62,0.70 \
  --anchor-frame 45 \
  --direction both
```

默认输出到视频旁边：

```text
/path/to/input.jianying-motion-track.json
```

可用参数：

- `--direction forward|backward|both`：分别从锚点建立独立 session，双向结果按帧号合并；
- `--output /path/to/result.json`：指定结果文件；
- `--runtime-root /path/to/private/runtime`：覆盖默认 `current`；
- `--force`：允许替换已有结果；
- `--allow-jianying-running`：跳过“剪映必须退出”这一研究验收门，仅用于诊断。

CLI 默认执行以下保护：

- 对 manifest 中 23 个动态库和 2 个模型逐一复算 SHA-256；
- 核对 `libcccreator` arm64 UUID 和已审计模型 hash；
- 按原生源码 hash 构建桥，桥自身固定私有 runtime `LC_RPATH`；
- 剪映主进程、helper 或 `lvve-service` 存在时拒绝运行；
- 原生求解器在 macOS `sandbox-exec` 的 `deny network*` 配置中执行；
- 私有 C++ 对象只存在于子进程，TypeScript 只接收自有 JSON；
- 先写临时文件，再原子发布最终结果。

结果中的每帧包含：

```text
frameIndex, sourceTimeUs, anchor
status, rawStatus
rect.left/top/right/bottom
rotationDegrees, rawRotationCentidegrees
```

Bingo 原始角度以百分之一度表示并在 `36000` 回绕。桥保留原值，同时把 `rotationDegrees` 归一化到普通角度。当前 `sourceTimeUs` 使用视频平均 FPS 和帧号计算，因此这个版本只把恒定帧率视频作为可靠输入；VFR 需要后续增加逐帧 PTS sidecar。

### 3.3 脱离剪映验收

先完全退出剪映，然后运行：

```bash
bun research/jianying-tracking-probe/run-private-runtime-acceptance.ts
```

验收会在仓库外生成 60 帧已知运动视频，从中间帧做双向跟踪并重复两次。证据默认写到：

```text
~/Library/Application Support/QCut/ResearchEvidence/JianyingTracking/<run-id>/
```

11.3.0 当前实测结果：

- 剪映进程数：运行前 `0`，运行后 `0`；
- 网络策略：`deny`；
- tracked：`60/60`；
- 两次 sample 数组：完全相同；
- 平均 IoU：`0.940269`；
- 最低单帧 IoU：`0.879379`；
- 平均中心误差：`1.6225 px`；
- 最大中心误差：`3.4910 px`。

这些数字证明 11.3.0 Bingo tracker 已经能在剪映完全退出后由普通视频调用。它只证明当前合成样例和固定版本，不证明复杂真人、遮挡、模糊、版本升级或与剪映最终贴纸插值层完全一致。

### 3.4 测试

不依赖私有 runtime 的合同测试：

```bash
bun test research/jianying-tracking-probe/track-motion.test.ts
```

原生桥严格编译：

```bash
xcrun clang++ -std=c++20 -Wall -Wextra -Werror \
  -Wno-deprecated-declarations \
  research/jianying-tracking-probe/bingo-tracking-bridge.cpp \
  -o /tmp/qcut-bingo-tracking-bridge
```

## 4. 不做什么

- 不启动或控制剪映。
- 不解密草稿。
- 不扫描默认用户目录。
- 不修改输入文件。
- 不上传数据。
- 不把 `status` 单独当成成功判据。
- 不提交、上传或分发私有 runtime、模型和跟踪证据。
- 不把 Bingo oracle 描述成 QCut 自研 tracker。
