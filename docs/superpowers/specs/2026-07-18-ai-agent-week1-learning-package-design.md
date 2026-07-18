# AI Agent 第一周学习包设计

## 1. 背景与目标

用户已有 Java 后端经验和 DeepSeek API Key，希望把《AI Agent 面试准备第一周执行手册》中的学习任务全部制作成可运行、可阅读、可实验、可用于面试表达的学习包。

本项目不只提供任务清单，而是直接提供完整代码和配套材料。用户主要通过运行 Demo、修改参数、观察结果、阅读讲解和完成自测进行学习。

第一周目标：

1. 理解 LLM、Token、上下文窗口、采样参数、幻觉和结构化输出。
2. 看懂 DeepSeek Chat API 的请求、响应和流式协议。
3. 使用 Java 17 + Spring Boot 3 完成普通聊天和 SSE 流式聊天。
4. 掌握模型调用中的配置安全、参数校验、超时、错误转换、日志和客户端取消。
5. 形成可直接用于 AI 应用开发岗位面试的项目介绍和问答。

## 2. 目录设计

学习材料统一放入：

```text
学习/
└── AI Agent岗位面试准备/
    └── 第一周-大模型基础/
        ├── README.md
        ├── java-demo/
        ├── python-demo/
        ├── experiments/
        ├── docs/
        └── scripts/
```

各目录职责：

| 目录 | 内容 |
|---|---|
| `java-demo` | Java 17 + Spring Boot 3 主项目 |
| `python-demo` | DeepSeek 最小普通调用和流式调用脚本 |
| `experiments` | Token、采样参数、幻觉和结构化输出实验材料 |
| `docs` | 逐日讲义、代码调用链、面试问答和演示稿 |
| `scripts` | curl 调用、环境检查和常见错误复现脚本 |

## 3. 技术方案

### 3.1. 主技术栈

- Java 17。
- Spring Boot 3。
- Spring WebFlux `WebClient`。
- Bean Validation。
- JUnit 5。
- MockWebServer 或等价的本地 HTTP 模拟工具。
- Maven Wrapper 或标准 Maven 配置。

不在第一周引入 Spring AI、LangChain4j、数据库、Redis、MQ、RAG、Dify、Tool Calling 和聊天前端。

### 3.2. 模型接入

模型协议采用 OpenAI-compatible Chat API，默认配置 DeepSeek，所有模型信息均由环境变量注入：

```text
DEEPSEEK_API_KEY
LLM_BASE_URL
LLM_MODEL
LLM_MOCK_ENABLED
```

真实 API Key 不写入仓库。项目提供 `.env.example` 或等价示例文件，并通过 `.gitignore` 排除本地密钥文件。

同时提供 Mock 模式：

- 没有网络或不想消耗额度时仍可运行。
- 普通响应模拟完整 JSON。
- 流式响应模拟多个 SSE 数据片段。
- 测试和学习不依赖外部服务稳定性。

## 4. Java Demo 设计

### 4.1. 接口

#### 普通聊天

```http
POST /api/chat
Content-Type: application/json
```

请求支持：

- `message`：必填，限制长度。
- `systemPrompt`：可选，限制长度。
- `temperature`：可选，校验范围。
- `topP`：可选，校验范围。
- `maxTokens`：可选，限制上限。

响应包含：

- `requestId`。
- `model`。
- `content`。
- `finishReason`。
- 输入和输出 Token 用量。
- 总耗时。

#### SSE 流式聊天

```http
GET /api/chat/stream?message=...
Accept: text/event-stream
```

输出事件：

- `meta`：requestId 和模型。
- `delta`：逐片段文本。
- `done`：完成状态和耗时。
- `error`：可安全展示的错误信息。

客户端断开时取消上游订阅，避免继续消耗 Token。

### 4.2. 代码边界

| 模块 | 职责 |
|---|---|
| Controller | HTTP 入参、校验、普通响应和 SSE 输出 |
| ChatService | 组装消息、选择真实或 Mock 客户端、记录调用结果 |
| LlmClient | 定义普通和流式模型调用接口 |
| DeepSeekLlmClient | 封装 DeepSeek HTTP 请求和 SSE 解析 |
| MockLlmClient | 提供本地可预测响应 |
| Configuration | WebClient、连接超时、读取超时和配置绑定 |
| Exception Handler | 将模型鉴权、限流、超时和协议错误转换为统一响应 |

