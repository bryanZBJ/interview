# Day 3：幻觉与结构化输出

## 今天学完能做什么

- 解释什么是大模型幻觉，以及为什么流畅不等于真实。
- 用“限定材料、缺失拒答、要求证据”降低幻觉风险。
- 区分“JSON 文本”“合法 JSON”和“满足业务 Schema”三个层次。
- 为结构化输出设计解析、校验和失败兜底。

## 必须理解的概念

### 幻觉不是普通语法错误

幻觉是模型生成了看似合理但缺乏事实依据、与材料冲突或根本不存在的信息。原因包括训练目标偏向生成连贯文本、上下文缺失或冲突、问题带有错误前提、采样随机性以及模型无法直接验证现实世界。

降低风险的常用手段：

1. 明确事实边界：“只依据下列材料回答”。
2. 规定缺失策略：“材料没有答案时返回 `UNKNOWN`，不要猜测”。
3. 要求证据：“给出引用片段或字段来源”。
4. 对关键事实接入检索、数据库或工具，并在应用侧校验。
5. 对高风险结果保留人工确认。

Prompt 约束只能降低风险，不能从根本上保证事实正确。

### 结构化输出的三层保证

1. 看起来像 JSON：仍可能有 Markdown 代码块、尾逗号或解释文字。
2. 语法上是合法 JSON：字段可能缺失、类型错误或多出业务不允许的值。
3. 满足业务 Schema：经过 JSON 解析和字段级校验，才可进入业务流程。

即使模型服务提供 JSON Output，也必须在应用侧执行反序列化、Schema/Bean Validation、枚举白名单和长度限制。模型生成的结构不能直接当作可信指令执行。

## 跟着做

先用 Mock 验证接口，不把 Mock 回显误认为结构化输出能力：

```bash
curl -sS -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"只依据材料回答。材料：Java 17 发布于 2021 年。问题：Java 21 发布于哪年？材料没有就回答 UNKNOWN"}'
```

然后为将来的真实实验准备这个目标 Schema：

```json
{
  "answer": "UNKNOWN",
  "evidence": [],
  "confidence": "low"
}
```

当前 Java Demo 的 `ChatCompletionRequest` 没有 `response_format` 字段，也没有对模型 `content` 做二次 JSON 解析。因此这里只能学习 Prompt 约束，不能宣称项目已经实现 Schema 强校验。

## 阅读项目代码

1. `DeepSeekModels.ChatCompletionRequest`：确认当前只包含 `model`、`messages`、采样参数、`max_tokens`、`stream`、`stream_options`。
2. `DeepSeekLlmClient.toResult`：只验证上游响应对象、第一项 `choice`、`message.content` 和 `usage` 存在。
3. `DeepSeekLlmClient.protocolFailure`：上游 JSON 非法或必要字段缺失时统一转为 `LlmErrorType.PROTOCOL`。
4. `GlobalExceptionHandler`：把协议错误映射为安全的 502 响应，不返回上游原始正文。

## 修改实验

为同一个材料外问题准备三版 Prompt，真实调用结果留空：

| 版本 | 约束 | 观察项 |
|---|---|---|
| A | 直接提问 | 是否猜测、是否编造来源 |
| B | 只允许依据材料 | 是否仍越界回答 |
| C | 材料缺失返回 `UNKNOWN`，并给 `evidence` | 是否拒答、JSON 是否可解析、字段是否齐全 |

如果自行扩展代码，最小闭环是：在请求模型中增加 `response_format` -> Prompt 明确要求 JSON -> Jackson 解析 `content` -> Bean Validation 校验 -> 失败时返回可重试的安全错误。该扩展不属于当前 Task 9 文档实现，也不应写成已完成。

## 不看答案自测

1. 为什么模型回答很流畅仍可能是幻觉？
2. “不知道就拒答”能否彻底消除幻觉？
3. 合法 JSON 为什么不等于业务可用数据？
4. 当前 Java Demo 是否使用了 DeepSeek 的 `response_format`？
5. 结构化结果进入业务系统前至少要做哪些校验？

## 面试怎么说

> 我把幻觉治理分为生成前、生成中和生成后：生成前提供可靠上下文，生成中要求只基于材料并在缺失时拒答，生成后做证据核验和业务校验。结构化输出也不能只要求“返回 JSON”，还要在应用侧反序列化并按 Schema、枚举和长度规则校验。Prompt 是第一道防线，不是事实保证。

## 今日产出

- 三版逐步增强的幻觉实验 Prompt。
- 一个包含 `answer`、`evidence`、`confidence` 的目标 JSON Schema 草稿。
- 一段 45 秒口述，说明 Prompt 约束与应用校验各自负责什么。

## 完成打卡

- [ ] 能举出一个“流畅但错误”的幻觉例子。
- [ ] 能说出至少 4 种降低幻觉风险的方法。
- [ ] 能区分 JSON 语法有效与 Schema 有效。
- [ ] 已确认当前 Demo 尚未实现 `response_format` 和内容 Schema 校验。
- [ ] 已完成 5 道自测题。
