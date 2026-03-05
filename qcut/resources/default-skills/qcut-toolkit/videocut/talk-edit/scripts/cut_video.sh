#!/bin/bash
#
# 根据删除列表剪辑视频（filter_complex 精确剪辑）
#
# 用法: ./cut_video.sh <input.mp4> <delete_segments.json> [output.mp4]
#

INPUT="$1"
DELETE_JSON="$2"
OUTPUT="${3:-output_cut.mp4}"

if [ -z "$INPUT" ] || [ -z "$DELETE_JSON" ]; then
  echo "❌ 用法: ./cut_video.sh <input.mp4> <delete_segments.json> [output.mp4]"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "❌ 找不到输入文件: $INPUT"
  exit 1
fi

if [ ! -f "$DELETE_JSON" ]; then
  echo "❌ 找不到删除列表: $DELETE_JSON"
  exit 1
fi

# 获取视频时长（file: 前缀处理文件名含冒号的情况）
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$INPUT")
echo "📹 视频时长: ${DURATION}s"

# 配置参数
BUFFER_MS=50      # 删除范围前后各扩展 50ms（吃掉气口）
CROSSFADE_MS=30   # 音频淡入淡出 30ms

echo "⚙️ 优化参数: 扩展范围=${BUFFER_MS}ms, 音频crossfade=${CROSSFADE_MS}ms"

# 用 node 生成 filter_complex 命令
FILTER_CMD=$(
  DELETE_JSON_PATH="$DELETE_JSON" \
  DURATION_SEC="$DURATION" \
  BUFFER_MS="$BUFFER_MS" \
  CROSSFADE_MS="$CROSSFADE_MS" \
  node - <<'NODE'
const fs = require("fs");

function parseNumber(name) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} 不是有效数字: ${raw}`);
  }
  return parsed;
}

const deleteJsonPath = process.env.DELETE_JSON_PATH ?? "";
if (!deleteJsonPath) {
  throw new Error("缺少 DELETE_JSON_PATH");
}

const duration = parseNumber("DURATION_SEC");
const bufferSec = parseNumber("BUFFER_MS") / 1000;
const crossfadeSec = parseNumber("CROSSFADE_MS") / 1000;
if (duration <= 0) {
  throw new Error(`视频时长无效: ${duration}`);
}
if (bufferSec < 0 || crossfadeSec < 0) {
  throw new Error("BUFFER_MS 和 CROSSFADE_MS 不能为负数");
}

const rawDeleteSegs = JSON.parse(fs.readFileSync(deleteJsonPath, "utf8"));
if (!Array.isArray(rawDeleteSegs)) {
  throw new Error("delete_segments.json 必须是数组");
}

const normalizedDeleteSegs = [];
for (const [index, seg] of rawDeleteSegs.entries()) {
  if (!seg || typeof seg !== "object") {
    throw new Error(`第 ${index} 项不是有效对象`);
  }
  const start = Number(seg.start);
  const end = Number(seg.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error(`第 ${index} 项时间段无效: start=${seg.start}, end=${seg.end}`);
  }
  const clampedStart = Math.max(0, Math.min(duration, start));
  const clampedEnd = Math.max(0, Math.min(duration, end));
  if (clampedEnd > clampedStart) {
    normalizedDeleteSegs.push({ start: clampedStart, end: clampedEnd });
  }
}

// 按开始时间排序
normalizedDeleteSegs.sort((a, b) => a.start - b.start);

// 扩展删除范围（前后各加 buffer）
const expandedSegs = normalizedDeleteSegs.map((seg) => ({
  start: Math.max(0, seg.start - bufferSec),
  end: Math.min(duration, seg.end + bufferSec),
}));

// 合并重叠的删除段
const mergedSegs = [];
for (const seg of expandedSegs) {
  if (
    mergedSegs.length === 0 ||
    seg.start > mergedSegs[mergedSegs.length - 1].end
  ) {
    mergedSegs.push({ ...seg });
    continue;
  }
  mergedSegs[mergedSegs.length - 1].end = Math.max(
    mergedSegs[mergedSegs.length - 1].end,
    seg.end
  );
}

// 计算保留片段
const keepSegs = [];
let cursor = 0;

for (const del of mergedSegs) {
  if (del.start > cursor) {
    keepSegs.push({ start: cursor, end: del.start });
  }
  cursor = del.end;
}

if (cursor < duration) {
  keepSegs.push({ start: cursor, end: duration });
}

if (keepSegs.length === 0) {
  throw new Error("删除范围覆盖了整个视频，没有可保留的片段");
}

console.error("保留片段数:", keepSegs.length);
console.error("删除片段数:", mergedSegs.length);

let deletedTime = 0;
for (const seg of mergedSegs) {
  deletedTime += seg.end - seg.start;
}
console.error("删除总时长:", deletedTime.toFixed(2) + "s");

// 生成 filter_complex（带 crossfade）
const filters = [];
let vconcat = "";
const aLabels = [];

for (let i = 0; i < keepSegs.length; i++) {
  const seg = keepSegs[i];
  filters.push(
    "[0:v]trim=start=" +
      seg.start.toFixed(3) +
      ":end=" +
      seg.end.toFixed(3) +
      ",setpts=PTS-STARTPTS[v" +
      i +
      "]"
  );
  filters.push(
    "[0:a]atrim=start=" +
      seg.start.toFixed(3) +
      ":end=" +
      seg.end.toFixed(3) +
      ",asetpts=PTS-STARTPTS[a" +
      i +
      "]"
  );
  vconcat += "[v" + i + "]";
  aLabels.push("a" + i);
}

// 视频直接 concat
filters.push(vconcat + "concat=n=" + keepSegs.length + ":v=1:a=0[outv]");

// 音频使用 acrossfade 逐个拼接
if (keepSegs.length === 1) {
  filters.push("[a0]anull[outa]");
} else {
  let currentLabel = "a0";
  for (let i = 1; i < keepSegs.length; i++) {
    const nextLabel = "a" + i;
    const outLabel = i === keepSegs.length - 1 ? "outa" : "amid" + i;
    filters.push(
      "[" +
        currentLabel +
        "][" +
        nextLabel +
        "]acrossfade=d=" +
        crossfadeSec.toFixed(3) +
        ":c1=tri:c2=tri[" +
        outLabel +
        "]"
    );
    currentLabel = outLabel;
  }
}

console.log(filters.join(";"));
NODE
)
NODE_EXIT=$?
if [ "$NODE_EXIT" -ne 0 ]; then
  echo "❌ 生成滤镜命令失败"
  exit 1
fi

if [ -z "$FILTER_CMD" ]; then
  echo "❌ 生成滤镜命令失败"
  exit 1
fi

echo ""
echo "✂️ 执行 FFmpeg 精确剪辑..."

ffmpeg -y -i "file:$INPUT" \
  -filter_complex "$FILTER_CMD" \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 192k \
  "file:$OUTPUT"

if [ $? -eq 0 ]; then
  echo "✅ 已保存: $OUTPUT"

  NEW_DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$OUTPUT")
  echo "📹 新时长: ${NEW_DURATION}s"
else
  echo "❌ 剪辑失败"
  exit 1
fi
