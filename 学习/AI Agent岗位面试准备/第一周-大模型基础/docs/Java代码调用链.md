# Java 代码调用链

本文只描述当前 `java-demo` 的真实实现。源码根包为 `com.zbj.interview.aiagent.week1`。

## 1. 启动与配置装配

```text
Week1Application.main
  -> SpringApplication.run
  -> @ConfigurationPropertiesScan
  -> LlmProperties 绑定 application.yml 的 llm.*
  -> WebClientConfiguration 创建客户端和 ChatService
```

### 关键文件

| 文件/类 | 真实职责 |
|---|---|
| `Week1Application` | Spring Boot 启动入口，并启用配置属性扫描 |
| `application.yml` | 定义端口和 `llm.*` 环境变量映射 |
| `LlmProperties` | 绑定 base URL、Key、模型、Mock 开关、超时和长度配置 |
| `WebClientConfiguration` | 条件装配 `MockLlmClient` 或 `DeepSeekLlmClient`，再注入 `ChatService` |

当 `llm.mock-enabled=true` 或属性缺失时，`mockLlmClient` Bean 生效；当值明确为 `false` 时，`deepSeekWebClient` 和 `deepSeekLlmClient` Bean 生效。两种客户端都实现 `LlmClient`，正常启动时只注入一个。

## 2. 普通聊天调用链

### 2.1 HTTP 入口与校验

```text
POST /api/chat
  -> ChatController.chat(@Valid ChatRequest)
  -> validateMessage(request.message())
  -> new ChatCommand(...)
```

`WebModels.ChatRequest` 使用 Bean Validation：

- `message`：非空，最大 4000 字符。
- `systemPrompt`：最大 2000 字符。
- `temperature`：0 到 2。
- `topP`：0 到 1。
- `maxTokens`：1 到 4096。

`ChatController.validateMessage` 还会取静态上限 4000 与 `LlmProperties.maxInputLength` 的较小值。注意这是 Java 字符长度校验，不是 tokenizer 的精确 Token 校验。

### 2.2 服务层

```text
ChatController.chat
  -> ChatService.chat(ChatCommand)
  -> Mono.defer
  -> UUID.randomUUID() 生成 requestId
  -> LlmClient.chat(command, requestId)
  -> doOnSuccess / doOnError 记录模型、结果和耗时
```

`ChatService` 依赖接口 `LlmClient`，不判断具体运行模式。它通过 Reactor Context 写入 `requestId`，当前日志语句同时显式传入 requestId。

### 2.3 Mock 分支

```text
LlmClient.chat
  -> MockLlmClient.chat
  -> Mono.just(ChatResult)
  -> content = "Mock 回答：" + command.message()
  -> usage = 0 / 0 / 0，durationMs = 0
```

Mock 只用于本地流程学习，不模拟采样差异，不产生真实 Token 用量，也不访问 DeepSeek。

### 2.4 DeepSeek 分支

```text
LlmClient.chat
  -> DeepSeekLlmClient.chat
  -> validateApiKey
  -> toRequest(command, false)
  -> WebClient.post()
       .uri("/chat/completions")
       .bodyValue(ChatCompletionRequest)
       .retrieve()
  -> HTTP 状态分类
  -> bodyToMono(ChatCompletionResponse.class)
  -> toResult(response, requestId, startedAt)
  -> ChatResult
```

`toRequest` 的真实行为：

1. `systemPrompt` 非空时加入 `new Message("system", ...)`。
2. 总是加入当前 `new Message("user", command.message())`。
3. 空 `temperature` 使用 0.2，空 `topP` 使用 0.9。
4. 空 `maxTokens` 使用 `llm.default-max-tokens`。
5. 普通模式传 `stream=false`、`streamOptions=null`。

`toResult` 只读取 `choices[0]`。缺少 `choices`、第一项 `message.content` 或 `usage` 时抛出 `PROTOCOL`；成功时映射为 `ChatResult` 并计算 `durationMs`。

### 2.5 返回 Web 响应

```text
ChatResult
  -> ChatResponse.from(result)
  -> WebModels.Usage
  -> Mono<ChatResponse>
  -> HTTP 200 application/json
```

本项目返回的 `requestId` 是 `ChatService` 生成的 UUID，不是 DeepSeek 响应中的 completion `id`。

## 3. SSE 流式聊天调用链

### 3.1 HTTP 入口

