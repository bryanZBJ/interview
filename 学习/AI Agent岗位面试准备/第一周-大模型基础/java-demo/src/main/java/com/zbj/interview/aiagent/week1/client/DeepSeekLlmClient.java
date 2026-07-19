package com.zbj.interview.aiagent.week1.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.ChatCompletionRequest;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.ChatCompletionResponse;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.ChatCompletionChunk;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.Choice;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.Message;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.StreamChoice;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.StreamOptions;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.Thinking;
import com.zbj.interview.aiagent.week1.client.model.DeepSeekModels.Usage;
import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import com.zbj.interview.aiagent.week1.exception.LlmCallException;
import com.zbj.interview.aiagent.week1.exception.LlmErrorType;
import io.netty.channel.ConnectTimeoutException;
import io.netty.handler.timeout.ReadTimeoutException;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 通过 DeepSeek Chat Completions API 完成普通对话。
 *
 * @author zhangbj
 */
public class DeepSeekLlmClient implements LlmClient {

    private static final double DEFAULT_TEMPERATURE = 0.2D;
    private static final double DEFAULT_TOP_P = 0.9D;

    private final WebClient webClient;
    private final LlmProperties properties;
    private final ObjectMapper objectMapper;

    public DeepSeekLlmClient(WebClient webClient, LlmProperties properties) {
        this.webClient = webClient;
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public Mono<ChatResult> chat(ChatCommand command, String requestId) {
        return Mono.defer(() -> {
            validateApiKey();
            long startedAt = System.nanoTime();

            return webClient.post()
                    .uri("/chat/completions")
                    .bodyValue(toRequest(command, false))
                    .retrieve()
                    .onStatus(this::isAuthenticationFailure,
                            response -> safeHttpFailure(response.releaseBody(),
                                    LlmErrorType.AUTHENTICATION, "模型鉴权失败"))
                    .onStatus(status -> status.value() == 429,
                            response -> safeHttpFailure(response.releaseBody(),
                                    LlmErrorType.RATE_LIMIT, "模型请求过于频繁"))
                    .onStatus(HttpStatusCode::is5xxServerError,
                            response -> safeHttpFailure(response.releaseBody(),
                                    LlmErrorType.UPSTREAM, "模型服务暂时不可用"))
                    .onStatus(HttpStatusCode::is4xxClientError,
                            response -> safeHttpFailure(response.releaseBody(),
                                    LlmErrorType.UPSTREAM, "模型请求被上游拒绝"))
                    .bodyToMono(ChatCompletionResponse.class)
                    .switchIfEmpty(Mono.error(protocolFailure()))
                    .map(response -> toResult(response, requestId, startedAt))
                    .onErrorMap(this::mapFailure);
        });
    }

    @Override
    public Flux<StreamChunk> stream(ChatCommand command, String requestId) {
        return Flux.defer(() -> {
            long startedAt = System.nanoTime();
            StreamChunk meta = new StreamChunk(
                    StreamChunk.Type.META, requestId, properties.model(), null, null);

            Flux<StreamChunk> upstream = Flux.defer(() -> {
                validateApiKey();
                AtomicBoolean doneReceived = new AtomicBoolean();
                return webClient.post()
                        .uri("/chat/completions")
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .bodyValue(toRequest(command, true))
                        .retrieve()
                        .onStatus(this::isAuthenticationFailure,
                                response -> safeHttpFailure(response.releaseBody(),
                                        LlmErrorType.AUTHENTICATION, "模型鉴权失败"))
                        .onStatus(status -> status.value() == 429,
                                response -> safeHttpFailure(response.releaseBody(),
                                        LlmErrorType.RATE_LIMIT, "模型请求过于频繁"))
                        .onStatus(HttpStatusCode::is5xxServerError,
                                response -> safeHttpFailure(response.releaseBody(),
                                        LlmErrorType.UPSTREAM, "模型服务暂时不可用"))
                        .onStatus(HttpStatusCode::is4xxClientError,
                                response -> safeHttpFailure(response.releaseBody(),
                                        LlmErrorType.UPSTREAM, "模型请求被上游拒绝"))
                        .bodyToFlux(String.class)
                        .takeUntil(this::isDoneData)
                        .concatMap(data -> {
                            if (isDoneData(data)) {
                                doneReceived.set(true);
                            }
                            return toStreamChunk(data, requestId, startedAt);
                        })
                        .concatWith(Flux.defer(() -> doneReceived.get()
                                ? Flux.empty()
                                : Flux.error(protocolFailure())));
            }).onErrorMap(this::mapFailure);

            return Flux.concat(Mono.just(meta), upstream);
        });
    }

    private ChatCompletionRequest toRequest(ChatCommand command, boolean stream) {
        List<Message> messages = new ArrayList<>();
        if (command.systemPrompt() != null && !command.systemPrompt().isBlank()) {
            messages.add(new Message("system", command.systemPrompt()));
        }
        messages.add(new Message("user", command.message()));

        return new ChatCompletionRequest(
                properties.model(),
                List.copyOf(messages),
                command.temperature() == null ? DEFAULT_TEMPERATURE : command.temperature(),
                command.topP() == null ? DEFAULT_TOP_P : command.topP(),
                command.maxTokens() == null ? properties.defaultMaxTokens() : command.maxTokens(),
                stream,
                stream ? new StreamOptions(true) : null,
                new Thinking("disabled")
        );
    }

    private Mono<StreamChunk> toStreamChunk(String data, String requestId, long startedAt) {
        if (data == null || data.isBlank()) {
            return Mono.error(protocolFailure());
        }
        if (isDoneData(data)) {
            long durationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            return Mono.just(new StreamChunk(
                    StreamChunk.Type.DONE, requestId, properties.model(), null, durationMs));
        }

        ChatCompletionChunk chunk;
        try {
            chunk = objectMapper.readValue(data, ChatCompletionChunk.class);
        } catch (JsonProcessingException exception) {
            return Mono.error(protocolFailure());
        }
        if (chunk.choices() == null || chunk.choices().isEmpty()) {
            return Mono.empty();
        }

        StreamChoice choice = chunk.choices().get(0);
        if (choice == null || choice.delta() == null
                || choice.delta().content() == null || choice.delta().content().isEmpty()) {
            return Mono.empty();
        }
        String model = chunk.model() == null || chunk.model().isBlank()
                ? properties.model()
                : chunk.model();
        return Mono.just(new StreamChunk(
                StreamChunk.Type.DELTA, requestId, model, choice.delta().content(), null));
    }

    private boolean isDoneData(String data) {
        return data != null && "[DONE]".equals(data.trim());
    }

    private ChatResult toResult(ChatCompletionResponse response, String requestId, long startedAt) {
        if (response.choices() == null || response.choices().isEmpty()) {
            throw protocolFailure();
        }

        Choice choice = response.choices().get(0);
        Usage usage = response.usage();
        if (choice == null || choice.message() == null || choice.message().content() == null || usage == null) {
            throw protocolFailure();
        }

        String model = response.model() == null || response.model().isBlank()
                ? properties.model()
                : response.model();
        long durationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
        return new ChatResult(
                requestId,
                model,
                choice.message().content(),
                choice.finishReason(),
                usage.promptTokens(),
                usage.completionTokens(),
                usage.totalTokens(),
                durationMs
        );
    }

    private Mono<? extends Throwable> safeHttpFailure(
            Mono<Void> releasedBody,
            LlmErrorType errorType,
            String safeMessage
    ) {
        return releasedBody.then(Mono.error(new LlmCallException(errorType, safeMessage)));
    }

    private Throwable mapFailure(Throwable failure) {
        if (failure instanceof LlmCallException) {
            return failure;
        }
        if (isTimeout(failure)) {
            return new LlmCallException(LlmErrorType.TIMEOUT, "模型请求超时");
        }
        if (failure instanceof WebClientRequestException) {
            return new LlmCallException(LlmErrorType.UPSTREAM, "无法连接模型服务");
        }
        return protocolFailure();
    }

    private boolean isTimeout(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof TimeoutException
                    || current instanceof ReadTimeoutException
                    || current instanceof ConnectTimeoutException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean isAuthenticationFailure(HttpStatusCode status) {
        return status.value() == 401 || status.value() == 403;
    }

    private void validateApiKey() {
        if (!properties.mockEnabled()
                && (properties.apiKey() == null || properties.apiKey().isBlank())) {
            throw new LlmCallException(LlmErrorType.CONFIGURATION, "未配置模型 API Key");
        }
    }

    private LlmCallException protocolFailure() {
        return new LlmCallException(LlmErrorType.PROTOCOL, "模型响应格式不正确");
    }
}