### 4.3. 工程约束

必须实现：

1. API Key 只存在于请求 Header，日志中不得输出。
2. 输入长度和模型参数在调用前校验。
3. 设置连接、响应和整体调用超时。
4. 401/403、429、5xx、超时、空响应、非法 JSON 分别识别。
5. 4xx 参数或鉴权错误不盲目重试。
6. 日志记录 requestId、模型、是否流式、耗时和结果状态。
7. 第三方原始错误不直接返回客户端。
8. 流式连接取消后结束上游请求。

## 5. Python Demo 设计

Python 只承担辅助学习，不作为主工程。

提供：

1. 环境变量读取示例。
2. 普通 Chat API 调用。
3. 流式响应逐行读取。
4. 401、429、超时和 JSON 解析异常处理。
5. 与 Java 请求结构的字段对照说明。

目标是让用户能读懂、运行和修改脚本，不扩展到 Python Web 框架。

## 6. 实验材料

### 6.1. Token 与上下文实验

- 短回答与长回答的用量对比。
- 增加历史消息后的 Token 和耗时变化。
- 材料内问题和材料外问题的回答差异。

### 6.2. 采样参数实验

- 固定 Prompt 分别使用低、中、高 temperature。
- 对比输出稳定性、多样性和编造风险。
- 对比 top-p 改变后的候选范围影响。
- 说明 DeepSeek API 实际支持字段与通用 top-k 概念的区别。

### 6.3. 幻觉实验

- 无约束回答。
- 要求“只基于材料回答”。
- 增加“无依据时拒答”和引用要求。
- 记录 Prompt 约束只能降低风险，不能提供绝对事实保证。

### 6.4. 结构化输出实验

- 客服意图分类 JSON。
- 缺少订单号、非法订单号、复合意图和退款等边界输入。
- JSON 解析、字段校验和业务真实性校验分层演示。

## 7. 文档设计

第一周目录提供：

1. 总 README：环境准备、学习路径、启动和验收。
2. Day 1 到 Day 7 讲义：概念、实验、代码阅读、练习和自测。
3. Java 调用链说明：从 Controller 到 DeepSeek 的完整路径。
4. 常见错误排查：401、429、超时、SSE 中断和解析失败。
5. 面试问答：LLM、Token、上下文、采样参数、幻觉、结构化输出和流式响应。
6. 三分钟项目介绍稿。
7. 学习完成记录表。

文档以中文、可直接口述、可在 Obsidian 和学习站中导航为标准。

## 8. 测试与验收

### 8.1. 自动化测试

覆盖：

1. 正常普通响应。
2. 正常 SSE 分片和结束事件。
3. 空参数、超长参数和非法采样参数。
4. 模型 401/403、429、5xx。
5. 连接或读取超时。
6. 空响应和非法 JSON。
7. Mock 模式不访问外部网络。
8. 日志与错误响应不泄露 API Key。

### 8.2. 手工验收

1. 不配置 Key，Mock 模式能够启动并演示普通和流式接口。
2. 配置 DeepSeek API Key，能够完成真实普通调用。
3. 真实流式调用能够逐片段显示并正常结束。
4. 客户端中断时后端能够释放请求。
5. curl、Python 和 Java 三种方式的请求含义一致。
6. 用户能够按照 README 独立完成 Day 1 到 Day 7。

## 9. 安全与成本边界

1. 不在测试、示例、日志和文档中记录真实 API Key。
2. 默认限制输入长度和最大输出 Token，防止意外消耗。
3. 实验说明预计调用次数，优先使用低成本短文本。
4. 自动化测试全部使用 Mock 服务，不调用真实 DeepSeek。
5. 默认不持久化用户问题和模型回答。

## 10. 完成定义

满足以下条件视为第一周学习包完成：

- 目录、Java Demo、Python Demo、实验、脚本和文档全部存在。
- Maven 测试通过。
- Mock 普通和流式接口实际运行通过。
- DeepSeek 接入配置和调用路径完整，真实调用由用户本地密钥启用。
- 第一周执行手册和总索引能够导航到新学习目录。
- 没有真实密钥、构建产物或无关文件进入提交内容。
