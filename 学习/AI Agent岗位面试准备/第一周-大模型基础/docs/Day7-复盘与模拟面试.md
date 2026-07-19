# Day 7：复盘与模拟面试

## 今天学完能做什么

- 独立启动 Demo，演示普通聊天、SSE 和错误响应。
- 区分 Mock 验收、真实 API 自测和自动化测试。
- 脱稿讲清核心概念与 Java 调用链。
- 按明确清单判断第一周是否真正完成。

## 必须理解的概念

### 验收不是“启动成功”

第一周验收至少包含五层：

1. 概念：LLM、Token、上下文、采样、幻觉、结构化输出。
2. 协议：DeepSeek 普通 JSON、SSE、usage、finish_reason、`[DONE]`。
3. 代码：Controller -> Service -> `LlmClient` -> 客户端实现。
4. 工程：配置安全、校验、超时、错误转换、日志、取消。
5. 表达：10 个问答和三分钟项目讲稿能脱稿复述。

### 三类验证要分开

- Mock 验收：不需要 Key、不访问外网，验证本项目 Web 接口和流程。
- 自动化测试：用 JUnit、WebTestClient、MockWebServer 验证边界和协议，不调用真实 DeepSeek。
- 真实 API 自测：只有学习者自行设置有效 Key 且关闭 Mock 后才发生，应单独记录时间、模型、响应和用量。

文档与测试通过不等于真实 API 已调用成功。本学习包不得预写真实调用结果。

## 跟着做

### 第一轮：自动化测试

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd java-demo
mvn test
```

### 第二轮：Mock 演示

```bash
export LLM_MOCK_ENABLED=true
mvn spring-boot:run
```

另开终端：

```bash
curl -sS -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"用一句话解释 LLM","temperature":0.2,"topP":0.9}'

curl -N -G 'http://localhost:8080/api/chat/stream' \
  -H 'Accept: text/event-stream' \
  --data-urlencode 'message=流式解释 Token'
```

### 第三轮：真实模式（可选且必须自行执行）

```bash
export DEEPSEEK_API_KEY='在本机填写，不要提交'
export LLM_MOCK_ENABLED=false
mvn spring-boot:run
```

不要在录屏、终端历史截图或文档中暴露 Key。只有看到非 Mock 内容、真实 `usage` 和对应日志后，才能记录“本次真实调用成功”。

## 阅读项目代码

用 15 分钟完成一次闭卷导航：

1. 从 `Week1Application` 找到配置扫描入口。
2. 从 `application.yml` 找到 8 个 `llm.*` 配置项。
3. 从 `WebClientConfiguration` 解释 Mock/真实 Bean 装配。
4. 从 `ChatController` 分别找到普通和流式入口。
5. 从 `ChatService` 找到 requestId 与生命周期日志。
6. 从 `DeepSeekLlmClient` 找到普通响应、SSE 和错误分类。
7. 从 `GlobalExceptionHandler` 找到内部错误到 HTTP 状态映射。
8. 从测试类找到成功、401/403、429、5xx、超时、空 choices、非法 SSE 的证据。

## 修改实验

### 错误演示

保持 Mock 模式，发送空消息：

```bash
curl -i -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"   "}'
```

预期 400 和 `VALIDATION_ERROR`。再运行协议错误测试：

```bash
mvn -Dtest=DeepSeekLlmClientTest#mapsEmptyChoicesToProtocolFailure test
mvn -Dtest=DeepSeekLlmClientTest#mapsNetworkResponseTimeout test
```

### 录音复盘

录制三段音频：60 秒讲基础概念、90 秒讲 Java 调用链、3 分钟讲项目。回听时只记录三类问题：概念错误、调用链跳步、工程取舍说不清；每类只改最关键的一处，再录第二遍。

## 不看答案自测

1. 为什么 Mock 成功不能证明 DeepSeek 可用？
2. 本项目普通和流式接口分别返回什么 Reactor 类型？
3. `temperature`、`top_p`、`top_k` 有什么区别？
4. `finish_reason=length` 意味着什么？
5. 401、429、超时、协议错误在项目中分别如何分类？
6. SSE 客户端断开后为什么应该取消上游？
7. 当前项目还缺少哪些生产能力？

## 面试怎么说

> 我用 Java 17、Spring Boot WebFlux 和 WebClient 做了一个 DeepSeek 兼容协议学习 Demo。它同时支持普通 Mono 响应和 SSE Flux 流式响应，通过 LlmClient 隔离 Mock 与真实实现。工程上做了参数校验、环境变量配置、连接和响应超时、错误分类、安全响应、requestId 日志与取消传播。自动化测试使用 MockWebServer，不依赖真实 API；真实调用是否成功必须以我本人配置 Key 后的实际结果为准。

## 今日产出

- 一份完整验收记录，分为测试、Mock、真实模式三栏。
- 三段复盘录音及第二遍改进点。
- 一张第一周知识地图和一份未掌握问题清单。

## 完成打卡

- [ ] `mvn test` 全部通过。
- [ ] Mock 普通接口返回结构完整。
- [ ] Mock SSE 顺序为 `meta -> delta... -> done`。
- [ ] 参数错误返回安全统一结构。
- [ ] 能从入口脱稿讲完普通与流式调用链。
- [ ] 能回答配套 10 个面试问题。
- [ ] 三分钟项目介绍在 2 分 30 秒到 3 分 30 秒内完成。
- [ ] 真实 API 未执行时，验收记录明确标为“未验证”，不伪造结果。
