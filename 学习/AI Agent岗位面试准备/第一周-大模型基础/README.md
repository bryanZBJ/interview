# AI Agent 面试准备第一周：大模型基础

这是一套面向 Java 后端开发的可运行学习包。你会在一周内掌握 LLM、Token、上下文、采样参数、幻觉和结构化输出，并完成一个支持普通响应与 SSE 流式响应的 Spring Boot Demo。

## 先跑通 Mock 模式

Mock 模式不访问外部模型，不需要 API Key，适合第一次启动和面试演示。

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export LLM_MOCK_ENABLED=true
cd java-demo && mvn spring-boot:run
```

新建终端调用：

```bash
./scripts/chat.sh '解释什么是 Token'
./scripts/stream-chat.sh '用两句话解释 SSE'
```

也可直接使用 `curl`：

```bash
curl -sS http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"解释什么是 Token","temperature":0.2}'

curl -N --get http://localhost:8080/api/chat/stream \
  --data-urlencode 'message=用两句话解释 SSE' \
  --data-urlencode 'temperature=0.2'
```

`GET /api/chat/stream` 是为了便于本地学习 SSE 的演示接口。生产环境不应把可能含隐私的 Prompt 放在 URL，应改用可流式返回的 POST 接口，并配合鉴权、脱敏和访问日志治理。

## 切换真实 DeepSeek

只在本机终端配置密钥，不要写入源码、Markdown、`.env` 提交记录或命令输出。

学习包默认使用 `deepseek-v4-flash` 并显式设置 `thinking.type=disabled`，便于观察 `temperature` 和 `top_p`。模型可用名称可能变化，真实调用前以 DeepSeek 官方 API 文档为准。

```bash
export DEEPSEEK_API_KEY='在本机填写，不要提交'
export LLM_MOCK_ENABLED=false
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd java-demo && mvn spring-boot:run
```

Python 对照 Demo：

```bash
cd python-demo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python chat.py '解释什么是 Token'
python stream_chat.py '解释什么是 SSE'
```

## 项目结构

```text
java-demo/     Java 17 + Spring Boot 3 + WebClient 完整 Demo
python-demo/   requests 普通与流式调用对照
scripts/       环境检查、普通调用、SSE 调用
experiments/   Token、采样、幻觉、结构化输出实验
docs/          Day 1 到 Day 7 讲义、调用链、排错和面试稿
```

Java 主调用链：

```text
ChatController -> ChatService -> LlmClient
                               -> MockLlmClient
                               -> DeepSeekLlmClient -> DeepSeek API
```

## Day 1 到 Day 7

1. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day1-LLM与Token|Day 1：LLM 与 Token]]
2. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day2-上下文与采样参数|Day 2：上下文与采样参数]]
3. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day3-幻觉与结构化输出|Day 3：幻觉与结构化输出]]
4. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day4-DeepSeek-API|Day 4：DeepSeek API]]
5. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day5-SpringBoot普通聊天|Day 5：Spring Boot 普通聊天]]
6. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day6-SSE流式聊天|Day 6：SSE 流式聊天]]
7. [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Day7-复盘与模拟面试|Day 7：复盘与模拟面试]]

辅助材料：

- [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/四组实验结论速查|四组实验结论速查（快速学习版）]]
- [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/Java代码调用链|Java 代码调用链]]
- [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/常见错误排查|常见错误排查]]
- [[学习/AI Agent岗位面试准备/第一周-大模型基础/docs/面试问答与三分钟讲稿|面试问答与三分钟讲稿]]

## 四组实验（可按需实操）

快速学习时先阅读《四组实验结论速查》；只有在需要积累真实实验证据或面试官追问时，再执行下面的完整实验。

1. [[学习/AI Agent岗位面试准备/第一周-大模型基础/experiments/01-token与上下文实验|Token 与上下文实验]]
2. [[学习/AI Agent岗位面试准备/第一周-大模型基础/experiments/02-采样参数实验|采样参数实验]]
3. [[学习/AI Agent岗位面试准备/第一周-大模型基础/experiments/03-幻觉对照实验|幻觉对照实验]]
4. [[学习/AI Agent岗位面试准备/第一周-大模型基础/experiments/04-结构化输出实验|结构化输出实验]]

## 验证命令

```bash
./scripts/check-env.sh
bash -n scripts/*.sh
python3 -m py_compile python-demo/*.py

cd java-demo
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn test
```

Java 测试全部使用 Mock 客户端或 MockWebServer，不访问真实 DeepSeek，不消耗 API 额度。
