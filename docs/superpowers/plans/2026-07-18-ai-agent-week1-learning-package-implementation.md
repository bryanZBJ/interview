# AI Agent 第一周学习包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `学习/AI Agent岗位面试准备/第一周-大模型基础` 中交付可运行的 DeepSeek Java/Python Demo、实验材料、七天讲义、测试和面试表达。

**Architecture:** Java 主项目使用 Spring Boot 3.4.13、WebFlux WebClient 和 Java 17，`LlmClient` 隔离真实 DeepSeek 与本地 Mock 实现，`ChatService` 负责编排，Controller 提供普通 JSON 和 SSE 流式接口。所有自动化测试使用 MockWebServer 或 Mock 客户端，不消耗真实 DeepSeek 额度；真实密钥只通过环境变量注入。

**Tech Stack:** Java 17、Spring Boot 3.4.13、Spring WebFlux、Bean Validation、Reactor、JUnit 5、MockWebServer、Python 3、Shell、DeepSeek OpenAI-compatible Chat API。

---

## 文件结构

```text
学习/AI Agent岗位面试准备/第一周-大模型基础/
├── README.md
├── .gitignore
├── java-demo/
│   ├── pom.xml
│   ├── src/main/java/com/zbj/interview/aiagent/week1/
│   │   ├── Week1Application.java
│   │   ├── client/
│   │   │   ├── LlmClient.java
│   │   │   ├── DeepSeekLlmClient.java
│   │   │   ├── MockLlmClient.java
│   │   │   └── model/DeepSeekModels.java
│   │   ├── config/
│   │   │   ├── LlmProperties.java
│   │   │   └── WebClientConfiguration.java
│   │   ├── domain/
│   │   │   ├── ChatCommand.java
│   │   │   ├── ChatResult.java
│   │   │   └── StreamChunk.java
│   │   ├── exception/
│   │   │   ├── LlmCallException.java
│   │   │   └── LlmErrorType.java
│   │   ├── service/ChatService.java
│   │   └── web/
│   │       ├── ChatController.java
│   │       ├── GlobalExceptionHandler.java
│   │       └── model/WebModels.java
│   ├── src/main/resources/application.yml
│   └── src/test/java/com/zbj/interview/aiagent/week1/
│       ├── client/DeepSeekLlmClientTest.java
│       ├── service/ChatServiceTest.java
│       └── web/ChatControllerTest.java
├── python-demo/
│   ├── requirements.txt
│   ├── chat.py
│   └── stream_chat.py
├── experiments/
│   ├── 01-token与上下文实验.md
│   ├── 02-采样参数实验.md
│   ├── 03-幻觉对照实验.md
│   └── 04-结构化输出实验.md
├── docs/
│   ├── Day1-LLM与Token.md
│   ├── Day2-上下文与采样参数.md
│   ├── Day3-幻觉与结构化输出.md
│   ├── Day4-DeepSeek-API.md
│   ├── Day5-SpringBoot普通聊天.md
│   ├── Day6-SSE流式聊天.md
│   ├── Day7-复盘与模拟面试.md
│   ├── Java代码调用链.md
│   ├── 常见错误排查.md
│   └── 面试问答与三分钟讲稿.md
└── scripts/
    ├── check-env.sh
    ├── chat.sh
    └── stream-chat.sh
```

## Task 1：建立学习目录和 Java 17 Spring Boot 骨架

**Files:**
- Create: `学习/AI Agent岗位面试准备/第一周-大模型基础/.gitignore`
- Create: `学习/AI Agent岗位面试准备/第一周-大模型基础/README.md`
- Create: `学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo/pom.xml`
- Create: `学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo/src/main/java/com/zbj/interview/aiagent/week1/Week1Application.java`
- Create: `学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo/src/main/resources/application.yml`
- Test: `学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo/src/test/java/com/zbj/interview/aiagent/week1/Week1ApplicationTest.java`

- [ ] **Step 1：先写上下文启动测试**

```java
package com.zbj.interview.aiagent.week1;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "llm.mock-enabled=true")
class Week1ApplicationTest {
    @Test
    void contextLoads() {
    }
}
```

- [ ] **Step 2：运行测试，确认项目骨架尚不存在**

```bash
cd '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn test
```

