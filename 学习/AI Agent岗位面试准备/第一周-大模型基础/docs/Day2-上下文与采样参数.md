# Day 2：上下文与采样参数

## 今天学完能做什么

- 解释上下文窗口和 `system`、`user`、`assistant` 消息角色。
- 清楚区分 `temperature`、`top_p`、`top_k` 的作用与关系。
- 指出本项目和当前 DeepSeek 请求实际发送哪些采样字段。
- 设计一次只改变一个变量的采样参数对比实验。

## 必须理解的概念

### 上下文与消息角色

上下文是当前一次推理时提供给模型的全部可见信息，通常包括系统指令、历史消息和本轮问题。模型不会自动记住另一条独立 HTTP 请求；要实现多轮对话，应用必须保存并重新传入必要历史。

- `system`：定义角色、约束和总体行为，优先用于稳定规则。
- `user`：用户问题或任务输入。
- `assistant`：模型历史回答，多轮对话时作为上下文重新传入。

本项目的 `DeepSeekLlmClient.toRequest` 只组装可选的 `system` 和当前 `user`，没有会话存储，也没有传历史 `assistant` 消息，所以它是单轮 Demo。

### temperature、top-p、top-k

| 参数 | 改变什么 | 值变小时 | 值变大时 |
|---|---|---|---|
| `temperature` | 缩放候选 Token 的 logits，再计算概率 | 概率更集中，回答通常更稳定 | 概率更平坦，回答通常更多样 |
| `top_p` | 只保留累计概率达到阈值的最小候选集合，即 nucleus sampling | 候选集合更窄 | 候选集合更宽 |
| `top_k` | 只保留概率最高的 K 个候选 Token | 候选个数更少 | 候选个数更多 |

三者都影响“下一 Token 从哪些候选中产生”，但不是同一个参数：`temperature` 改概率分布形状，`top_p` 按累计概率动态决定候选数，`top_k` 固定候选数量。概念上常先做温度缩放，再做 top-k/top-p 过滤并采样；具体过滤顺序取决于模型服务实现，不应把它当作跨平台固定协议。

实践中不要同时大幅修改多个参数，否则很难判断输出变化由谁造成。DeepSeek 官方对 Chat Completion 建议通常调整 `temperature` 或 `top_p` 之一。本项目请求模型 `ChatCompletionRequest` 有 `temperature` 和 `top_p`，没有 `top_k`；因此 `top_k` 只作为通用概念学习，不能向本 Demo 请求中凭空添加并宣称 DeepSeek 已接收。

## 跟着做

启动 Mock 后发送两组请求，先确认 Web 层参数校验：

```bash
curl -sS -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"给出三个学习 Token 的建议","temperature":0.2,"topP":0.9}'

curl -sS -X POST 'http://localhost:8080/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{"message":"给出三个学习 Token 的建议","temperature":2.1,"topP":0.9}'
```

第二个请求应由 `ChatRequest` 的 `@DecimalMax("2.0")` 拒绝，并由 `GlobalExceptionHandler` 返回 `VALIDATION_ERROR`。Mock 只回显消息，不能用来观察采样随机性。

## 阅读项目代码

1. `ChatCommand.java`：保存 `systemPrompt`、`temperature`、`topP`、`maxTokens`。
2. `WebModels.ChatRequest`：校验 `temperature` 为 0 到 2、`topP` 为 0 到 1。
3. `ChatController.chat`：把 HTTP 字段原样转换为 `ChatCommand`。
4. `DeepSeekLlmClient.toRequest`：空值时使用本项目默认值 `temperature=0.2`、`top_p=0.9`。
5. `DeepSeekModels.ChatCompletionRequest`：用 `@JsonProperty("top_p")` 将 Java 的 `topP` 序列化为 API 字段。

## 修改实验

真实模式只能在你自行配置有效 Key 后执行。固定同一个 Prompt，每组至少调用 3 次：

| 实验 | temperature | topP | 控制原则 | 记录 |
|---|---:|---:|---|---|
| A | 0.0 | 0.9 | 只降低 temperature | 答案结构、措辞差异 |
| B | 0.8 | 0.9 | 只提高 temperature | 答案结构、措辞差异 |
| C | 0.2 | 0.3 | 只降低 topP | 候选收缩后的差异 |
| D | 0.2 | 1.0 | 只提高 topP | 候选放宽后的差异 |

模型输出并不保证完全可复现。实验结论写“在本次样本中观察到”，不要把少量样本上升为绝对规律。

## 不看答案自测

1. `temperature` 改变的是候选数量还是概率分布形状？
2. `top_p=0.1` 是否等于只保留一个 Token？
3. `top_k=20` 与 `top_p=0.9` 的候选集合为什么不同？
4. 本项目有没有向 DeepSeek 发送 `top_k`？依据是什么？
5. 为什么对比实验要一次只改一个参数？

## 面试怎么说

> temperature 通过缩放 logits 调整概率分布的平坦程度；top-p 按累计概率动态截断候选集合；top-k 则固定只保留概率最高的 K 个候选。它们都影响采样，但机制不同。我的 Demo 实际只传 temperature 和 top_p，DeepSeek 官方也建议二者通常择一重点调整，所以做实验时我固定 Prompt 和其他参数，只改变一个变量。

## 今日产出

- 一张三参数对比表，能遮住答案后复述。
- 两条参数校验请求及其响应记录。
- 一份待填写的真实采样实验表，不伪造调用结果。

## 完成打卡

- [ ] 能准确解释 temperature、top-p、top-k。
- [ ] 能说明 top-p 与 top-k 的动态集合和固定数量差异。
- [ ] 已从真实源码确认本项目没有 `top_k` 字段。
- [ ] 已验证非法 `temperature` 会被 Web 层拒绝。
- [ ] 已完成 5 道自测题。
