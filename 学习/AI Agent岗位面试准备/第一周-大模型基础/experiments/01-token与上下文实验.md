# 实验一：Token 与上下文

## 目标

1. 用同一个主题对比“20 字回答”和“500 字回答”的 Token 消耗与耗时。
2. 观察增加 5 轮历史消息后，`prompt_tokens`、`total_tokens` 和耗时如何变化。
3. 能解释 Token、上下文窗口、输入成本和输出成本之间的关系。

## 准备

- 已申请 DeepSeek API Key，并在当前终端执行：`export DEEPSEEK_API_KEY='你的密钥'`。
- 默认模型使用本学习项目配置的 `deepseek-v4-flash`；如果账号当前提供的模型名不同，先执行 `export LLM_MODEL='实际模型名'`，再替换请求中的模型名。
- 安装 `curl`、`jq` 和 `/usr/bin/time`。
- 每次实验尽量在相近网络环境下执行，避免把网络抖动误判为 Token 带来的延迟。
- 输入长度按字符数记录，Token 数必须以响应中的 `usage` 为准，不能用字符数直接换算。

## 逐步操作

1. 执行 A 组请求，要求模型在 20 个汉字以内回答，连续执行 3 次。
2. 执行 B 组请求，只把回答长度要求改为约 500 个汉字，连续执行 3 次。
3. 执行 C 组请求，在相同最终问题前加入固定的 5 轮历史对话，连续执行 3 次。
4. 从每次响应中记录 `usage.prompt_tokens`、`usage.completion_tokens`、`usage.total_tokens`。
5. 用 `/usr/bin/time` 的 `real` 值记录端到端耗时，同时记录输入字符数和实际输出字符数。
6. 比较 A、B 两组，判断输出长度主要影响哪个 Token 指标；比较 A、C 两组，判断历史消息主要影响哪个指标。

## 固定 Prompt / 样例

### A 组：20 字回答

```text
请用不超过20个汉字解释：什么是大模型的上下文窗口？只输出答案。
```

### B 组：500 字回答

```text
请用约500个汉字解释：什么是大模型的上下文窗口？需要包含定义、作用、超出窗口后的影响和一个例子。只输出答案。
```

### C 组：增加 5 轮历史消息

前 5 轮问答固定为：

```text
用户1：我正在学习大模型基础，请记住主题是上下文窗口。
助手1：好的，本轮主题是上下文窗口。
用户2：Token 可以理解成模型处理文本的基本单位吗？
助手2：可以，但一个 Token 不一定等于一个汉字或一个单词。
用户3：输入和输出都会占用 Token 吗？
助手3：会，输入通常计入 prompt tokens，输出通常计入 completion tokens。
用户4：历史消息会进入后续请求吗？
助手4：如果客户端把历史消息再次放入 messages，它们就会成为本次输入的一部分。
用户5：上下文越长是否一定回答越好？
助手5：不一定，无关内容可能增加成本、延迟和信息干扰。
```

最终问题固定为：

```text
请用不超过20个汉字解释：什么是大模型的上下文窗口？只输出答案。
```

## 可复制请求或调用方式

### A 组请求

```bash
/usr/bin/time -p curl -sS https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-v4-flash",
    "thinking": {"type": "disabled"},
    "messages": [
      {"role": "user", "content": "请用不超过20个汉字解释：什么是大模型的上下文窗口？只输出答案。"}
    ],
    "max_tokens": 100
  }' | jq '{content: .choices[0].message.content, usage: .usage, finish_reason: .choices[0].finish_reason}'
```

### B 组请求

```bash
/usr/bin/time -p curl -sS https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-v4-flash",
    "thinking": {"type": "disabled"},
    "messages": [
      {"role": "user", "content": "请用约500个汉字解释：什么是大模型的上下文窗口？需要包含定义、作用、超出窗口后的影响和一个例子。只输出答案。"}
    ],
    "max_tokens": 1000
  }' | jq '{content: .choices[0].message.content, usage: .usage, finish_reason: .choices[0].finish_reason}'
```

### C 组请求