Expected: FAIL，提示缺少 `pom.xml` 或应用类。

- [ ] **Step 3：创建 Maven 配置和应用入口**

`pom.xml` 使用：

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.4.13</version>
  <relativePath/>
</parent>
<groupId>com.zbj.interview</groupId>
<artifactId>ai-agent-week1-demo</artifactId>
<version>1.0.0-SNAPSHOT</version>
<properties><java.version>17</java.version></properties>
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webflux</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
  </dependency>
  <dependency>
    <groupId>io.projectreactor</groupId>
    <artifactId>reactor-test</artifactId>
    <scope>test</scope>
  </dependency>
  <dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>mockwebserver</artifactId>
    <version>4.12.0</version>
    <scope>test</scope>
  </dependency>
</dependencies>
<build><plugins><plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
</plugin></plugins></build>
```

```java
package com.zbj.interview.aiagent.week1;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class Week1Application {
    public static void main(String[] args) {
        SpringApplication.run(Week1Application.class, args);
    }
}
```

`application.yml`：

```yaml
server:
  port: 8080
llm:
  base-url: ${LLM_BASE_URL:https://api.deepseek.com}
  api-key: ${DEEPSEEK_API_KEY:}
  model: ${LLM_MODEL:deepseek-chat}
  mock-enabled: ${LLM_MOCK_ENABLED:true}
  connect-timeout: 3s
  response-timeout: 60s
  max-input-length: 4000
  default-max-tokens: 512
logging:
  pattern:
    console: "%d{HH:mm:ss.SSS} %-5level [%X{requestId:-}] %logger{36} - %msg%n"
```

- [ ] **Step 4：创建安全忽略规则和总 README 骨架**

`.gitignore`：

```gitignore
.env
*.local
**/target/
**/__pycache__/
**/.venv/
.idea/
```

README 先写清 JDK 切换命令、Mock 模式和目录用途；真实 Key 只展示变量名，不展示值。

- [ ] **Step 5：运行测试并提交**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn test
```

Expected: `BUILD SUCCESS`。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础'
git commit -m "feat: scaffold AI Agent week one demo"
```

## Task 2：配置绑定、领域模型和错误类型

**Files:**
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/config/LlmProperties.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/domain/ChatCommand.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/domain/ChatResult.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/domain/StreamChunk.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/exception/LlmErrorType.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/exception/LlmCallException.java`
- Test: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/config/LlmPropertiesTest.java`

- [ ] **Step 1：写配置绑定和默认值测试**

```java
@SpringBootTest(properties = {
    "llm.mock-enabled=true",
    "llm.model=test-model",
    "llm.max-input-length=100"
})
class LlmPropertiesTest {
    @Autowired LlmProperties properties;

    @Test
    void bindsConfiguration() {
        assertThat(properties.model()).isEqualTo("test-model");
        assertThat(properties.maxInputLength()).isEqualTo(100);
        assertThat(properties.mockEnabled()).isTrue();
    }
}
```

- [ ] **Step 2：运行单测确认类不存在**

Run: `mvn -Dtest=LlmPropertiesTest test`

Expected: FAIL，`LlmProperties` cannot be resolved。

- [ ] **Step 3：实现配置和不可变领域模型**

```java
@ConfigurationProperties("llm")
public record LlmProperties(
    URI baseUrl,
    String apiKey,
    String model,
    boolean mockEnabled,
    Duration connectTimeout,
    Duration responseTimeout,
    int maxInputLength,
    int defaultMaxTokens
) {}
```

```java
public record ChatCommand(
    String message,
    String systemPrompt,
    Double temperature,
    Double topP,
    Integer maxTokens
) {}

public record ChatResult(
    String requestId,
    String model,
    String content,
    String finishReason,
    Integer promptTokens,
    Integer completionTokens,
    Integer totalTokens,
    long durationMs
) {}

public record StreamChunk(Type type, String requestId, String model,
                          String content, Long durationMs) {
    public enum Type { META, DELTA, DONE }
}
```

错误枚举固定为 `AUTHENTICATION`、`RATE_LIMIT`、`TIMEOUT`、`UPSTREAM`、`PROTOCOL`、`CONFIGURATION`，`LlmCallException` 持有类型和安全消息。

- [ ] **Step 4：运行全部测试并提交**

Run: `mvn test`

Expected: PASS。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
git commit -m "feat: add LLM configuration and domain models"
```

## Task 3：用 TDD 实现 Mock LLM 和 ChatService

**Files:**
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/LlmClient.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/MockLlmClient.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/service/ChatService.java`
- Test: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/service/ChatServiceTest.java`

- [ ] **Step 1：写普通和流式服务测试**

```java
class ChatServiceTest {
    private final LlmProperties properties = new LlmProperties(
        URI.create("http://localhost"), "", "deepseek-chat", true,
        Duration.ofSeconds(1), Duration.ofSeconds(5), 4000, 512);
    private final ChatService service = new ChatService(new MockLlmClient(properties), properties);

    @Test
    void returnsMockChatResult() {
        ChatResult result = service.chat(new ChatCommand("解释 Token", null, 0.2, 0.9, 128)).block();
        assertThat(result.content()).contains("Mock").contains("解释 Token");
        assertThat(result.requestId()).isNotBlank();
    }

    @Test
    void streamsMetaDeltaAndDone() {
        StepVerifier.create(service.stream(new ChatCommand("流式回答", null, 0.2, 0.9, 128)))
            .expectNextMatches(it -> it.type() == StreamChunk.Type.META)
            .expectNextMatches(it -> it.type() == StreamChunk.Type.DELTA)
            .thenConsumeWhile(it -> it.type() == StreamChunk.Type.DELTA)
            .expectNextMatches(it -> it.type() == StreamChunk.Type.DONE)
            .verifyComplete();
    }
}
```

- [ ] **Step 2：运行测试确认失败**

Run: `mvn -Dtest=ChatServiceTest test`

Expected: FAIL，缺少 `LlmClient`、`MockLlmClient`、`ChatService`。

- [ ] **Step 3：实现客户端接口和 Mock 行为**

```java
public interface LlmClient {
    Mono<ChatResult> chat(ChatCommand command, String requestId);
    Flux<StreamChunk> stream(ChatCommand command, String requestId);
}
```

`MockLlmClient.chat` 返回包含用户问题的固定结果；`stream` 使用 `Flux.just` 依次返回两个以上 DELTA，最后返回 DONE。`ChatService` 用 UUID 生成 requestId，并通过 `doOnEach` 将 requestId 放入 Reactor Context 或使用结构化日志字段记录开始、成功、失败和耗时。

- [ ] **Step 4：运行测试并提交**

Run: `mvn test`

Expected: PASS。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
git commit -m "feat: add mock LLM chat service"
```

## Task 4：实现 DeepSeek 普通调用

**Files:**
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/config/WebClientConfiguration.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/model/DeepSeekModels.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/DeepSeekLlmClient.java`
- Test: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/client/DeepSeekLlmClientTest.java`

- [ ] **Step 1：用 MockWebServer 写成功、401、429、5xx 和空 choices 测试**

成功响应至少使用：

```json
{
  "id":"req-1",
  "model":"deepseek-chat",
  "choices":[{"message":{"role":"assistant","content":"Token 是模型处理文本的单位"},"finish_reason":"stop"}],
  "usage":{"prompt_tokens":10,"completion_tokens":12,"total_tokens":22}
}
```

断言请求：

```java
RecordedRequest request = server.takeRequest();
assertThat(request.getPath()).isEqualTo("/chat/completions");
assertThat(request.getHeader("Authorization")).isEqualTo("Bearer test-key");
assertThat(request.getBody().readUtf8()).contains("deepseek-chat").contains("解释 Token");
```

- [ ] **Step 2：运行测试确认失败**

Run: `mvn -Dtest=DeepSeekLlmClientTest test`

Expected: FAIL，缺少真实客户端。

- [ ] **Step 3：实现 WebClient 和 DeepSeek DTO**

`WebClientConfiguration` 使用 Reactor Netty：

```java
HttpClient httpClient = HttpClient.create()
    .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) properties.connectTimeout().toMillis())
    .responseTimeout(properties.responseTimeout());
