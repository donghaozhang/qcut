# 视频理解 — 使用场景
> 来源: https://www.volcengine.com/docs/82379/1895586?lang=zh

## 控制视频理解的精细度
您可通过 **fps** 字段，控制从视频中抽取图像的频率，默认为1，即每秒从视频中抽取一帧图像，输入给模型进行视觉理解。 可通过 **fps** 字段，控制模型对于视频中图像变化的敏感度。

* 当视频画面变化剧烈或需关注画面变化，如计算视频中角色动作次数，可调高 **fps** 设置（最高 `5`），防止抽帧频率低导致误判。
* 当视频画面变化不频繁或无需关注画面变化，如画面中人数，可调低 **fps** （最低`0.2`），可提升处理速度，节省 token 用量。

示例代码如下：

#### Curl

```Shell
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \\
   -H "Content-Type: application/json" \\
   -H "Authorization: Bearer $ARK_API_KEY" \\
   -d '{
    "model": "doubao-seed-1-6-251015",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "video_url","video_url": {"url":  "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4", "fps": "2"}},
                {"type": "text", "text": "What is in the video?"}
            ]
        }
    ],
    "max_tokens": 300
  }'
```


* 按需替换 Model ID，查询 Model ID 参见 [模型列表](https://www.volcengine.com/docs/82379/1330310)。

#### Python

```Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]' .
from volcenginesdkarkruntime import Ark 

client = Ark(
    # The base URL for model invocation .
    base_url="https://ark.cn-beijing.volces.com/api/v3", 
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'), 
)

completion = client.chat.completions.create(
    # Replace with Model ID .
    model = "doubao-seed-1-6-251015",
    messages=[
        {
            # 消息角色为用户
            "role": "user",
            "content": [
                {
                    "type": "video_url",
                    "video_url": {
                        # 替换链接为实际视频链接
                        "url":  "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                        "fps": 2, # 每秒截取2帧画面，用于视频理解
                    }
                },
                # 文本类型的消息内容，询问视频里有什么
                {"type": "text", "text": "What's in the video?"},
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
    "fmt"
    "os"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        //Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        // The base URL for model invocation .
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    // 创建一个上下文，通常用于传递请求的上下文信息，如超时、取消等
    ctx := context.Background()
    // 构建消息内容
    contentParts := []*model.ChatCompletionMessageContentPart{
        {
            Type: "video_url",
            VideoURL: &model.ChatMessageVideoURL{
                URL: "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",
                FPS: volcengine.Float64(2),
            },
        },
        // 文本内容
        {
            Type: "text",
            Text: "What's in the video?",
        },
    }
    // 构建聊天完成请求，设置请求的模型和消息内容
    req := model.CreateChatCompletionRequest{
        // Replace with Model ID
       Model: "doubao-seed-1-6-251015",
       Messages: []*model.ChatCompletionMessage{
          {
             // 消息的角色为用户
             Role: model.ChatMessageRoleUser,
             Content: &model.ChatCompletionMessageContent{
                ListValue: contentParts, // 多类型内容使用ListValue
             },
          },
       },
       MaxTokens: volcengine.Int(300), // 设置模型输出最大 token 数
    }

    // 发送聊天完成请求，并将结果存储在 resp 中，将可能出现的错误存储在 err 中
    resp, err := client.CreateChatCompletion(ctx, req)
    if err!= nil {
       // 若出现错误，打印错误信息并终止程序
       fmt.Printf("standard chat error: %v\n", err)
       return
    }
    // 打印聊天完成请求的响应结果
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

public class VideoSample {
  static String apiKey = System.getenv("ARK_API_KEY");
  static ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
  static Dispatcher dispatcher = new Dispatcher();
  static ArkService service = ArkService.builder()
      .dispatcher(dispatcher)
      .connectionPool(connectionPool)
      .baseUrl("https://ark.cn-beijing.volces.com/api/v3")  // The base URL for model invocation .
      .apiKey(apiKey) //Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
      .build();

  public static void main(String[] args) throws Exception {

    List<ChatMessage> messagesForReqList = new ArrayList<>();

    // 构建消息内容
    List<ChatCompletionContentPart> contentParts = new ArrayList<>();

    contentParts.add(ChatCompletionContentPart.builder()
        .type("video_url")
        .videoUrl(new ChatCompletionContentPartVideoURL(
            "https://ark-project.tos-cn-beijing.volces.com/doc_video/ark_vlm_video_input.mp4",2))
            
        .build());

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
        .maxTokens(300)
        .build();

    service.createChatCompletion(req)
        .getChoices()
        .forEach(choice -> System.out.println(choice.getMessage().getContent()));
    // shutdown service after all requests are finished
    service.shutdownExecutor();
  }
}
```

## 感知视频时序
视频理解可理解视频时间和图像关系信息，如回答事件发生什么时间点，在哪些时间发生了某事件等和时间相关的信息，原理见 [视频理解工作原理](https://www.volcengine.com/docs/82379/1895586#b5f696d3)。
下面是简单示例代码

#### Curl

```Shell
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \\
   -H "Content-Type: application/json" \\
   -H "Authorization: Bearer $ARK_API_KEY" \\
   -d '{
    "model": "doubao-seed-1-6-251015",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "video_url","video_url": {"url":  "https://ark-project.tos-cn-beijing.volces.com/doc_video/video-understanding.mp4", "fps": "5"}},
                {"type": "text", "text": "裁判什么时间点出现的？"}
            ]
        }
    ],
    "max_tokens": 300
  }'
```


* 按需替换 Model ID，查询 Model ID 参见 [模型列表](https://www.volcengine.com/docs/82379/1330310)。

#### Python

```Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]' .
from volcenginesdkarkruntime import Ark 

client = Ark(
    # The base URL for model invocation .
    base_url="https://ark.cn-beijing.volces.com/api/v3", 
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'), 
)

completion = client.chat.completions.create(
    # Replace with Model ID .
    model = "doubao-seed-1-6-251015",
    messages=[
        {
            # 消息角色为用户
            "role": "user",
            "content": [
                {
                    "type": "video_url",
                    "video_url": {
                        # 替换链接为实际视频链接
                        "url":  "https://ark-project.tos-cn-beijing.volces.com/doc_video/video-understanding.mp4",
                        "fps": 5, # 每秒截取5帧画面，用于视频理解
                    }
                },
                # 文本类型的消息内容，询问视频里有什么
                {"type": "text", "text": "裁判什么时间点出现的？"},
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
    "fmt"
    "os"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        // The base URL for model invocation .
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    // 创建一个上下文，通常用于传递请求的上下文信息，如超时、取消等
    ctx := context.Background()
    // 构建消息内容
    contentParts := []*model.ChatCompletionMessageContentPart{
        {
            Type: "video_url",
            VideoURL: &model.ChatMessageVideoURL{
                URL: "https://ark-project.tos-cn-beijing.volces.com/doc_video/video-understanding.mp4",
                FPS: volcengine.Float64(5),
            },
        },
        // 文本内容
        {
            Type: "text",
            Text: "裁判什么时间点出现的？",
        },
    }
    // 构建聊天完成请求，设置请求的模型和消息内容
    req := model.CreateChatCompletionRequest{
        // Replace with Model ID
       Model: "doubao-seed-1-6-251015",
       Messages: []*model.ChatCompletionMessage{
          {
             // 消息的角色为用户
             Role: model.ChatMessageRoleUser,
             Content: &model.ChatCompletionMessageContent{
                ListValue: contentParts, // 多类型内容使用ListValue
             },
          },
       },
       MaxTokens: volcengine.Int(300), // 设置模型输出最大 token 数
    }

    // 发送聊天完成请求，并将结果存储在 resp 中，将可能出现的错误存储在 err 中
    resp, err := client.CreateChatCompletion(ctx, req)
    if err!= nil {
       // 若出现错误，打印错误信息并终止程序
       fmt.Printf("standard chat error: %v\n", err)
       return
    }
    // 打印聊天完成请求的响应结果
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

public class VideoSample {
  static String apiKey = System.getenv("ARK_API_KEY");
  static ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
  static Dispatcher dispatcher = new Dispatcher();
  static ArkService service = ArkService.builder()
      .dispatcher(dispatcher)
      .connectionPool(connectionPool)
      .baseUrl("https://ark.cn-beijing.volces.com/api/v3")  // The base URL for model invocation .
      .apiKey(apiKey) //Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
      .build();

  public static void main(String[] args) throws Exception {

    List<ChatMessage> messagesForReqList = new ArrayList<>();

    // 构建消息内容
    List<ChatCompletionContentPart> contentParts = new ArrayList<>();

    contentParts.add(ChatCompletionContentPart.builder()
        .type("video_url")
        .videoUrl(new ChatCompletionContentPartVideoURL(
            "https://ark-project.tos-cn-beijing.volces.com/doc_video/video-understanding.mp4",5))
        .build());

    contentParts.add(ChatCompletionContentPart.builder()
        .type("text")
        .text("裁判什么时间点出现的？")
        .build());

    // 创建消息
    messagesForReqList.add(ChatMessage.builder()
        .role(ChatMessageRole.USER)
        .multiContent(contentParts)
        .build());

    ChatCompletionRequest req = ChatCompletionRequest.builder()
        .model("doubao-seed-1-6-251015") //Replace with Model ID .
        .messages(messagesForReqList)
        .maxTokens(300)
        .build();

    service.createChatCompletion(req)
        .getChoices()
        .forEach(choice -> System.out.println(choice.getMessage().getContent()));
    // shutdown service after all requests are finished
    service.shutdownExecutor();
  }
}
```

回复预览
```Plain
根据视频描述，裁判在**3.7秒**左右出现。此时，画面中两位拳击手（左为黑T恤红短裤、右为白T恤黑短裤）原本处于对峙状态，随后裁判（穿着黑色西装、戴白手套）站到两人中间，似乎在准备开始比赛或暂停当前回合，观众仍在背景中欢呼。
```

## 流式输出
流式输出支持内容动态实时呈现，既能够缓解用户等待焦虑，又可以规避复杂任务因长时间推理引发的客户端超时失败问题，保障请求流程顺畅。

#### Python SDK

```Python
import asyncio
import os
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.responses.response_completed_event import ResponseCompletedEvent
from volcenginesdkarkruntime.types.responses.response_reasoning_summary_text_delta_event import ResponseReasoningSummaryTextDeltaEvent
from volcenginesdkarkruntime.types.responses.response_output_item_added_event import ResponseOutputItemAddedEvent
from volcenginesdkarkruntime.types.responses.response_text_delta_event import ResponseTextDeltaEvent
from volcenginesdkarkruntime.types.responses.response_text_done_event import ResponseTextDoneEvent

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

    stream = await client.responses.create(
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
        ],
        caching={
            "type": "enabled",
        },
        store=True,
        stream=True
    )
    
    async for event in stream:
        if isinstance(event, ResponseReasoningSummaryTextDeltaEvent):
            print(event.delta, end="")
        if isinstance(event, ResponseOutputItemAddedEvent):
            print("\noutPutItem " + event.type + " start:")
        if isinstance(event, ResponseTextDeltaEvent):
            print(event.delta,end="")
        if isinstance(event, ResponseTextDoneEvent):
            print("\noutPutTextDone.")
        if isinstance(event, ResponseCompletedEvent):
            print("Response Completed. Usage = " + event.response.usage.model_dump_json())

if __name__ == "__main__":
    asyncio.run(main())
```

#### Go SDK

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

    resp, err := client.CreateResponsesStream(ctx, createResponsesReq)
    if err != nil {
        fmt.Printf("stream error: %v\n", err)
        return
    }
    var responseId string
    for {
        event, err := resp.Recv()
        if err == io.EOF {
            break
        }
        if err != nil {
            fmt.Printf("stream error: %v\n", err)
            return
        }
        handleEvent(event)
        if responseEvent := event.GetResponse(); responseEvent != nil {
            responseId = responseEvent.GetResponse().GetId()
            fmt.Printf("Response ID: %s", responseId)
        }
    }
}

func handleEvent(event *responses.Event) {
    switch event.GetEventType() {
    case responses.EventType_response_reasoning_summary_text_delta.String():
        print(event.GetReasoningText().GetDelta())
    case responses.EventType_response_reasoning_summary_text_done.String(): // aggregated reasoning text
        fmt.Printf("\nAggregated reasoning text: %s\n", event.GetReasoningText().GetText())
    case responses.EventType_response_output_text_delta.String():
        print(event.GetText().GetDelta())
    case responses.EventType_response_output_text_done.String(): // aggregated output text
        fmt.Printf("\nAggregated output text: %s\n", event.GetTextDone().GetText())
    default:
        return
    }
}
```

#### Java SDK

```Java
package com.ark.example;

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

import com.volcengine.ark.runtime.model.responses.event.functioncall.FunctionCallArgumentsDoneEvent;
import com.volcengine.ark.runtime.model.responses.event.outputitem.OutputItemAddedEvent;
import com.volcengine.ark.runtime.model.responses.event.outputitem.OutputItemDoneEvent;
import com.volcengine.ark.runtime.model.responses.event.outputtext.OutputTextDeltaEvent;
import com.volcengine.ark.runtime.model.responses.event.outputtext.OutputTextDoneEvent;
import com.volcengine.ark.runtime.model.responses.event.reasoningsummary.ReasoningSummaryTextDeltaEvent;
import com.volcengine.ark.runtime.model.responses.event.response.ResponseCompletedEvent;
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
                .stream(true)
                .input(ResponsesInput.builder().addListItem(
                        ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                                MessageContent.builder()
                                        .addListItem(InputContentItemVideo.builder().fileId(fileMeta.getId()).build())
                                        .addListItem(InputContentItemText.builder().text("请你描述下视频中的人物的一系列动作，以JSON格式输出开始时间（start_time）、结束时间（end_time）、事件（event）、是否危险（danger），请使用HH:mm:ss表示时间戳。").build())
                                        .build()
                        ).build()
                ).build())
                .build();

        service.streamResponse(request)
                .doOnError(Throwable::printStackTrace)
                .blockingForEach(event -> {
                    if (event instanceof ReasoningSummaryTextDeltaEvent) {
                        System.out.print(((ReasoningSummaryTextDeltaEvent) event).getDelta());
                    }
                    if (event instanceof OutputItemAddedEvent) {
                        System.out.println("\nOutputItem " + (((OutputItemAddedEvent) event).getItem().getType()) + " Start: ");
                    }
                    if (event instanceof OutputTextDeltaEvent) {
                        System.out.print(((OutputTextDeltaEvent) event).getDelta());
                    }
                    if (event instanceof OutputTextDoneEvent) {
                        System.out.println("\nOutputText End.");
                    }
                    if (event instanceof OutputItemDoneEvent) {
                        System.out.println("\nOutputItem " + ((OutputItemDoneEvent) event).getItem().getType() + " End.");
                    }
                    if (event instanceof FunctionCallArgumentsDoneEvent) {
                        System.out.println("\nFunctionCall Arguments: " + ((FunctionCallArgumentsDoneEvent) event).getArguments());
                    }
                    if (event instanceof ResponseCompletedEvent) {
                        System.out.println("\nResponse Completed. Usage = " + ((ResponseCompletedEvent) event).getResponse().getUsage());
                    }
                });


        service.shutdownExecutor();
    }
}
```

#### 兼容 OpenAI SDK

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
    ],
    stream=True
)


for event in response:
    if event.type == "response.reasoning_summary_text.delta":
        print(event.delta, end="")
    if event.type == "response.output_item.added":
        print("\noutPutItem " + event.type + " start:")
    if event.type == "response.output_text.delta":
        print(event.delta,end="")
    if event.type == "response.output_item.done":
        print("\noutPutTextDone.")
    if event.type == "response.completed":
        print("\nResponse Completed. Usage = " + event.response.usage.model_dump_json())
```

# 使用说明
