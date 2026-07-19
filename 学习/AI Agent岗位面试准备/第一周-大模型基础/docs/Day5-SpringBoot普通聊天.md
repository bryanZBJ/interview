# Day 5：Spring Boot 普通聊天

## 今天学完能做什么

- 从 HTTP 请求一路跟到 Mock 或 DeepSeek 客户端，再跟回 HTTP 响应。
- 解释 Controller、Service、`LlmClient` 接口和客户端实现各自职责。
- 说明 Spring 如何根据 `llm.mock-enabled` 只装配一个客户端。
- 用测试和 curl 验证普通聊天链路。

## 必须理解的概念

### 真实普通调用链

```text
POST /api/chat
  -> ChatController.chat(ChatRequest)
  -> ChatCommand
  -> ChatService.chat(ChatCommand)
  -> LlmClient.chat(command, requestId)
     -> MockLlmClient.chat(...)                 [llm.mock-enabled=true]
     -> DeepSeekLlmClient.chat(...)             [llm.mock-enabled=false]
        -> WebClient POST /chat/completions
        -> ChatCompletionResponse
        -> ChatResult
  -> ChatResponse.from(ChatResult)
  -> HTTP JSON
```

`LlmClient` 是统一契约，返回 `Mono<ChatResult>`。`WebClientConfiguration` 通过两个互斥的 `@ConditionalOnProperty` Bean 决定注入 `MockLlmClient` 还是 `DeepSeekLlmClient`，`ChatService` 不需要写 `if/else` 判断模式。

### 每层只做自己的事

- `ChatController`：接收 JSON、Bean Validation、额外输入长度校验、DTO 转换。
- `ChatService`：生成 UUID `requestId`，记录开始、成功、失败和耗时，把调用交给 `LlmClient`。
- `LlmClient`：定义普通和流式能力，隔离具体厂商。
- `MockLlmClient`：本地可预测回显，不访问网络。
- `DeepSeekLlmClient`：构造厂商请求、调用 HTTP、解析响应、分类错误。
- `GlobalExceptionHandler`：把内部异常转换为稳定、安全的 HTTP 错误结构。

### Mono 为什么没有立即调用

`ChatService.chat` 和 `DeepSeekLlmClient.chat` 都使用 `Mono.defer`。创建 Mono 只是描述流程，订阅发生后才生成 requestId、校验 Key、发起 HTTP 请求并记录日志，避免在组装响应链时提前产生副作用。

## 跟着做

启动 Mock：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export LLM_MOCK_ENABLED=true
cd java-demo
mvn spring-boot:run
```

另开终端发送请求：

```bash
curl -i -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "message":"解释 Controller 到 LlmClient 的职责边界",
    "systemPrompt":"你是 Java 面试官",
    "temperature":0.2,
    "topP":0.9,
    "maxTokens":256
  }'
```

确认响应包含 `requestId`、`model`、`content`、`finishReason`、`usage`、`durationMs`。Mock 的内容应以“Mock 回答：”开头，不能据此宣称 DeepSeek 已被调用。

## 阅读项目代码

严格按执行顺序阅读：

1. `web/model/WebModels.java` 中的 `ChatRequest` 与 `ChatResponse.from`。
2. `web/ChatController.java` 中的 `chat`、`validateMessage`。
3. `domain/ChatCommand.java` 与 `domain/ChatResult.java`。
4. `service/ChatService.java` 中的 `chat`。
5. `client/LlmClient.java` 中的 `chat` 契约。
6. `config/WebClientConfiguration.java` 中的条件装配。
7. `client/MockLlmClient.java` 与 `client/DeepSeekLlmClient.java`。
8. `web/GlobalExceptionHandler.java` 中的异常到 HTTP 状态映射。

## 修改实验

做三个不访问真实 API 的实验：

1. 删除 `message`：观察 `@NotBlank` 触发 400。
2. 设置 `temperature=2.1`：观察 `@DecimalMax` 触发 400。
3. 设置 `LLM_MAX_INPUT_LENGTH=10` 后重启，发送 11 个字符：观察 `ChatController.validateMessage` 使用配置上限与静态 4000 上限的较小值。

再运行分层测试：

```bash
mvn -Dtest=ChatControllerTest,ChatServiceTest,Week1ApplicationTest test
```

记录每个测试类验证的是 Web 映射、服务生命周期还是 Spring Bean 装配。

## 不看答案自测

1. `ChatController` 为什么不直接注入 `DeepSeekLlmClient`？
2. Mock/真实模式在哪里切换？
3. `requestId` 由哪一层生成？
4. `ChatResponse` 在哪里由领域结果转换而来？
5. 为什么使用 `Mono.defer`？
6. 上游 401 最终为什么对本项目调用方表现为安全的 502？

## 面试怎么说

> 普通聊天接口按 Controller、Service、Client 三层拆分。Controller 做 HTTP 校验和 DTO 转换，ChatService 生成 requestId 并记录生命周期，LlmClient 抽象模型厂商，DeepSeekLlmClient 才负责 WebClient 请求与协议解析。Mock 与真实实现通过 ConditionalOnProperty 互斥装配，所以业务层不关心运行模式。异常统一映射且不透传上游敏感正文。

## 今日产出

- 一张带方法名的普通调用链图。
- 一份成功请求和三份参数失败请求记录。
- 一段 90 秒分层设计口述。

## 完成打卡

- [ ] 能从 `POST /api/chat` 讲到 `ChatResponse` 返回。
- [ ] 能解释 6 个核心类/接口的职责。
- [ ] 能说明 Mock 与真实客户端如何互斥装配。
- [ ] 已完成三个本地错误实验。
- [ ] 已运行普通链路相关测试。