return WebClient.builder()
    .baseUrl(properties.baseUrl().toString())
    .clientConnector(new ReactorClientHttpConnector(httpClient))
    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
    .build();
```

DeepSeek 请求体包含 `model`、`messages`、`temperature`、`top_p`、`max_tokens`、`stream`。普通响应解析首个 choice 和 usage；当 Key 为空且 Mock 关闭时抛 `CONFIGURATION`。

- [ ] **Step 4：映射 HTTP 错误**

```java
.onStatus(status -> status.value() == 401 || status.value() == 403,
    response -> Mono.error(new LlmCallException(AUTHENTICATION, "模型鉴权失败")))
.onStatus(status -> status.value() == 429,
    response -> Mono.error(new LlmCallException(RATE_LIMIT, "模型请求过于频繁")))
.onStatus(HttpStatusCode::is5xxServerError,
    response -> Mono.error(new LlmCallException(UPSTREAM, "模型服务暂时不可用")))
```

网络超时映射为 `TIMEOUT`，JSON 或空 choices 映射为 `PROTOCOL`。

- [ ] **Step 5：运行测试并提交**

Run: `mvn test`

Expected: PASS，且测试未访问真实 DeepSeek。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
git commit -m "feat: add DeepSeek chat client"
```

## Task 5：提供普通聊天 HTTP 接口和统一错误响应

