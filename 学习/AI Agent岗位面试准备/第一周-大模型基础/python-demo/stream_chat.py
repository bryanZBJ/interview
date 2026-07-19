import json
import os
import sys

import requests


DEFAULT_MESSAGE = "解释什么是 Token"


def main() -> int:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        print("错误：未配置环境变量 DEEPSEEK_API_KEY。", file=sys.stderr)
        return 1

    base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com").rstrip("/")
    message = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MESSAGE
    payload = {
        "model": os.getenv("LLM_MODEL", "deepseek-v4-flash"),
        "messages": [{"role": "user", "content": message}],
        "thinking": {"type": "disabled"},
        "temperature": 0.2,
        "stream": True,
    }

    try:
        with requests.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "text/event-stream",
            },
            json=payload,
            timeout=(3, 60),
            stream=True,
        ) as response:
            if response.status_code == 401:
                print("错误：模型服务鉴权失败，请检查 DEEPSEEK_API_KEY。", file=sys.stderr)
                return 1
            if response.status_code == 429:
                print("错误：模型请求过于频繁，请稍后重试。", file=sys.stderr)
                return 1

            try:
                response.raise_for_status()
            except requests.HTTPError:
                print(f"错误：模型服务返回 HTTP {response.status_code}。", file=sys.stderr)
                return 1

            response.encoding = response.encoding or "utf-8"
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue

                line = line.strip()
                if not line.startswith("data:"):
                    continue

                event_data = line[len("data:") :].lstrip()
                if event_data == "[DONE]":
                    print()
                    return 0

                try:
                    chunk = json.loads(event_data)
                    content = chunk["choices"][0]["delta"].get("content")
                except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                    print("\n错误：模型流返回了非法 JSON 或不符合预期的数据。", file=sys.stderr)
                    return 1

                if content:
                    print(content, end="", flush=True)

            print("\n错误：模型流未收到 [DONE]，响应可能已中断。", file=sys.stderr)
            return 1
    except requests.Timeout:
        print("\n错误：请求模型服务超时，请稍后重试。", file=sys.stderr)
        return 1
    except requests.RequestException:
        print("\n错误：无法连接模型服务，请检查网络或服务地址。", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
