# 视频理解 — 视频传入方式
> 来源: https://www.volcengine.com/docs/82379/1895586?lang=zh

支持的视频文件传入方式如下：

* 本地文件上传：
   * [Files API 上传（推荐）](https://www.volcengine.com/docs/82379/1895586#35d3ebc5)：直接传入本地文件，视频文件大小不能超过 512 MB，适用于在多个请求中重复使用文件的场景。
   * [Base64 编码传入](https://www.volcengine.com/docs/82379/1895586#22314028)：适用于文件体积较小的场景，视频文件小于 50 MB，请求体不能超过 64 MB。
* [视频 URL 传入](https://www.volcengine.com/docs/82379/1895586#8e3a48ed)：适用于文件已存在公网可访问 URL 的场景，视频文件大小不能超过 50 MB。

## 本地文件上传
### Files API 上传（推荐）
建议优先使用 Files API 上传本地文件，不仅可以支持最大 512MB 文件的处理，还可以避免请求时重新上传内容，减少预处理导致的时延，同时可在多次请求中重复使用，节省公网下载时延。（当前Responses API支持该方式。）

> * 该方式上传的文件默认存储 7 天，存储有效期取值范围为1\-30天。
> * 如果需要实时获取分析内容，或者要规避复杂任务引发的客户端超时失败问题，可采用流式输出的方式，具体示例见[流式输出](https://www.volcengine.com/docs/82379/1895586#5cfd1f60)。


#### Curl

1. 上传视频文件获取File ID。
   ```Bash
   curl https://ark.cn-beijing.volces.com/api/v3/files \\
   -H "Authorization: Bearer $ARK_API_KEY" \\
   -F 'purpose=user_data' \\
   -F 'file=@/Users/doc/demo.mp4' \\
   -F 'preprocess_configs[video][fps]=0.3'
   ```
   
2. 在Responses API中引用File ID。
   ```Bash
   curl https://ark.cn-beijing.volces.com/api/v3/responses \\
   -H "Authorization: Bearer $ARK_API_KEY" \\
   -H 'Content-Type: application/json' \\
   -d '{
       "model": "doubao-seed-1-6-251015",
       "input": [
           {
               "role": "user",
               "content": [
                   {
                       "type": "input_video",
                       "file_id": "file-20251018****"
                   },
                   {
                       "type": "input_text",
                       "text": "请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。"
                   }
               ]
           }
       ]
   }'
   ```

#### Python

```Python
import asyncio
import os
from volcenginesdkarkruntime import AsyncArk

client = AsyncArk(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY')
)

async def main():
    # upload video file
    print("Upload video file")
    file = await client.files.create(
        # replace with your local video path
        file=open("/Users/doc/demo.mp4", "rb"),
        purpose="user_data",
        preprocess_configs={
            "video": {
                "fps": 0.3,  # define the sampling fps of the video, default is 1.0
            }
        }
    )
    print(f"File uploaded: {file.id}")

    # Wait for the file to finish processing
    await client.files.wait_for_processing(file.id)
    print(f"File processed: {file.id}")

    response = await client.responses.create(
        model="doubao-seed-1-6-251015",
        input=[
            {"role": "user", "content": [
                {
                    "type": "input_video",
                    "file_id": file.id  # ref video file id
                },
                {
                    "type": "input_text",
                    "text": "请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。"
                    
                }
            ]},
        ]
    )
    print(response)

if __name__ == "__main__":
    asyncio.run(main())
```

#### Go

```Go
package main

import (
    "context"
    "fmt"
    "io"
    "os"
    "time"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/file"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    ctx := context.Background()

    fmt.Println("----- upload video data -----")
    data, err := os.Open("/Users/doc/demo.mp4")
    if err != nil {
        fmt.Printf("read file error: %v\n", err)
        return
    }
    fileInfo, err := client.UploadFile(ctx, &file.UploadFileRequest{
        File:    data,
        Purpose: file.PurposeUserData,
        PreprocessConfigs: &file.PreprocessConfigs{
            Video: &file.Video{
                Fps: volcengine.Float64(0.3),
            },
        },
    })

    if err != nil {
        fmt.Printf("upload file error: %v", err)
        return
    }

    // Wait for the file to finish processing
    for fileInfo.Status == file.StatusProcessing {
        fmt.Println("Waiting for video to be processed...")
        time.Sleep(2 * time.Second)
        fileInfo, err = client.RetrieveFile(ctx, fileInfo.ID) // update file info
        if err != nil {
            fmt.Printf("get file status error: %v", err)
            return
        }
    }
    fmt.Printf("Video processing completed: %s, status: %s\n", fileInfo.ID, fileInfo.Status)
    inputMessage := &responses.ItemInputMessage{
        Role: responses.MessageRole_user,
        Content: []*responses.ContentItem{
            {
                Union: &responses.ContentItem_Video{
                    Video: &responses.ContentItemVideo{
                        Type:   responses.ContentItemType_input_video,
                        FileId: volcengine.String(fileInfo.ID),
                    },
                },
            },
            {
                Union: &responses.ContentItem_Text{
                    Text: &responses.ContentItemText{
                        Type: responses.ContentItemType_input_text,
                        Text: "请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。",
                    },
                },
            },
        },
    }
    createResponsesReq := &responses.ResponsesRequest{
        Model: "doubao-seed-1-6-251015",
        Input: &responses.ResponsesInput{
            Union: &responses.ResponsesInput_ListValue{
                ListValue: &responses.InputItemList{ListValue: []*responses.InputItem{{
                    Union: &responses.InputItem_InputMessage{
                        InputMessage: inputMessage,
                    },
                }}},
            },
        },
        Caching: &responses.ResponsesCaching{Type: responses.CacheType_enabled.Enum()},
    }

    resp, err := client.CreateResponses(ctx, createResponsesReq)
    if err != nil {
        fmt.Printf("stream error: %v\n", err)
        return
    }
    fmt.Println(resp)
}
```

#### Java

```Java
package com.ark.sample;

import com.volcengine.ark.runtime.model.files.FileMeta;
import com.volcengine.ark.runtime.model.files.PreprocessConfigs;
import com.volcengine.ark.runtime.model.files.UploadFileRequest;
import com.volcengine.ark.runtime.model.files.Video;
import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.item.ItemEasyMessage;
import com.volcengine.ark.runtime.model.responses.constant.ResponsesConstants;
import com.volcengine.ark.runtime.model.responses.item.MessageContent;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemVideo;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemText;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;
import java.io.File;
import java.util.concurrent.TimeUnit;

public class demo {
    public static void main(String[] args) {
        String apiKey = System.getenv("ARK_API_KEY");
        ArkService service = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

        System.out.println("===== Upload File Example=====");
        // upload a video for responses
        FileMeta fileMeta;
        fileMeta = service.uploadFile(
                UploadFileRequest.builder().
                        file(new File("/Users/doc/demo.mp4")) // replace with your image file path
                        .purpose("user_data")
                        .preprocessConfigs(PreprocessConfigs.builder().video(new Video(0.3)).build())
                        .build());
        System.out.println("Uploaded file Meta: " + fileMeta);
        System.out.println("status:" + fileMeta.getStatus());

        try {
            while (fileMeta.getStatus().equals("processing")) {
                System.out.println("Waiting for video to be processed...");
                TimeUnit.SECONDS.sleep(2);
                fileMeta = service.retrieveFile(fileMeta.getId());
            }
        } catch (Exception e) {
            System.err.println("get file status error：" + e.getMessage());
        }
        System.out.println("Uploaded file Meta: " + fileMeta);

        CreateResponsesRequest request = CreateResponsesRequest.builder()
                .model("doubao-seed-1-6-251015")
                .input(ResponsesInput.builder().addListItem(
                        ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                                MessageContent.builder()
                                        .addListItem(InputContentItemVideo.builder().fileId(fileMeta.getId()).build())
                                        .addListItem(InputContentItemText.builder().text("请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。").build())
                                        .build()
                        ).build()
                ).build())
                .build();
        ResponseObject resp = service.createResponse(request);
System.out.println(resp);
        service.shutdownExecutor();
    }
}
```

#### OpenAI SDK

```Python
import os
import time
from openai import OpenAI

api_key = os.getenv('ARK_API_KEY')

client = OpenAI(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=api_key,
)

file = client.files.create(
    file=open("/Users/doc/demo.mp4", "rb"),
    purpose="user_data"
)
# Wait for the file to finish processing
while (file.status == "processing"):
    time.sleep(2)
    file = client.files.retrieve(file.id)
print(f"File processed: {file}")
    
response = client.responses.create(
    model="doubao-seed-1-6-251015",
    input=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_video",
                    "file_id": file.id,
                },
                {
                    "type": "input_text",
                    "text": "请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。",
                },
            ]
        }
    ]
)
print(response)
```

### Base64 编码传入
将本地文件转换为 Base64 编码字符串，然后提交给大模型。该方式适用于视频文件体积较小的情况，文件不能超过 50 MB，请求体不能超过 64 MB。（Responses API 和 Chat API 都支持该方式。）
> **Warning**: 将视频文件转换为Base64编码字符串，然后遵循`data:{mime_type};base64,{base64_data}`格式拼接，传入模型。

* `{mime_type}`：文件的媒体类型，需要与文件格式mime_type对应。支持的视频格式详细见[视频格式说明](https://www.volcengine.com/docs/82379/1895586#ea7689ca)。
* `{base64_data}`：文件经过Base64编码后的字符串。
* 使用 Responses API 的示例代码如下：


#### Curl

```Bash
BASE64_FILE=$(base64 < demo.mp4) && curl https://ark.cn-beijing.volces.com/api/v3/responses \\
   -H "Content-Type: application/json"  \\
   -H "Authorization: Bearer $ARK_API_KEY"  \\
   -d @- <<EOF
   {
    "model": "doubao-seed-1-6-251015",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_video",
            "video_url": "data:video/mp4;base64,$BASE64_FILE",
            "fps": 1
          }
        ]
      }
    ]
  }
EOF
```

#### Python

```Python
import os
from volcenginesdkarkruntime import Ark
import base64
api_key = os.getenv('ARK_API_KEY')

client = Ark(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=api_key,
)
# Convert local files to Base64-encoded strings.
def encode_file(file_path):
  with open(file_path, "rb") as read_file:
    return base64.b64encode(read_file.read()).decode('utf-8')
base64_file = encode_file("/Users/doc/demo.mp4")

response = client.responses.create(
    model="doubao-seed-1-6-251015",
    input=[
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": f"data:video/mp4;base64,{base64_file}",
                    "fps":1
                }
            ],
        }
    ]
)

print(response)
```

#### Go

```Go
package main

import (
    "context"
    "encoding/base64"
    "fmt"
    "os"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    // Convert local files to Base64-encoded strings.
    fileBytes, err := os.ReadFile("/Users/doc/demo.mp4") 
    if err != nil {
        fmt.Printf("read file error: %v\n", err)
        return
    }
    base64File := base64.StdEncoding.EncodeToString(fileBytes)
    
    client := arkruntime.NewClientWithApiKey(
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    ctx := context.Background()

    inputMessage := &responses.ItemInputMessage{
        Role: responses.MessageRole_user,
        Content: []*responses.ContentItem{
            {
                Union: &responses.ContentItem_Video{
                    Video: &responses.ContentItemVideo{
                        Type:     responses.ContentItemType_input_video,
                        VideoUrl: fmt.Sprintf("data:video/mp4;base64,%s", base64File),
                        Fps:      volcengine.Float32(1),
                    },
                },
            },
        },
    }

    resp, err := client.CreateResponses(ctx, &responses.ResponsesRequest{
        Model: "doubao-seed-1-6-251015",
        Input: &responses.ResponsesInput{
            Union: &responses.ResponsesInput_ListValue{
                ListValue: &responses.InputItemList{ListValue: []*responses.InputItem{{
                    Union: &responses.InputItem_InputMessage{
                        InputMessage: inputMessage,
                    },
                }}},
            },
        },
    })
    if err != nil {
        fmt.Printf("response error: %v\n", err)
        return
    }
    fmt.Println(resp)
}
```

#### Java

```Java
package com.ark.sample;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemImage;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemText;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemVideo;
import com.volcengine.ark.runtime.model.responses.item.ItemEasyMessage;
import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;
import com.volcengine.ark.runtime.model.responses.constant.ResponsesConstants;
import com.volcengine.ark.runtime.model.responses.item.MessageContent;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Base64;
import java.io.IOException;

public class demo {
    private static String encodeFile(String filePath) throws IOException {
        byte[] fileBytes = Files.readAllBytes(Paths.get(filePath));
        return Base64.getEncoder().encodeToString(fileBytes);
    }
    public static void main(String[] args) {
        String apiKey = System.getenv("ARK_API_KEY");
        ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();
        // Convert local files to Base64-encoded strings.
        String base64Data = "";
        try {
            base64Data = "data:video/mp4;base64," + encodeFile("/Users/demo.mp4");
        } catch (IOException e) {
            System.err.println("编码失败: " + e.getMessage());
        }
        CreateResponsesRequest request = CreateResponsesRequest.builder()
                .model("doubao-seed-1-6-251015")
                .input(ResponsesInput.builder().addListItem(
                        ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                                MessageContent.builder()
                                        .addListItem(InputContentItemVideo.builder().videoUrl(base64Data).fps(2F).build())
                                        .build()
                        ).build()
                ).build())
                .build();
        ResponseObject resp = arkService.createResponse(request);
        System.out.println(resp);

        arkService.shutdownExecutor();
    }
}
```

#### OpenAI SDK

```Python
import os
from openai import OpenAI
import base64

api_key = os.getenv('ARK_API_KEY')

client = OpenAI(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=api_key,
)
# Convert local files to Base64-encoded strings.
def encode_file(file_path):
  with open(file_path, "rb") as read_file:
    return base64.b64encode(read_file.read()).decode('utf-8')
base64_file = encode_file("/Users/doc/demo.mp4")

response = client.responses.create(
    model="doubao-seed-1-6-251015",
    input=[
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": f"data:video/mp4;base64,{base64_file}",
                    "fps":1
                }
            ],
        }
    ]
)

print(response)
```


* 使用 Chat API 的示例代码如下：


#### Curl

```Bash
BASE64_VIDEO=$(base64 < demo.mp4) && curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \\
   -H "Content-Type: application/json"  \\
   -H "Authorization: Bearer $ARK_API_KEY"  \\
   -d @- <<EOF
   {
    "model": "doubao-seed-1-6-251015",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "video_url",
            "video_url": {
              "url": "data:video/mp4;base64,$BASE64_VIDEO"
            }
          },
          {
            "type": "text",
            "text": "What is in the video?"
          }
        ]
      }
    ],
    "max_tokens": 300
  }
EOF
```


* 按需替换 Model ID，查询 Model ID 参见 [模型列表](https://www.volcengine.com/docs/82379/1330310)。

#### Python

```Python
import base64
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]' .
from volcenginesdkarkruntime import Ark 

client = Ark(
    # The base URL for model invocation .
    base_url="https://ark.cn-beijing.volces.com/api/v3", 
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'), 
)

# 定义方法将指定路径图片转为Base64编码
def encode_video(video_path):
  with open(video_path, "rb") as video_file:
    return base64.b64encode(video_file.read()).decode('utf-8')

# 需传给大模型的图片
video_path = "path_to_your_video.jpg"

# 将图片转为Base64编码
base64_video = encode_video(video_path)

completion = client.chat.completions.create(
  # Replace with Model ID .
  model = "doubao-seed-1-6-251015",
  messages=[
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url":  f"data:video/<VIDEO_FORMAT>;base64,{base64_video}"
          },         
        },
        {
          "type": "text",
          "text": "What's in the video?",
        },
      ],
    }
  ],
)

print(completion.choices[0])
```

#### Go

```Go
package main

import (
    "context"
    "encoding/base64"
    "fmt"
    "os"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    // 读取本地图片文件
    videoBytes, err := os.ReadFile("path_to_your_video.jpeg") // 替换为实际图片路径
    if err != nil {
        fmt.Printf("读取图片失败: %v\n", err)
        return
    }
    base64Video := base64.StdEncoding.EncodeToString(videoBytes)

    client := arkruntime.NewClientWithApiKey(
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        // The base URL for model invocation .
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
        )
    ctx := context.Background()
    req := model.CreateChatCompletionRequest{
        // Replace with Model ID
        Model: "doubao-seed-1-6-251015",
        Messages: []*model.ChatCompletionMessage{
            {
                Role: "user",
                Content: &model.ChatCompletionMessageContent{
                    ListValue: []*model.ChatCompletionMessageContentPart{
                        {
                            Type: "video_url",
                            VideoURL: &model.ChatMessageVideoURL{
                                URL: fmt.Sprintf("data:video/mp4;base64,%s", base64Video),
                            },
                        },
                        {
                            Type: "text",
                            Text: "What's in the video?",
                        },
                    },
                },
            },
        },
    }

    resp, err := client.CreateChatCompletion(ctx, req)
    if err != nil {
        fmt.Printf("standard chat error: %v\n", err)
        return
    }
    fmt.Println(*resp.Choices[0].Message.Content.StringValue)
}
```

#### Java

```Java
package com.ark.sample;

import com.volcengine.ark.runtime.model.completion.chat.*;
import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionContentPart.*;
import com.volcengine.ark.runtime.service.ArkService;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.io.IOException;

public class Sample {
    static String apiKey = System.getenv("ARK_API_KEY");
    static ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
    static Dispatcher dispatcher = new Dispatcher();
    static ArkService service = ArkService.builder()
        .dispatcher(dispatcher)
        .connectionPool(connectionPool)
        .baseUrl("https://ark.cn-beijing.volces.com/api/v3") // The base URL for model invocation
        .apiKey(apiKey) //Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        .build();

    // Base64编码方法
    private static String encodeVideo(String videoPath) throws IOException {
        byte[] videoBytes = Files.readAllBytes(Path.of(videoPath));
        return Base64.getEncoder().encodeToString(videoBytes);
    }

    public static void main(String[] args) throws Exception {

        List<ChatMessage> messagesForReqList = new ArrayList<>();

        // 本地图片路径（替换为实际路径）
        String videoPath = "/path/to/your/video.mp4";

        // 生成Base64数据URL
        String base64Data = "data:video/mp4;base64," + encodeVideo(videoPath);

        // 构建消息内容（修复内容部分构建方式）
        List<ChatCompletionContentPart> contentParts = new ArrayList<>();

        // 图片部分使用builder模式
        contentParts.add(ChatCompletionContentPart.builder()
                .type("video_url")
                .videoUrl(new ChatCompletionContentPartVideoURL(base64Data, 2))
                .build());

        // 文本部分使用builder模式
        contentParts.add(ChatCompletionContentPart.builder()
                .type("text")
                .text("What's in the video?")
                .build());

        // 创建消息
        messagesForReqList.add(ChatMessage.builder()
                .role(ChatMessageRole.USER)
                .multiContent(contentParts)
                .build());

        ChatCompletionRequest req = ChatCompletionRequest.builder()
                .model("doubao-seed-1-6-251015") //Replace with Model ID .
                .messages(messagesForReqList)
                .build();

        service.createChatCompletion(req)
                .getChoices()
                .forEach(choice -> System.out.println(choice.getMessage().getContent()));
        // shutdown service after all requests are finished
        service.shutdownExecutor();
    }
}
```

## 视频 URL 传入
如果视频文件已存在公网可访问URL，可以在请求中直接填入视频文件的公网URL，文件不能超过50 MB。（Responses API 和 Chat API 都支持该方式。）

* 使用 Responses API 的示例代码如下：


#### Curl

```Bash
curl https://ark.cn-beijing.volces.com/api/v3/responses \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "doubao-seed-1-6-251015",
    "input": [
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                    "fps":1
                }
            ]
        }
    ]
}'
```

#### Python

```Python
import os
from volcenginesdkarkruntime import Ark

# 从环境变量中获取您的API KEY，配置方法见：https://www.volcengine.com/docs/82379/1399008
api_key = os.getenv('ARK_API_KEY')

client = Ark(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=api_key,
)

response = client.responses.create(
    model="doubao-seed-1-6-251015",
    input=[
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                    "fps":1
                }
            ],
        }
    ]
)

print(response)
```

#### Go

```Go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        //通过 os.Getenv 从环境变量中获取 ARK_API_KEY
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    // 创建一个上下文，通常用于传递请求的上下文信息，如超时、取消等
    ctx := context.Background()

    inputMessage := &responses.ItemInputMessage{
        Role: responses.MessageRole_user,
        Content: []*responses.ContentItem{
            {
                Union: &responses.ContentItem_Video{
                    Video: &responses.ContentItemVideo{
                        Type:     responses.ContentItemType_input_video,
                        VideoUrl: "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                        Fps:      volcengine.Float32(1),
                    },
                },
            },
        },
    }

    resp, err := client.CreateResponses(ctx, &responses.ResponsesRequest{
        Model: "doubao-seed-1-6-251015",
        Input: &responses.ResponsesInput{
            Union: &responses.ResponsesInput_ListValue{
                ListValue: &responses.InputItemList{ListValue: []*responses.InputItem{{
                    Union: &responses.InputItem_InputMessage{
                        InputMessage: inputMessage,
                    },
                }}},
            },
        },
    })
    if err != nil {
        fmt.Printf("response error: %v\n", err)
        return
    }
    fmt.Println(resp)
}
```

#### Java

```Java
package com.ark.example;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemImage;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemText;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemVideo;
import com.volcengine.ark.runtime.model.responses.item.ItemEasyMessage;
import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;
import com.volcengine.ark.runtime.model.responses.constant.ResponsesConstants;
import com.volcengine.ark.runtime.model.responses.item.MessageContent;


public class demo {
    public static void main(String[] args) {
        String apiKey = System.getenv("ARK_API_KEY");
        // 创建ArkService实例
        ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

        CreateResponsesRequest request = CreateResponsesRequest.builder()
                .model("doubao-seed-1-6-251015")
                .input(ResponsesInput.builder().addListItem(
                        ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                                MessageContent.builder()
                                        .addListItem(InputContentItemVideo.builder().videoUrl("https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4").fps(2F).build())
                                        .build()
                        ).build()
                ).build())
                .build();
        ResponseObject resp = arkService.createResponse(request);
        System.out.println(resp);

        arkService.shutdownExecutor();
    }
}
```

#### OpenAI SDK

```Python
import os
from openai import OpenAI

# 从环境变量中获取您的API KEY，配置方法见：https://www.volcengine.com/docs/82379/1399008
api_key = os.getenv('ARK_API_KEY')

client = OpenAI(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=api_key,
)

response = client.responses.create(
    model="doubao-seed-1-6-251015",
    input=[
        {
            "role": "user",
            "content": [
                {    
                    "type": "input_video",
                    "video_url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                    "fps":1
                }
            ],
        }
    ]
)

print(response)
```


* 使用 Chat API 的示例代码如下：（可参见[控制视频理解的精细度](https://www.volcengine.com/docs/82379/1895586#bf4d9224)）


#### Python SDK

```Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

client = Ark(
    # The base URL for model invocation
    base_url="https://ark.cn-beijing.volces.com/api/v3", 
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'), 
)

completion = client.chat.completions.create(
    # Replace with Model ID .
    model = "doubao-seed-1-6-251015",
    messages = [
        {
            "role": "user",  
            "content": [   
                {
                    "type": "video_url",
                    "video_url": {
                        # Replace the link with your actual video link
                        "url":  "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                        "fps": 1
                    }
                },
            ],
        }
    ],
)

print(completion.choices[0].message.content)
```

# 使用场景