**Files:**
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/web/model/WebModels.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/web/ChatController.java`
- Create: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/web/GlobalExceptionHandler.java`
- Test: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/web/ChatControllerTest.java`

- [ ] **Step 1：写 WebTestClient 测试**

覆盖正常、空 message、超长 message、temperature 超范围和 `LlmCallException`：

```java
webTestClient.post().uri("/api/chat")
    .contentType(MediaType.APPLICATION_JSON)
    .bodyValue("{\"message\":\"解释 Token\",\"temperature\":0.2}")
    .exchange()
    .expectStatus().isOk()
    .expectBody()
    .jsonPath("$.content").value(value -> assertThat(value.toString()).contains("Mock"));
```

- [ ] **Step 2：运行测试确认接口不存在**

Run: `mvn -Dtest=ChatControllerTest test`

Expected: FAIL，404 或缺少 Controller。

- [ ] **Step 3：实现请求、响应和校验**

```java
public record ChatRequest(
    @NotBlank @Size(max = 4000) String message,
    @Size(max = 2000) String systemPrompt,
    @DecimalMin("0.0") @DecimalMax("2.0") Double temperature,
    @DecimalMin("0.0") @DecimalMax("1.0") Double topP,
    @Min(1) @Max(4096) Integer maxTokens
) {}
```

Controller 将请求映射成 `ChatCommand`，返回 `Mono<ChatResponse>`。异常处理返回统一字段 `timestamp`、`requestId`、`code`、`message`，不包含 DeepSeek 原始响应和 API Key。

- [ ] **Step 4：运行测试并提交**

Run: `mvn test`

Expected: PASS。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
git commit -m "feat: expose validated chat endpoint"
```

## Task 6：实现 DeepSeek SSE 流式调用和流式接口

**Files:**
- Modify: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/DeepSeekLlmClient.java`
- Modify: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/model/DeepSeekModels.java`
- Modify: `java-demo/src/main/java/com/zbj/interview/aiagent/week1/web/ChatController.java`
- Modify: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/client/DeepSeekLlmClientTest.java`
- Modify: `java-demo/src/test/java/com/zbj/interview/aiagent/week1/web/ChatControllerTest.java`

- [ ] **Step 1：写真实 SSE 格式解析测试**

MockWebServer 返回：

```text
data: {"id":"1","model":"deepseek-chat","choices":[{"delta":{"content":"Token"},"finish_reason":null}]}

data: {"id":"1","model":"deepseek-chat","choices":[{"delta":{"content":" 是文本单位"},"finish_reason":"stop"}]}

data: [DONE]

```

使用 `StepVerifier` 断言 META、两个 DELTA、DONE 顺序和完整结束。

- [ ] **Step 2：运行测试确认流式实现失败**

Run: `mvn -Dtest=DeepSeekLlmClientTest,ChatControllerTest test`

Expected: FAIL，真实客户端的 stream 尚未实现或接口不存在。

- [ ] **Step 3：实现 SSE 解码**

请求设置 `stream=true` 和 `stream_options.include_usage=true`。使用：

```java
ParameterizedTypeReference<ServerSentEvent<String>> type = new ParameterizedTypeReference<>() {};
return webClient.post()
    .uri("/chat/completions")
    .contentType(MediaType.APPLICATION_JSON)
    .accept(MediaType.TEXT_EVENT_STREAM)
    .bodyValue(request)
    .retrieve()
    .bodyToFlux(type)
    .map(ServerSentEvent::data)
    .takeUntil("[DONE]"::equals)
    .transform(data -> parseChunks(data, requestId));
