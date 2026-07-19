# Day 1：LLM 与 Token

## 今天学完能做什么

- 用自己的话解释 LLM 如何从输入生成回答。
- 区分字符、单词、Token，知道 Token 数量会影响上下文、延迟和费用。
- 启动 Java Demo 的 Mock 模式，观察完整请求与结构化响应。
- 从 `usage` 中读出输入、输出和总 Token 数。

## 必须理解的概念

### LLM 是什么

LLM（Large Language Model，大语言模型）本质上是一个根据已有上下文预测“下一个 Token 概率分布”的模型。它不是先在数据库里找到整段标准答案再返回，而是循环执行：读取上下文 -> 计算候选 Token 概率 -> 按采样策略选出下一个 Token -> 把新 Token 加回上下文，直到停止。

### Token 是什么

Token 是模型处理文本的基本单位，不等同于一个汉字、一个英文单词或一个 Java 字符。具体切分结果由模型使用的 tokenizer 决定，因此不能用 `String.length()` 精确代替 Token 计数。

Token 主要影响三件事：

1. 输入 Token 与已生成 Token 一起占用上下文窗口。
2. 输出越长，通常生成耗时越长。
3. API 通常按输入和输出 Token 分别统计用量。

### 一次生成何时结束

常见停止条件包括：模型生成自然停止点、命中停止词、达到 `max_tokens`、触及上下文限制或被内容安全策略中止。项目通过 `finishReason` 暴露上游停止原因，不能只看 `content` 是否非空。

## 跟着做

在“第一周-大模型基础”目录执行：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export LLM_MOCK_ENABLED=true
cd java-demo
mvn spring-boot:run
```

另开终端调用普通聊天接口：

```bash
curl -sS -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"用两句话解释 Token","temperature":0.2,"topP":0.9,"maxTokens":128}'
```

Mock 响应由 `MockLlmClient` 本地生成，`usage` 三项固定为 `0`，不能把它当作真实模型 Token 统计。需要真实 Token 用量时，必须切换真实模式并以实际响应为准。

## 阅读项目代码

按这个顺序读：

1. `java-demo/src/main/java/com/zbj/interview/aiagent/week1/web/model/WebModels.java`：`ChatRequest` 是入参，`ChatResponse` 包含 `finishReason` 和 `usage`。
2. `java-demo/src/main/java/com/zbj/interview/aiagent/week1/domain/ChatResult.java`：领域结果保存 `promptTokens`、`completionTokens`、`totalTokens`。
3. `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/model/DeepSeekModels.java`：`Usage` 用 `@JsonProperty` 映射 DeepSeek 的蛇形字段。
4. `java-demo/src/main/java/com/zbj/interview/aiagent/week1/client/DeepSeekLlmClient.java`：`toResult` 读取第一项 `choice` 和 `usage`，缺失时转为协议错误。

## 修改实验

保持 Mock 模式，连续发送三次请求，只修改 `message` 和 `maxTokens`：

| 组别 | message | maxTokens | 预期观察 |
|---|---|---:|---|
| A | 用一句话解释 Token | 32 | Mock 只回显，参数不会改变本地答案长度 |
| B | 用五点解释 Token | 128 | 验证请求可正常传入 |
| C | 写一篇长文解释 Token | 512 | Mock 的 `usage=0`，不能据此推断真实消耗 |

如果之后自行运行真实模式，再补记实际 `promptTokens`、`completionTokens`、`totalTokens`、`durationMs`，不要预填结果。

## 不看答案自测

1. Token 为什么不能简单等同于汉字数？
2. 为什么长上下文会增加成本和延迟？
3. LLM 每一步直接输出整句话，还是预测下一个 Token？
4. `maxTokens` 限制输入还是输出？
5. 为什么 Mock 响应的 `usage=0` 不能用于 Token 实验结论？

## 面试怎么说

> LLM 的核心生成过程是基于上下文不断预测下一个 Token。Token 是模型处理文本的单位，具体切分由 tokenizer 决定，不等于字符数。工程上我会同时关注输入 Token、输出 Token、上下文上限、`finish_reason` 和耗时，因为它们共同影响回答完整性、延迟与成本。

## 今日产出

- 一张“上下文 -> 概率分布 -> 采样 -> 新 Token -> 继续生成”的手绘流程图。
- 一份 Mock 普通请求响应记录，并标注 `requestId`、`finishReason`、`usage`、`durationMs`。
- 一段 30 秒口述，解释 Token 与字符的区别。

## 完成打卡

- [ ] 能脱稿解释 LLM 的逐 Token 生成过程。
- [ ] 已在 Mock 模式启动 `Week1Application`。
- [ ] 已调用 `POST /api/chat` 并保存响应。
- [ ] 已确认 Mock 的 Token 用量只是占位值。
- [ ] 已完成 5 道自测题。