```bash
/usr/bin/time -p curl -sS https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-v4-flash",
    "thinking": {"type": "disabled"},
    "messages": [
      {"role":"user","content":"我正在学习大模型基础，请记住主题是上下文窗口。"},
      {"role":"assistant","content":"好的，本轮主题是上下文窗口。"},
      {"role":"user","content":"Token 可以理解成模型处理文本的基本单位吗？"},
      {"role":"assistant","content":"可以，但一个 Token 不一定等于一个汉字或一个单词。"},
      {"role":"user","content":"输入和输出都会占用 Token 吗？"},
      {"role":"assistant","content":"会，输入通常计入 prompt tokens，输出通常计入 completion tokens。"},
      {"role":"user","content":"历史消息会进入后续请求吗？"},
      {"role":"assistant","content":"如果客户端把历史消息再次放入 messages，它们就会成为本次输入的一部分。"},
      {"role":"user","content":"上下文越长是否一定回答越好？"},
      {"role":"assistant","content":"不一定，无关内容可能增加成本、延迟和信息干扰。"},
      {"role":"user","content":"请用不超过20个汉字解释：什么是大模型的上下文窗口？只输出答案。"}
    ],
    "max_tokens": 100
  }' | jq '{content: .choices[0].message.content, usage: .usage, finish_reason: .choices[0].finish_reason}'
```

每组重复 3 次。需要统计实际输出字符数时，把响应保存到变量后执行：

```bash
RESPONSE=$(curl -sS https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-v4-flash","thinking":{"type":"disabled"},"messages":[{"role":"user","content":"请用不超过20个汉字解释：什么是大模型的上下文窗口？只输出答案。"}],"max_tokens":100}')
echo "$RESPONSE" | jq -r '.choices[0].message.content' | wc -m
echo "$RESPONSE" | jq '.usage'
```

## 记录表

| 组别 | 次数 | 输入长度（字符） | 输出长度（字符） | prompt tokens | completion tokens | total tokens | 耗时（秒） | 观察结论 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| A：20 字 | 1 |  |  |  |  |  |  |  |
| A：20 字 | 2 |  |  |  |  |  |  |  |
| A：20 字 | 3 |  |  |  |  |  |  |  |
| B：500 字 | 1 |  |  |  |  |  |  |  |
| B：500 字 | 2 |  |  |  |  |  |  |  |
| B：500 字 | 3 |  |  |  |  |  |  |  |
| C：5 轮历史 | 1 |  |  |  |  |  |  |  |
| C：5 轮历史 | 2 |  |  |  |  |  |  |  |
| C：5 轮历史 | 3 |  |  |  |  |  |  |  |

## 预期观察

- B 组的 `completion_tokens` 通常明显高于 A 组，因为要求生成更长答案。
- C 组的 `prompt_tokens` 通常明显高于 A 组，因为客户端把 5 轮历史消息重新发送给了模型。
- `total_tokens` 一般等于 `prompt_tokens + completion_tokens`，但仍以接口返回为准。
- Token 增加通常会增加成本和部分处理时间，但端到端耗时还受网络、服务负载、缓存和生成速度影响，不保证严格线性。
- “20 个汉字”是 Prompt 约束，不是强制截断机制；模型可能略微超长，必须记录实际结果。

## 结论

Token 是模型计量输入输出的基本单位。回答变长主要增加输出 Token，历史消息变多主要增加输入 Token。上下文窗口限制的是本次请求可处理的上下文总量，因此生产系统需要裁剪无关历史、摘要旧对话，并监控 Token、延迟和成本。

## 自测

1. 为什么 5 轮历史消息会增加当前请求的 `prompt_tokens`？
2. `total_tokens` 与上下文窗口、调用成本有什么关系？
3. 为什么不能用“一个汉字等于一个 Token”估算所有场景？
4. 如果历史消息过长，你会采用哪些压缩策略？
5. 为什么一次请求耗时更高，不能直接断言是 Token 增多造成的？

## 面试表达

> 我用三组固定实验验证了 Token 和上下文的关系。短回答改成长回答后，主要增长的是 completion tokens；在相同最终问题前加入 5 轮历史后，主要增长的是 prompt tokens。因为多轮对话并不是模型自动永久记忆，而是客户端把历史 messages 再次发送。工程上我会控制历史长度、摘要旧消息，并同时监控 prompt tokens、completion tokens、总耗时和成本。