```

`[DONE]` 转换为 DONE；空 choices 的 usage chunk 只更新用量，不输出空 DELTA；取消订阅时通过 `doOnCancel` 记录取消日志。

- [ ] **Step 4：实现 SSE Controller**

```java
@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<StreamResponse>> stream(
        @RequestParam @NotBlank @Size(max = 4000) String message,
        @RequestParam(required = false) Double temperature,
        @RequestParam(required = false) Double topP) {
    return chatService.stream(toCommand(message, temperature, topP))
        .map(chunk -> ServerSentEvent.builder(StreamResponse.from(chunk))
            .event(chunk.type().name().toLowerCase(Locale.ROOT))
            .build());
}
```

- [ ] **Step 5：运行测试并提交**

Run: `mvn test`

Expected: PASS。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
git commit -m "feat: add DeepSeek SSE streaming"
```

## Task 7：补齐 Python Demo 和调用脚本

**Files:**
- Create: `python-demo/requirements.txt`
- Create: `python-demo/chat.py`
- Create: `python-demo/stream_chat.py`
- Create: `scripts/check-env.sh`
- Create: `scripts/chat.sh`
- Create: `scripts/stream-chat.sh`

- [ ] **Step 1：创建环境检查脚本**

```bash
#!/usr/bin/env bash
set -euo pipefail
command -v java >/dev/null || { echo "缺少 Java"; exit 1; }
command -v mvn >/dev/null || { echo "缺少 Maven"; exit 1; }
/usr/libexec/java_home -v 17 >/dev/null || { echo "缺少 JDK 17"; exit 1; }
if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "未配置 DEEPSEEK_API_KEY，可先使用 Mock 模式"
else
  echo "DeepSeek Key 已配置（不会打印具体值）"
fi
```

- [ ] **Step 2：实现普通 Python 请求**

```python
import os
import requests

api_key = os.environ["DEEPSEEK_API_KEY"]
base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
payload = {
    "model": os.getenv("LLM_MODEL", "deepseek-chat"),
    "messages": [{"role": "user", "content": "解释什么是 Token"}],
    "temperature": 0.2,
    "stream": False,
}
response = requests.post(
    f"{base_url}/chat/completions",
    headers={"Authorization": f"Bearer {api_key}"},
    json=payload,
    timeout=(3, 60),
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])
```

加入 `requests.Timeout`、401、429 和非法 JSON 的中文错误说明。

- [ ] **Step 3：实现流式 Python 请求**

设置 `stream=True`，使用 `iter_lines(decode_unicode=True)` 跳过空行、移除 `data:`、识别 `[DONE]`，解析每个 chunk 的 `choices[0].delta.content` 并 `print(..., end="", flush=True)`。

- [ ] **Step 4：创建 Java curl 脚本并做语法检查**

`chat.sh` 调 `POST /api/chat`；`stream-chat.sh` 使用 `curl -N` 调 `/api/chat/stream`。运行：

```bash
bash -n scripts/*.sh
python3 -m py_compile python-demo/*.py
```

Expected: 无输出，退出码 0。

- [ ] **Step 5：提交**

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/python-demo' \
        '学习/AI Agent岗位面试准备/第一周-大模型基础/scripts'
