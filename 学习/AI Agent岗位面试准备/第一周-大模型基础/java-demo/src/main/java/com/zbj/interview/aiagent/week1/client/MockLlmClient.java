package com.zbj.interview.aiagent.week1.client;

import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * 无需外部 API key 的本地大模型模拟实现。
 *
 * @author zhangbj
 */
public class MockLlmClient implements LlmClient {

    private final LlmProperties properties;

    public MockLlmClient(LlmProperties properties) {
        this.properties = properties;
    }

    @Override
    public Mono<ChatResult> chat(ChatCommand command, String requestId) {
        String content = "Mock 回答：" + command.message();
        return Mono.just(new ChatResult(
                requestId,
                properties.model(),
                content,
                "stop",
                0,
                0,
                0,
                0L
        ));
    }

    @Override
    public Flux<StreamChunk> stream(ChatCommand command, String requestId) {
        return Flux.just(
                new StreamChunk(StreamChunk.Type.META, requestId, properties.model(), null, null),
                new StreamChunk(StreamChunk.Type.DELTA, requestId, properties.model(), "Mock 流式回答：", null),
                new StreamChunk(StreamChunk.Type.DELTA, requestId, properties.model(), command.message(), null),
                new StreamChunk(StreamChunk.Type.DONE, requestId, properties.model(), null, 0L)
        );
    }
}
