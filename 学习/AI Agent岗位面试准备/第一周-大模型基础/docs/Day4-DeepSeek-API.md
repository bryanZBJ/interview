# Day 4：DeepSeek API

## 今天学完能做什么

- 读懂本项目发送给 DeepSeek Chat Completions API 的 URL、Header 和请求体。
- 解释普通响应中的 `choices`、`usage`、`finish_reason`。
- 解释流式响应中的 SSE、`delta`、usage 分片和 `[DONE]`。
- 区分 DeepSeek 官方协议与本项目自己的 Web API 字段。

## 必须理解的概念

### URL 与 Header

本项目 `application.yml` 默认 `llm.base-url=https://api.deepseek.com`，`DeepSeekLlmClient` 再调用相对路径 `/chat/completions`，组合后的目标是 `https://api.deepseek.com/chat/completions`。

`WebClientConfiguration.deepSeekWebClient` 设置：

- `Authorization: Bearer <DEEPSEEK_API_KEY>`：模型鉴权信息，只应放请求 Header，不能写进文档、代码或日志。
- `Content-Type: application/json`：由 `bodyValue` 的 JSON 请求自动使用。
- `Accept: text/event-stream`：仅流式调用显式设置。

### 本项目实际发送的请求字段

| DeepSeek 字段 | 本项目来源 | 含义 |
|---|---|---|
| `model` | `LlmProperties.model`，默认 `deepseek-v4-flash` | 本项目配置的模型标识；实际可用值以调用时账号和官方文档为准 |
| `messages` | `DeepSeekLlmClient.toRequest` | 可选 `system` 加当前 `user` 消息，本项目没有历史消息存储 |
| `thinking.type` | 固定为 `disabled` | 第一周使用非思考模式，便于观察采样参数和普通/SSE 协议 |
| `temperature` | `ChatCommand.temperature`，空值默认 0.2 | 调整采样概率分布 |
| `top_p` | `ChatCommand.topP`，空值默认 0.9 | nucleus sampling 的累计概率阈值 |
| `max_tokens` | 请求值或 `llm.default-max-tokens` | 限制最大生成 Token 数 |
| `stream` | 普通为 `false`，流式为 `true` | 是否返回 SSE 增量流 |
| `stream_options.include_usage` | 流式时为 `true` | 请求在 `[DONE]` 前额外返回总 usage 分片 |

### 普通响应字段

- `id`：DeepSeek 生成的 completion 标识；当前 `DeepSeekModels` 能反序列化，但业务结果没有透传它。
- `model`：实际响应中的模型名；为空时项目回退到配置模型名。
- `choices`：候选回答列表；当前代码只读取第 1 项。
- `choices[0].message.content`：最终文本回答。
- `finish_reason`：停止原因。常见值包括 `stop`、`length`、`content_filter`、`tool_calls`、`insufficient_system_resource`；`length` 表示结果可能被截断，不能当作完整回答。
- `usage.prompt_tokens`：输入 Token 数。
- `usage.completion_tokens`：生成 Token 数。
- `usage.total_tokens`：总 Token 数。

### SSE、delta、usage 分片和 `[DONE]`

DeepSeek 流式响应使用 SSE，每个数据帧形如 `data: {...}`。JSON 分片中的 `choices[0].delta.content` 是本次新增文本，需要客户端按顺序拼接；它不是每次都返回完整答案。

当 `include_usage=true` 时，`[DONE]` 前可出现 `choices=[]` 且包含完整 `usage` 的额外分片。本项目 `toStreamChunk` 会忽略空 `choices`，目前没有把流式 usage 暴露给调用方。最后的 `data: [DONE]` 是上游协议结束标记，不是 JSON；项目收到它后生成自己的 `StreamChunk.Type.DONE`。

官方字段参考：[DeepSeek 对话补全](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)；错误码参考：[DeepSeek 错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)。

> 模型名称是时效性配置。`deepseek-chat` 已进入退役过渡期，学习包于 2026-07-19 迁移到 `deepseek-v4-flash`。真实联调前应再查官方更新日志，不要把模型名硬编码在业务类中。

## 跟着做

先检查配置，不输出 Key 内容：

```bash
cd java-demo
rg -n 'base-url|api-key|model|mock-enabled|timeout' src/main/resources/application.yml
test -n "$DEEPSEEK_API_KEY" && echo 'DEEPSEEK_API_KEY 已设置' || echo 'DEEPSEEK_API_KEY 未设置'
```

再运行不访问真实 DeepSeek 的协议测试：

```bash
mvn -Dtest=DeepSeekLlmClientTest test
```

该测试使用 `MockWebServer`，会验证路径、Bearer Header、普通 JSON、SSE、`[DONE]` 和错误映射；它不消耗真实 API 额度。

## 阅读项目代码

1. `application.yml`：环境变量与默认值。
2. `LlmProperties.java`：`llm.*` 的强类型配置绑定。
3. `WebClientConfiguration.java`：base URL、Bearer Header、连接超时、响应超时。
4. `DeepSeekModels.java`：DeepSeek JSON 与 Java record 的字段映射。
5. `DeepSeekLlmClient.java`：`toRequest`、`toResult`、`toStreamChunk` 和 HTTP 状态映射。
6. `DeepSeekLlmClientTest.java`：本地模拟的真实协议样例和断言。

## 修改实验

复制测试中的普通响应样例，手工完成以下标注：

| 字段 | Java 映射 | 是否透传给本项目调用方 |
|---|---|---|
| `id` | `ChatCompletionResponse.id` | 否 |
| `choices[0].message.content` | `Message.content` | 是，映射为 `ChatResponse.content` |
| `finish_reason` | `Choice.finishReason` | 是，映射为 `finishReason` |
| `usage.*` | `Usage` | 是，映射为 `ChatResponse.usage` |

然后把 SSE 测试样例按帧编号，写出拼接后的文本，并指出哪个帧被忽略、哪个标记触发本项目 `DONE`。不要填写任何真实 Key。

## 不看答案自测

1. base URL 与 `/chat/completions` 在哪里组合？
2. 为什么 API Key 不能放请求 JSON？
3. `finish_reason=length` 应怎样处理？
4. 流式 `delta.content` 是完整答案还是增量？
5. 为什么 usage 分片的 `choices=[]` 在当前代码中不会报错？
6. `[DONE]` 为什么不能交给 Jackson 当 JSON 解析？

## 面试怎么说

> 我用 WebClient 接 DeepSeek 的 OpenAI-compatible Chat Completions 协议。配置层负责 base URL、Bearer Key 和超时，客户端把领域命令转换成 model、messages、temperature、top_p、max_tokens 和 stream。普通响应读取第一项 choice、finish_reason 与 usage；流式响应按 SSE 顺序解析 delta，忽略空 choices 的 usage 分片，并在收到 `[DONE]` 后生成应用侧 done 事件。鉴权、限流、超时和协议异常会转换成安全错误，不透传上游正文。

## 今日产出

- 一张“项目字段 -> DeepSeek 字段 -> 项目响应字段”映射表。
- 一份普通 JSON 和 SSE 分片的手工标注。
- 一段 60 秒 DeepSeek 协议口述。

## 完成打卡

- [ ] 能写出本项目目标 URL 和三个关键 Header/媒体类型。
- [ ] 能解释请求体 7 个字段。
- [ ] 能解释 `usage` 与 `finish_reason`。
- [ ] 能说明 usage 分片和 `[DONE]` 的不同。
- [ ] 已运行 `DeepSeekLlmClientTest`，且知道它没有调用真实 API。
