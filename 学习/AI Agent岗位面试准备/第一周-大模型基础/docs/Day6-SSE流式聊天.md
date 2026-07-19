# Day 6：SSE 流式聊天

## 今天学完能做什么

- 解释 `Flux`、SSE 和普通 `Mono` 响应的区别。
- 沿真实代码讲清 `meta -> delta... -> done` 的事件链。
- 说明首事件、上游 `[DONE]`、异常和客户端取消如何处理。
- 用 curl 的无缓冲模式观察本地流式输出。

## 必须理解的概念

### Flux 与 SSE

`Mono<T>` 表示 0 或 1 个异步结果，适合普通聊天一次性返回完整 JSON；`Flux<T>` 表示 0 到多个异步元素，适合按顺序输出片段。SSE 是服务器通过一个 HTTP 长连接不断向客户端发送文本事件的协议，浏览器原生支持单向推送。

本项目对外事件：

| 事件 | 来源 | 内容 |
|---|---|---|
| `meta` | `DeepSeekLlmClient.stream` 或 `MockLlmClient.stream` | `requestId`、模型名，内容为空 |
| `delta` | DeepSeek `choices[0].delta.content` 或 Mock 固定片段 | 本次新增文本，不是完整答案 |
| `done` | 上游 `[DONE]` 或 Mock 最后一个元素 | `durationMs`，内容为空 |

`ChatController.stream` 把 `StreamChunk.Type` 转小写后写入 `ServerSentEvent.event`，把 `StreamResponse` 写入 data。

### 首事件与结束

真实模式中 `DeepSeekLlmClient.stream` 使用 `Flux.concat(Mono.just(meta), upstream)`，所以订阅后先发本项目 `meta`，再订阅上游 HTTP 流。随后 `bodyToFlux(String.class)` 逐条读取 SSE data，`concatMap` 保持顺序。

`takeUntil(this::isDoneData)` 会包含 `[DONE]` 这一项；`toStreamChunk` 识别它并生成本项目 `DONE`。如果上游直接断开且没有 `[DONE]`，`concatWith` 会制造 `PROTOCOL` 错误，避免把不完整流误判为成功。

### 空分片、异常与取消

- usage 分片的 `choices=[]`：`toStreamChunk` 返回 `Mono.empty()`，当前实现忽略 usage。
- 空 `delta.content`：忽略，不产生对外 `delta`。
- 非法 JSON 或空 data：转换为 `PROTOCOL` 错误。
- HTTP 401/403、429、5xx、超时：沿 Flux 以错误信号结束。
- 当前 `StreamChunk.Type` 只有 `META/DELTA/DONE`，没有 `ERROR`；响应开始后发生的异常不会被转换成一个自定义 SSE `error` 事件。
- 客户端断开时 WebFlux 会取消订阅；取消信号沿 Reactor 链传播到 WebClient 上游，`ChatService.doOnCancel` 记录取消日志。应通过服务日志和上游连接行为验证，不能只凭浏览器页面消失判断。

### GET 演示接口的安全边界

本项目为了便于用浏览器和 `curl` 学习 SSE，使用 `GET /api/chat/stream?message=...`。这不是生产接口范式：URL 可能进入浏览器历史、反向代理日志和监控标签。真实系统应使用 POST 传递 Prompt，并配合鉴权、数据脱敏、日志治理和请求大小限制。

## 跟着做

启动 Mock 后使用 `curl -N` 禁用输出缓冲：

```bash
curl -N -G 'http://localhost:8080/api/chat/stream' \
  -H 'Accept: text/event-stream' \
  --data-urlencode 'message=用流式方式解释 Token' \
  --data-urlencode 'temperature=0.2' \
  --data-urlencode 'topP=0.9' \
  --data-urlencode 'maxTokens=128'
```

预期按顺序看到 `event:meta`、至少两个 `event:delta`、`event:done`。这是 `MockLlmClient.stream` 的本地固定序列，不代表真实模型逐 Token 延迟。

## 阅读项目代码

1. `ChatController.stream`：GET 参数校验、`Flux<ServerSentEvent<StreamResponse>>` 映射。
2. `ChatService.stream`：requestId、成功/失败/取消日志。
3. `LlmClient.stream`：统一的 `Flux<StreamChunk>` 契约。
4. `MockLlmClient.stream`：本地 `META -> DELTA -> DELTA -> DONE`。
5. `DeepSeekLlmClient.stream`：上游请求、顺序解析、`[DONE]` 完整性检查。
6. `DeepSeekLlmClient.toStreamChunk`：过滤 usage/空 delta，映射文本片段。
7. `DeepSeekLlmClientTest.streamsRealDataOnlySseInOrderAndCompletesOnDone`：真实协议的本地模拟断言。

## 修改实验

完成三组本地实验：

1. 正常流：运行上面的 `curl -N`，标记四类事件的到达顺序。
2. 主动取消：请求过程中按 `Ctrl+C`；Mock 流非常快，若来不及观察取消日志，应运行测试或在调试环境临时增加延迟，不要把“没看到日志”写成取消失败。
3. 协议异常：运行 `mvn -Dtest=DeepSeekLlmClientTest#mapsEmptyOrInvalidSseDataToProtocolFailure test`，确认非法 SSE data 被识别为 `PROTOCOL`。

补充思考：如果要向前端稳定发送 `error` 事件，需要扩展 `StreamChunk.Type` 和 Controller 的错误恢复策略，同时考虑 HTTP Header 已提交后的状态码限制；当前代码尚未实现。

## 不看答案自测

1. 为什么流式接口返回 `Flux` 而不是 `Mono`？
2. 本项目第一个 SSE 事件是什么，它何时产生？
3. `delta.content` 为什么要按顺序拼接？
4. 上游没有 `[DONE]` 就断开会发生什么？
5. usage 分片为什么没有出现在对外事件中？
6. 当前流式异常是否会变成自定义 `event:error`？
7. 客户端取消如何传播到上游？

## 面试怎么说

> 流式接口使用 WebFlux 的 Flux 和 SSE。服务先发 meta，再由 WebClient 读取 DeepSeek 的 data-only SSE，用 concatMap 保证 delta 顺序；空 choices 的 usage 分片和空 delta 会被过滤，收到 `[DONE]` 后转成应用侧 done。如果上游未发送 `[DONE]` 就断开，按协议异常处理。客户端断开会触发 Reactor 取消并向 WebClient 传播，服务通过 doOnCancel 记录。当前实现没有自定义 SSE error 事件，我会把它作为后续增强点而不是已完成能力。

## 今日产出

- 一份 `curl -N` 的完整事件序列记录。
- 一张“DeepSeek data -> StreamChunk -> ServerSentEvent”的映射图。
- 一段 90 秒 SSE、结束与取消口述。

## 完成打卡

- [ ] 能区分 Mono、Flux 和 SSE。
- [ ] 能讲清 `meta -> delta -> done` 的真实代码路径。
- [ ] 能解释 `[DONE]` 缺失为什么是协议错误。
- [ ] 能准确说明当前没有 SSE `error` 事件。
- [ ] 已完成正常流、取消和协议异常实验。