git commit -m "feat: add Python and curl DeepSeek demos"
```

## Task 8：制作四组可直接执行的实验

**Files:**
- Create: `experiments/01-token与上下文实验.md`
- Create: `experiments/02-采样参数实验.md`
- Create: `experiments/03-幻觉对照实验.md`
- Create: `experiments/04-结构化输出实验.md`

- [ ] **Step 1：编写 Token 与上下文实验**

固定三组 Prompt：20 字回答、500 字回答、增加 5 轮历史消息。记录表字段必须包括输入长度、输出长度、prompt tokens、completion tokens、total tokens、耗时和观察结论。

- [ ] **Step 2：编写采样参数实验**

使用同一个商品标题 Prompt，分别测试 `temperature=0.1/0.7/1.3`，每组执行 3 次；再固定 temperature 对比 `top_p=0.3/0.8/1.0`。明确写出 DeepSeek 官方建议通常调整 temperature 或 top_p 其中一个，top-k 只作为通用概念学习，不伪造为 DeepSeek 请求字段。

- [ ] **Step 3：编写幻觉对照实验**

使用一份虚构但明确的公司退款规则材料，设计“无材料”“提供材料”“要求无依据拒答”三组 Prompt，并要求记录是否编造、是否引用、是否拒答和仍然存在的风险。

- [ ] **Step 4：编写结构化输出实验**

提供客服意图 JSON Schema、10 条边界输入、预期 intent 和后端校验清单。明确区分 JSON 语法校验、Schema 校验、权限校验和业务真实性校验。

- [ ] **Step 5：检查实验链接并提交**

Run: `rg -n '^#|^##|temperature|top_p|Token|Schema' experiments`

Expected: 四份实验均包含目标、步骤、记录表、结论和面试表达。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/experiments'
git commit -m "docs: add LLM foundation experiments"
```

## Task 9：制作 Day 1 到 Day 7 学习讲义和面试材料

**Files:**
- Create: `docs/Day1-LLM与Token.md`
- Create: `docs/Day2-上下文与采样参数.md`
- Create: `docs/Day3-幻觉与结构化输出.md`
- Create: `docs/Day4-DeepSeek-API.md`
- Create: `docs/Day5-SpringBoot普通聊天.md`
- Create: `docs/Day6-SSE流式聊天.md`
- Create: `docs/Day7-复盘与模拟面试.md`
- Create: `docs/Java代码调用链.md`
- Create: `docs/常见错误排查.md`
- Create: `docs/面试问答与三分钟讲稿.md`
- Modify: `README.md`

- [ ] **Step 1：为每天统一使用学习闭环模板**

每份 Day 文档固定包含：

```markdown
# Day N：主题
## 今天学完能做什么
## 必须理解的概念
## 跟着做
## 阅读项目代码
## 修改实验
## 不看答案自测
## 面试怎么说
## 完成打卡
```

- [ ] **Step 2：写 Day 1 到 Day 4**

Day 1 覆盖 LLM、Token 和生成过程；Day 2 覆盖上下文、消息角色、temperature/top-p/top-k；Day 3 覆盖幻觉、拒答和结构化输出；Day 4 逐字段解释 DeepSeek URL、Header、messages、usage、finish_reason、SSE 和 `[DONE]`。

- [ ] **Step 3：写 Day 5 到 Day 7**

Day 5 按 Controller -> Service -> LlmClient -> DeepSeek 讲普通调用；Day 6 讲 Reactor Flux、SSE、首片段、结束和取消；Day 7 给出启动、Mock/真实调用、错误演示、录音复盘和最终验收。

- [ ] **Step 4：写调用链、排错和面试稿**

`Java代码调用链.md` 必须引用真实类名；`常见错误排查.md` 覆盖 401/403、404、429、5xx、连接超时、响应超时、非法 JSON、空 choices、SSE 中断；面试稿包含 10 个问答和三分钟项目介绍。

- [ ] **Step 5：完善总 README**

