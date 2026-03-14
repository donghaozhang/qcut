# 视频理解 — 使用说明与工作原理
> 来源: https://www.volcengine.com/docs/82379/1895586?lang=zh

> **Tip**: 处理完图片/视频后，文件会从方舟服务器删除。方舟不会保留您提交的图片、视频以及文本信息等用户数据来训练模型。
## 时序信息
基于 FPS 的抽帧获取视频关键帧，再通过`时间戳+图像`拼接标记时序信息，模型基于该请求中的时序标记和图像内容，实现对视频的完整理解（包括内容变化、动作逻辑、时序关联等）。
详细原理见 [视频理解工作原理](https://www.volcengine.com/docs/82379/1895586#b5f696d3)。
## 视频格式说明

|**视频格式** |**文件扩展名** |**内容格式** **Content Type** |
|---|---|---|
|MP4 |.mp4 |`video/mp4` |
|AVI |.avi |`video/avi` |
|MOV |.mov |* url传入视频：对象存储请设置 Content Type 为`video/quicktime`|\
| | |* base64编码：请使用 `video/mov`，即`data:video/mov;base64,<BASE64_ENCODING>` |

> 视频文件格式变种较多，不能保证所有文件都能被识别，请通过测试验证文件能够被正常识别。

> **Tip**: 
* 常见问题及解决方案参见[支持 TS 格式的视频文件吗？](https://www.volcengine.com/docs/82379/1359411#85251eec)
* 上传视频至对象存储时设置，详情请参见[文档](https://www.volcengine.com/docs/6349/145523#%E8%AE%BE%E7%BD%AE%E6%96%87%E4%BB%B6%E5%85%83%E6%95%B0%E6%8D%AE)。
* 传入 Base64 编码时使用：[Base64 编码输入](https://www.volcengine.com/docs/82379/1895586#f6222fec)。
* 视频格式需小写。

## 视频文件容量
使用 URL 方式传入视频，视频文件不能超过 50MB。
使用 Base64 编码传入视频，视频文件不能超过 50MB，请求体不能超过 64MB。
使用 Files API 上传视频，视频文件不能超过 512 MB。
## 不支持音频理解
暂不支持对视频文件中的音频信息进行理解。
## 抽帧策略
用量说明：单视频最大 token 用量为 80k，单次请求视频最大 token 量还受模型的最大上下文窗口以及最大输入长度（当启用深度思考模式）限制，超出则需调整传入视频数量或视频长度。
基本概念：

* 帧图像：某个时刻的视频画面，本文特指输入给模型的帧图像
* 帧图像张数：视频时长 \* **fps**

方舟会根据帧图像张数，对帧图像进行压缩，以平衡视频的理解精度和 token 用量。
不同模型的抽帧策略不同，具体如下：

|抽帧策略 |doubao\-seed\-1.8 之前的模型 |doubao\-seed\-1.8 模型、doubao\-seed\-2.0 模型 |
|---|---|---|
|单帧最大 tokens |支持 128、160、256、384、512、640 离散 tokens 值。 |* doubao\-seed\-1.8 模型：支持 64、128、192、256、320、384 离散 tokens 值。|\
| | |* doubao\-seed\-2.0 模型：支持 tokens 在 [64, 384] 区间内连续动态调整。 |
|单帧对应的max_pixels |单帧最大 tokens \* 28 \* 28|单帧最大 tokens \* 42 \* 42|\
| |[10w, 50w] |[11w, 67w] |
|抽帧数 |[16帧, 640帧]|[16帧, 1280帧]|\
| |```Bash|```Bash|\
| |# 最大抽帧数|# 最大抽帧数|\
| |80×1024 token ÷ 128 token/帧 = 640 帧|80×1024 token ÷ 64 token/帧 = 1280 帧|\
| |```|```|\
| | | |
|抽帧方案 |:::tip||\
| |建议评估输出效果，按需调整fps字段配置或视频时长。| |\
| || |\
| |:::| |
|^^|* fps 过高或视频长度过长：处理的帧图像数量超出640帧，则按帧图像128tokens，时间间隔`视频时长/640`，均匀抽取640帧。|* fps 过高或视频长度过长：处理的帧图像数量超出1280帧，则按帧图像64tokens，时间间隔 `视频时长/1280`，均匀抽取1280帧。|\
| |* fps 过小或视频长度过短：处理的帧图像数量不足16帧时抽取方案如下：|* fps 过小或视频长度过短：处理的帧图像数量不足16帧时抽取方案如下：|\
| |   * 视频总帧数 \>= 16帧，均匀抽取16帧。|   * 视频总帧数 \>= 16帧，均匀抽取16帧。|\
| |   * 视频总帧数 < 16帧，抽取视频所有帧。 |   * 视频总帧数 < 16帧，抽取视频所有帧。 |

# 视频理解工作原理
视频处理的核心方式为 “帧与时间戳的结构化拼接”，具体规则如下：

* 对视频抽帧得到的每帧图像，在其前插入时间戳文本，格式为 `[<时间戳> second]`。
* 拼接后形成“时间戳+图像”的有序序列，模型通过该序列理解视频的时序逻辑和内容变化。

## 抽帧逻辑举例

| |FPS 1 |FPS 0.5 |FPS 2 |
|---|---|---|---|
|时间戳 |[0.0 second] |[0.0 second] |[0.0 second] |
|视频帧 |`<IMAGE>` |`<IMAGE>` |`<IMAGE>` |
|时间戳 |[1.0 second] |[2.0 second] |[0.5 second] |
|视频帧 |`<IMAGE>` |`<IMAGE>` |`<IMAGE>` |
|时间戳 |[2.0 second] |[4.0 second] |[1.0 second] |
|视频帧 |`<IMAGE>` |`<IMAGE>` |`<IMAGE>` |
|时间戳 |[3.0 second] | |[1.5 second] |
|视频帧 |`<IMAGE>` | |`<IMAGE>` |
|时间戳 |[4.0 second] | |[2.0 second] |
|视频帧 |`<IMAGE>` | |`<IMAGE>` |
|时间戳 |[5.0 second] | |[2.5 second] |
|视频帧 |`<IMAGE>` | |`<IMAGE>` |
|时间戳 | | |[3.0 second] |
|视频帧 | | |`<IMAGE>` |
|时间戳 | | |[3.5 second] |
|视频帧 | | |`<IMAGE>` |
|时间戳 | | |[4.0 second] |
|视频帧 | | |`<IMAGE>` |
|时间戳 | | |[4.5 second] |
|视频帧 | | |`<IMAGE>` |
|时间戳 | | |[5.0 second] |
|视频帧 | | |`<IMAGE>` |
| |*共6帧* |*共3帧* |*共11帧* |

## 多图请求等效
视频理解请求等效于下面示例的多图理解请求。
```Plain
{
    "model": "doubao-seed-1-6-251015",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type":"text",
                    "text":"你觉得这个恐怖吗？"
                },
                {
                    "type":"text",
                    "text":"[0.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_01>"}
                },
                {
                    "type":"text",
                    "text":"[1.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_02>"}
                },
                {
                    "type":"text",
                    "text":"[2.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_03>"}
                },
                {
                    "type":"text",
                    "text":"[3.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_04>"}
                },
                {
                    "type":"text",
                    "text":"[4.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_05>"}
                },
                {
                    "type":"text",
                    "text":"[5.0 second]"
                },
                {
                    "type":"image_url",
                    "image_url":{
                        "url":"<image_url_06>"}
                }
            ]
        }
    ]
}
```



