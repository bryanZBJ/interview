package com.zbj.interview.aiagent.week1.web;

import com.zbj.interview.aiagent.week1.client.LlmClient;
import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import com.zbj.interview.aiagent.week1.exception.LlmCallException;
import com.zbj.interview.aiagent.week1.exception.LlmErrorType;
import com.zbj.interview.aiagent.week1.service.ChatService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class ChatControllerTest {

    private static final String LEAKED_DETAILS =
            "rawBody={api_key=sk-secret, error=DeepSeek upstream details}";

    private StubLlmClient llmClient;
    private WebTestClient webTestClient;

    @BeforeEach
    void setUp() {
        llmClient = new StubLlmClient();
        webTestClient = createClient(properties(4000));
    }

    @Test
    void shouldMapRequestAndReturnStructuredChatResponse() {
        webTestClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {
                          "message": "解释 Token",
                          "systemPrompt": "你是面试官",
                          "temperature": 0.2,
                          "topP": 0.8,
                          "maxTokens": 256
                        }
                        """)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.requestId").isEqualTo("request-123")
                .jsonPath("$.model").isEqualTo("deepseek-v4-flash")
                .jsonPath("$.content").isEqualTo("Mock 回答：解释 Token")
                .jsonPath("$.finishReason").isEqualTo("stop")
                .jsonPath("$.usage.promptTokens").isEqualTo(12)
                .jsonPath("$.usage.completionTokens").isEqualTo(8)
                .jsonPath("$.usage.totalTokens").isEqualTo(20)
                .jsonPath("$.durationMs").isEqualTo(35);

        assertThat(llmClient.lastCommand).isEqualTo(new ChatCommand(
                "解释 Token", "你是面试官", 0.2, 0.8, 256));
    }

    @Test
    void shouldRejectBlankMessage() {
        assertValidationError("{\"message\":\"   \"}");
    }

    @Test
    void shouldRejectMessageLongerThanStaticLimit() {
        assertValidationError("{\"message\":\"" + "a".repeat(4001) + "\"}");
    }

    @Test
    void shouldRejectMessageLongerThanConfiguredLimit() {
        createClient(properties(100)).post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"message\":\"" + "a".repeat(101) + "\"}")
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("VALIDATION_ERROR")
                .jsonPath("$.requestId").isNotEmpty();
    }

    @Test
    void shouldRejectTemperatureOutsideSupportedRange() {
        assertValidationError("{\"message\":\"hello\",\"temperature\":2.1}");
    }

    @Test
    void shouldExposeNamedStreamEventsWithStreamResponseData() {
        webTestClient.get()
                .uri(uriBuilder -> uriBuilder.path("/api/chat/stream")
                        .queryParam("message", "解释 Token")
                        .queryParam("temperature", "0.2")
                        .queryParam("topP", "0.8")
                        .build())
                .accept(MediaType.TEXT_EVENT_STREAM)
                .exchange()
                .expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                .expectBody(String.class)
                .value(stream -> {
                    assertThat(stream)
                            .containsSubsequence("event:meta", "event:delta", "event:done")
                            .contains("\"requestId\":\"stream-request\"")
                            .contains("\"model\":\"deepseek-v4-flash\"")
                            .contains("\"content\":\"Token\"");
                });

        assertThat(llmClient.lastCommand).isEqualTo(
                new ChatCommand("解释 Token", null, 0.2, 0.8, null));
    }

    @ParameterizedTest
    @MethodSource("invalidStreamQueries")
    void shouldRejectInvalidStreamQueryParameters(String query) {
        webTestClient.get()
                .uri(URI.create("/api/chat/stream?" + query))
                .accept(MediaType.TEXT_EVENT_STREAM)
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("VALIDATION_ERROR")
                .jsonPath("$.requestId").isNotEmpty();
    }

    @ParameterizedTest
    @MethodSource("llmErrors")
    void shouldMapLlmErrorToSafeResponse(
            LlmErrorType errorType, int expectedStatus, String expectedMessage) {
        llmClient.failure = new LlmCallException(errorType, LEAKED_DETAILS);

        webTestClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"message\":\"hello\"}")
                .exchange()
                .expectStatus().isEqualTo(expectedStatus)
                .expectBody()
                .jsonPath("$.timestamp").isNotEmpty()
                .jsonPath("$.requestId").isNotEmpty()
                .jsonPath("$.code").isEqualTo(errorType.name())
                .jsonPath("$.message").isEqualTo(expectedMessage)
                .jsonPath("$").value(body -> assertThat(body.toString())
                        .doesNotContain("sk-secret", "rawBody", "DeepSeek upstream details", "stackTrace"));
    }

    @Test
    void shouldHideUnexpectedExceptionDetails() {
        llmClient.failure = new IllegalStateException(LEAKED_DETAILS);

        webTestClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"message\":\"hello\"}")
                .exchange()
                .expectStatus().is5xxServerError()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INTERNAL_ERROR")
                .jsonPath("$.message").isEqualTo("服务暂时不可用，请稍后重试")
                .jsonPath("$").value(body -> assertThat(body.toString())
                        .doesNotContain("sk-secret", "rawBody", "DeepSeek upstream details", "stackTrace"));
    }

    private void assertValidationError(String body) {
        webTestClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.timestamp").isNotEmpty()
                .jsonPath("$.requestId").isNotEmpty()
                .jsonPath("$.code").isEqualTo("VALIDATION_ERROR")
                .jsonPath("$.message").isNotEmpty();
    }

    private WebTestClient createClient(LlmProperties properties) {
        ChatService chatService = new ChatService(llmClient, properties);
        return WebTestClient.bindToController(new ChatController(chatService, properties))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private static LlmProperties properties(int maxInputLength) {
        return new LlmProperties(
                URI.create("https://api.deepseek.com"),
                "test-key",
                "deepseek-v4-flash",
                true,
                Duration.ofSeconds(3),
                Duration.ofSeconds(60),
                maxInputLength,
                512
        );
    }

    private static Stream<Arguments> llmErrors() {
        return Stream.of(
                Arguments.of(LlmErrorType.AUTHENTICATION, 502, "大模型认证失败，请联系管理员"),
                Arguments.of(LlmErrorType.RATE_LIMIT, 429, "请求过于频繁，请稍后重试"),
                Arguments.of(LlmErrorType.TIMEOUT, 504, "大模型响应超时，请稍后重试"),
                Arguments.of(LlmErrorType.UPSTREAM, 502, "大模型服务暂时不可用，请稍后重试"),
                Arguments.of(LlmErrorType.PROTOCOL, 502, "大模型响应格式异常，请稍后重试"),
                Arguments.of(LlmErrorType.CONFIGURATION, 503, "大模型服务配置不可用，请联系管理员")
        );
    }

    private static Stream<Arguments> invalidStreamQueries() {
        return Stream.of(
                Arguments.of("message=%20%20%20"),
                Arguments.of("message=" + "a".repeat(4001)),
                Arguments.of("message=hello&temperature=-0.1"),
                Arguments.of("message=hello&temperature=2.1"),
                Arguments.of("message=hello&topP=-0.1"),
                Arguments.of("message=hello&topP=1.1")
        );
    }

    private static final class StubLlmClient implements LlmClient {

        private ChatCommand lastCommand;
        private RuntimeException failure;

        @Override
        public Mono<ChatResult> chat(ChatCommand command, String requestId) {
            lastCommand = command;
            if (failure != null) {
                return Mono.error(failure);
            }
            return Mono.just(new ChatResult(
                    "request-123",
                    "deepseek-v4-flash",
                    "Mock 回答：" + command.message(),
                    "stop",
                    12,
                    8,
                    20,
                    35L
            ));
        }

        @Override
        public Flux<StreamChunk> stream(ChatCommand command, String requestId) {
            lastCommand = command;
            return Flux.fromIterable(List.of(
                    new StreamChunk(StreamChunk.Type.META, "stream-request",
                            "deepseek-v4-flash", null, null),
                    new StreamChunk(StreamChunk.Type.DELTA, "stream-request",
                            "deepseek-v4-flash", "Token", null),
                    new StreamChunk(StreamChunk.Type.DONE, "stream-request",
                            "deepseek-v4-flash", null, 10L)
            ));
        }
    }
}