README 从“先跑 Mock”开始，随后是真实 DeepSeek，最后按 Day 1 到 Day 7 导航。必须包含：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export LLM_MOCK_ENABLED=true
cd java-demo && mvn spring-boot:run
```

真实模式只写：

```bash
export DEEPSEEK_API_KEY='在本机填写，不要提交'
export LLM_MOCK_ENABLED=false
```

- [ ] **Step 6：检查标题和链接并提交**

Run:

```bash
rg -n '^#|^##' README.md docs/*.md
rg -n 'DEEPSEEK_API_KEY=.*[A-Za-z0-9]{20}' . --glob '!target/**' || true
```

Expected: 每份讲义结构完整，第二条命令无真实密钥匹配。

```bash
git add '学习/AI Agent岗位面试准备/第一周-大模型基础/README.md' \
        '学习/AI Agent岗位面试准备/第一周-大模型基础/docs'
git commit -m "docs: add seven-day AI Agent learning guide"
```

## Task 10：接入原计划和总索引

**Files:**
- Modify: `AI Agent面试准备第一周执行手册.md`
- Modify: `AI Agent岗位面试准备计划.md`
- Modify: `00-总目录与知识点索引.md`
- Modify: `01-重复题与缺失主题扫描.md`

- [ ] **Step 1：在第一周执行手册顶部增加学习包入口**

```markdown
> 配套可运行学习包：[[学习/AI Agent岗位面试准备/第一周-大模型基础/README|第一周大模型基础学习包]]
```

- [ ] **Step 2：在原计划第 1 周增加 Demo 入口**

保留现有执行手册链接，并增加学习包链接，不重复复制整段内容。

- [ ] **Step 3：更新总索引和扫描文档**

总索引的 AI 应用开发区增加“第一周可运行学习包”；扫描文档把原“后续可补 Demo”调整为“已提供原生 WebClient Demo，后续可补 Spring AI 版本”。

- [ ] **Step 4：验证 Obsidian 路由**

Run:

```bash
rg -n '第一周-大模型基础|第一周大模型基础学习包' \
  'AI Agent面试准备第一周执行手册.md' \
  'AI Agent岗位面试准备计划.md' \
  '00-总目录与知识点索引.md' \
  '01-重复题与缺失主题扫描.md'
```

Expected: 四份维护文档都能路由到新学习包。

- [ ] **Step 5：提交路由更新**

```bash
git add 'AI Agent面试准备第一周执行手册.md' \
        'AI Agent岗位面试准备计划.md' \
        '00-总目录与知识点索引.md' \
        '01-重复题与缺失主题扫描.md'
git commit -m "docs: link AI Agent week one learning package"
```

## Task 11：整体验证和真实 DeepSeek 可选验收

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1：执行自动化测试**

```bash
cd '学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo'
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn clean test
```

Expected: `BUILD SUCCESS`，所有测试通过，测试不访问真实 DeepSeek。

- [ ] **Step 2：启动 Mock 服务并验证普通接口**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export LLM_MOCK_ENABLED=true
mvn spring-boot:run
```

另一个终端：

```bash
curl -sS -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"解释什么是 Token","temperature":0.2}'
```

Expected: HTTP 200，响应包含 requestId、model、Mock 文本和 durationMs。

- [ ] **Step 3：验证 Mock SSE**

```bash
curl -N 'http://localhost:8080/api/chat/stream?message=解释Token&temperature=0.2'
```

Expected: 依次出现 `event:meta`、多个 `event:delta`、`event:done`，连接正常结束。

- [ ] **Step 4：可选执行一次真实 DeepSeek 普通和流式请求**

仅在用户已在本机环境变量中配置 Key 时执行：

```bash
export DEEPSEEK_API_KEY='用户自行在终端设置'
export LLM_MOCK_ENABLED=false
mvn spring-boot:run
```

不得通过命令历史、日志、测试输出或 Codex 回复读取和展示 Key。普通调用预期返回真实模型内容；流式调用预期逐片段输出并以 done 结束。

- [ ] **Step 5：执行脚本、文档和密钥检查**

```bash
bash -n ../scripts/*.sh
python3 -m py_compile ../python-demo/*.py
rg -n 'sk-[A-Za-z0-9_-]{16,}' .. --glob '!target/**' || true
git diff --check
```

Expected: shell 和 Python 检查通过；密钥扫描无结果；Markdown 和代码无空白错误。

- [ ] **Step 6：检查最终文件和工作区**

```bash
rg --files '..' | sort
git status --short
```

确认没有 `target`、`.env`、`__pycache__` 和真实密钥进入提交；不处理与本任务无关的用户改动。

---

## 实施注意事项

1. DeepSeek 官方 Chat Completion 流式响应是 data-only SSE，并以 `data: [DONE]` 结束；实现和测试必须使用这一真实格式。
2. DeepSeek 请求支持 temperature 和 top_p，但实验和代码不要把通用 top-k 概念伪造成 DeepSeek API 字段。
3. 当前机器默认 Java 8，所有 Maven 验证都必须先切换到已安装的 JDK 17。
4. 自动化测试禁止调用真实 DeepSeek，避免测试不稳定和意外扣费。
5. 每个任务只提交列出的文件，不带入仓库中已有的无关修改。
