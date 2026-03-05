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

# 用 node 生成 filter_complex 命令（通过环境变量传参，避免字符串注入）
FILTER_CMD=$(
  DELETE_JSON_PATH="$DELETE_JSON" \
  VIDEO_DURATION="$DURATION" \
  BUFFER_MS_VALUE="$BUFFER_MS" \
  CROSSFADE_MS_VALUE="$CROSSFADE_MS" \
  node <<'NODE'
const fs = require("fs");

try {
  const deleteJsonPath = process.env.DELETE_JSON_PATH;
  const duration = Number(process.env.VIDEO_DURATION);
  const bufferSec = Number(process.env.BUFFER_MS_VALUE) / 1000;
  const crossfadeSec = Number(process.env.CROSSFADE_MS_VALUE) / 1000;

  if (!deleteJsonPath) {
    throw new Error("DELETE_JSON_PATH 未提供");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`视频时长无效: ${String(process.env.VIDEO_DURATION)}`);
  }
  if (!Number.isFinite(bufferSec) || bufferSec < 0) {
    throw new Error(`BUFFER_MS_VALUE 无效: ${String(process.env.BUFFER_MS_VALUE)}`);
  }
  if (!Number.isFinite(crossfadeSec) || crossfadeSec < 0) {
    throw new Error(`CROSSFADE_MS_VALUE 无效: ${String(process.env.CROSSFADE_MS_VALUE)}`);
  }

  const deleteSegs = JSON.parse(fs.readFileSync(deleteJsonPath, "utf8"));
  if (!Array.isArray(deleteSegs)) {
    throw new Error("删除列表不是数组");
  }

  deleteSegs.sort((a, b) => a.start - b.start);

  const expandedSegs = deleteSegs.map((seg) => ({
    start: Math.max(0, seg.start - bufferSec),
    end: Math.min(duration, seg.end + bufferSec),
  }));

  const mergedSegs = [];
  for (const seg of expandedSegs) {
    if (
      mergedSegs.length === 0 ||
      seg.start > mergedSegs[mergedSegs.length - 1].end
    ) {
      mergedSegs.push({ ...seg });
    } else {
      mergedSegs[mergedSegs.length - 1].end = Math.max(
        mergedSegs[mergedSegs.length - 1].end,
        seg.end
      );
    }
  }

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
    throw new Error("删除片段覆盖了整个视频，没有可保留片段");
  }

  console.error("保留片段数:", keepSegs.length);
  console.error("删除片段数:", mergedSegs.length);

  let deletedTime = 0;
  for (const seg of mergedSegs) {
    deletedTime += seg.end - seg.start;
  }
  console.error("删除总时长:", `${deletedTime.toFixed(2)}s`);

  const filters = [];
  let vconcat = "";
  for (let i = 0; i < keepSegs.length; i++) {
    const seg = keepSegs[i];
    filters.push(
      `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
    );
    filters.push(
      `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    );
    vconcat += `[v${i}]`;
  }

  filters.push(`${vconcat}concat=n=${keepSegs.length}:v=1:a=0[outv]`);

  if (keepSegs.length === 1) {
    filters.push("[a0]anull[outa]");
  } else {
    let currentLabel = "a0";
    for (let i = 1; i < keepSegs.length; i++) {
      const nextLabel = `a${i}`;
      const outLabel = i === keepSegs.length - 1 ? "outa" : `amid${i}`;
      filters.push(
        `[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`
      );
      currentLabel = outLabel;
    }
  }

  console.log(filters.join(";"));
} catch (error) {
  console.error(
    `❌ 生成滤镜失败: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
NODE
)
FILTER_STATUS=$?

if [ $FILTER_STATUS -ne 0 ] || [ -z "$FILTER_CMD" ]; then
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