```text
GET /api/chat/stream?message=...
  -> ChatController.stream(...)
  -> validateStreamParameters
  -> new ChatCommand(...)
  -> ChatService.stream(command)
```

流式 GET 参数由 `ChatController` 手工校验，范围与普通请求一致。方法返回 `Flux<ServerSentEvent<StreamResponse>>`。

### 3.2 服务层与取消

```text
ChatService.stream
  -> Flux.defer
  -> 生成 requestId
  -> LlmClient.stream(command, requestId)
  -> doOnComplete / doOnError / doOnCancel
```

Web 客户端断开会取消下游订阅，取消信号沿 Reactor 链传播到 WebClient 上游；`doOnCancel` 负责记录。当前代码没有自行重连或断点续传。

### 3.3 Mock 流

```text
MockLlmClient.stream
  -> META
  -> DELTA("Mock 流式回答：")
  -> DELTA(command.message())
  -> DONE(durationMs=0)
```

### 3.4 DeepSeek 流

```text
DeepSeekLlmClient.stream
  -> Flux.concat(Mono.just(META), upstream)
  -> upstream: validateApiKey
  -> toRequest(command, true)
  -> WebClient POST /chat/completions
       Accept: text/event-stream
  -> bodyToFlux(String.class)
  -> takeUntil(data == "[DONE]")
  -> concatMap(toStreamChunk)
  -> 若流结束但未收到 [DONE]，抛 PROTOCOL
```

`toStreamChunk` 的分支：

| 上游 data | 当前处理 |
|---|---|
| 空字符串或空白 | `PROTOCOL` 错误 |
| `[DONE]` | 生成 `StreamChunk.Type.DONE` |
| 非法 JSON | `PROTOCOL` 错误 |
| `choices` 为空 | 忽略；这会过滤 include_usage 分片 |
| `delta.content` 为空 | 忽略 |
| 有文本增量 | 生成 `StreamChunk.Type.DELTA` |

### 3.5 转为对外 SSE

```text
StreamChunk
  -> ChatController.stream.map
  -> event = chunk.type().name().toLowerCase()
  -> data = StreamResponse.from(chunk)
  -> ServerSentEvent<StreamResponse>
```

当前事件只有 `meta`、`delta`、`done`。当前代码没有 `StreamChunk.Type.ERROR`，也没有在 Controller 中用 `onErrorResume` 生成自定义 SSE `error` 事件。

## 4. 错误调用链

```text
DeepSeek HTTP/网络/JSON 异常
  -> DeepSeekLlmClient.onStatus / mapFailure / protocolFailure
  -> LlmCallException(LlmErrorType)
  -> 普通请求：GlobalExceptionHandler.handleLlmCall
  -> ErrorResponse(timestamp, requestId, code, safeMessage)
```

| 上游/内部情况 | `LlmErrorType` | 普通接口 HTTP 状态 |
|---|---|---:|
| 401/403 | `AUTHENTICATION` | 502 |
| 429 | `RATE_LIMIT` | 429 |
| 5xx 或其他上游 4xx | `UPSTREAM` | 502 |
| 连接/读取/整体超时 | `TIMEOUT` | 504 |
| 非法 JSON、空 choices、缺字段、SSE 无 `[DONE]` | `PROTOCOL` | 502 |
| 真实模式缺少 API Key | `CONFIGURATION` | 503 |

`safeHttpFailure` 会释放上游响应体，但不会把原始正文返回给调用方。流式响应一旦已开始发送，后续错误以 Flux 错误结束，不能保证再改 HTTP 状态或返回普通 `ErrorResponse`。

## 5. 测试证据索引

| 测试类 | 覆盖证据 |
|---|---|
| `Week1ApplicationTest` | Mock 模式只装配一个 `MockLlmClient` 和一个 `ChatService` |
| `LlmPropertiesTest` | 8 个 `llm.*` 配置项正确绑定 |
| `ChatControllerTest` | DTO 映射、校验、SSE 事件名、安全错误响应 |
| `ChatServiceTest` | UUID requestId、Mock 普通结果、流事件 requestId 一致性 |
| `DeepSeekLlmClientTest` | 路径、Header、请求 JSON、普通解析、401/403、429、5xx、超时、空 choices、SSE、`[DONE]`、非法 data |

这些测试使用本地 Stub 或 `MockWebServer`，不是“已成功调用真实 DeepSeek API”的证据。
