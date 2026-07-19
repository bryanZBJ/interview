package com.zbj.interview.aiagent.week1.service;

import com.zbj.interview.aiagent.week1.client.LlmClient;
import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 为大模型调用生成请求标识并记录调用生命周期。
 *
 * @author zhangbj
 */
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final String REQUEST_ID_CONTEXT_KEY = "requestId";

    private final LlmClient client;
    private final LlmProperties properties;

    public ChatService(LlmClient client, LlmProperties properties) {
        this.client = client;
        this.properties = properties;
    }

    public Mono<ChatResult> chat(ChatCommand command) {
        return Mono.defer(() -> {
            String requestId = UUID.randomUUID().toString();
            long startedAt = System.nanoTime();
            log.info("LLM chat started, requestId={}, model={}", requestId, properties.model());

            return client.chat(command, requestId)
                    .doOnSuccess(result -> log.info(
                            "LLM chat succeeded, requestId={}, model={}, durationMs={}",
                            requestId, properties.model(), elapsedMillis(startedAt)))
                    .doOnError(error -> log.warn(
                            "LLM chat failed, requestId={}, model={}, failureType={}, durationMs={}",
                            requestId, properties.model(), error.getClass().getSimpleName(),
                            elapsedMillis(startedAt)))
                    .contextWrite(context -> context.put(REQUEST_ID_CONTEXT_KEY, requestId));
        });
    }

    public Flux<StreamChunk> stream(ChatCommand command) {
        return Flux.defer(() -> {
            String requestId = UUID.randomUUID().toString();
            long startedAt = System.nanoTime();
            log.info("LLM stream started, requestId={}, model={}", requestId, properties.model());

            return client.stream(command, requestId)
                    .doOnComplete(() -> log.info(
                            "LLM stream succeeded, requestId={}, model={}, durationMs={}",
                            requestId, properties.model(), elapsedMillis(startedAt)))
                    .doOnError(error -> log.warn(
                            "LLM stream failed, requestId={}, model={}, failureType={}, durationMs={}",
                            requestId, properties.model(), error.getClass().getSimpleName(),
                            elapsedMillis(startedAt)))
                    .doOnCancel(() -> log.info(
                            "LLM stream cancelled, requestId={}, model={}, durationMs={}",
                            requestId, properties.model(), elapsedMillis(startedAt)))
                    .contextWrite(context -> context.put(REQUEST_ID_CONTEXT_KEY, requestId));
        });
    }

    private long elapsedMillis(long startedAt) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }
}
