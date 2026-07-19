package com.zbj.interview.aiagent.week1.client;

import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.config.WebClientConfiguration;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import com.zbj.interview.aiagent.week1.exception.LlmCallException;
import com.zbj.interview.aiagent.week1.exception.LlmErrorType;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.mockwebserver.SocketPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.test.StepVerifier;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeepSeekLlmClientTest {

    private MockWebServer server;

    @BeforeEach
    void setUp() throws IOException {
        server = new MockWebServer();
        server.start();
    }

    @AfterEach
    void tearDown() throws IOException {
        server.shutdown();
    }

    @Test
    void sendsChatCompletionRequestAndParsesFirstChoiceAndUsage() throws InterruptedException {
        server.enqueue(jsonResponse(200, """
                {
                  "id":"req-1",
                  "model":"deepseek-v4-flash",
                  "choices":[{
                    "message":{"role":"assistant","content":"Token 是模型处理文本的单位"},
                    "finish_reason":"stop"
                  }],
                  "usage":{"prompt_tokens":10,"completion_tokens":12,"total_tokens":22}
                }
                """).setBodyDelay(25, TimeUnit.MILLISECONDS));

        ChatResult result = client(properties(Duration.ofSeconds(1), "test-key"))
                .chat(command(), "local-request")
                .block();

        assertThat(result).isNotNull();
        assertThat(result.requestId()).isEqualTo("local-request");
        assertThat(result.model()).isEqualTo("deepseek-v4-flash");
        assertThat(result.content()).isEqualTo("Token 是模型处理文本的单位");
        assertThat(result.finishReason()).isEqualTo("stop");
        assertThat(result.promptTokens()).isEqualTo(10);
        assertThat(result.completionTokens()).isEqualTo(12);
        assertThat(result.totalTokens()).isEqualTo(22);
        assertThat(result.durationMs()).isPositive();

        RecordedRequest request = server.takeRequest(1, TimeUnit.SECONDS);
        assertThat(request).isNotNull();
        assertThat(request.getMethod()).isEqualTo("POST");
        assertThat(request.getPath()).isEqualTo("/chat/completions");
        assertThat(request.getHeader("Authorization")).isEqualTo("Bearer test-key");
        assertThat(request.getHeader("Content-Type")).startsWith(MediaType.APPLICATION_JSON_VALUE);
        assertThat(request.getBody().readUtf8())
                .contains("\"model\":\"deepseek-v4-flash\"")
                .contains("解释 Token")
                .contains("\"temperature\":0.2")
                .contains("\"top_p\":0.9")
                .contains("\"max_tokens\":128")
                .contains("\"stream\":false")
                .contains("\"thinking\":{\"type\":\"disabled\"}");
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403})
    void mapsAuthenticationFailures(int status) {
        server.enqueue(jsonResponse(status, "{\"secret\":\"sensitive-upstream-body\"}"));

        assertFailure(LlmErrorType.AUTHENTICATION);
    }

    @Test
    void mapsRateLimitFailure() {
        server.enqueue(jsonResponse(429, "{\"secret\":\"sensitive-upstream-body\"}"));

        assertFailure(LlmErrorType.RATE_LIMIT);
    }

    @Test
    void mapsServerFailure() {
        server.enqueue(jsonResponse(503, "{\"secret\":\"sensitive-upstream-body\"}"));

        assertFailure(LlmErrorType.UPSTREAM);
    }

    @Test
    void mapsEmptyChoicesToProtocolFailure() {
        server.enqueue(jsonResponse(200, "{\"model\":\"deepseek-v4-flash\",\"choices\":[],\"usage\":{}}"));

        assertFailure(LlmErrorType.PROTOCOL);
    }

    @Test
    void mapsNetworkResponseTimeout() {
        server.enqueue(new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE));
        DeepSeekLlmClient client = client(properties(Duration.ofMillis(100), "test-key"));

        assertThatThrownBy(() -> client.chat(command(), "local-request").block())
                .isInstanceOfSatisfying(LlmCallException.class,
                        exception -> assertThat(exception.getErrorType()).isEqualTo(LlmErrorType.TIMEOUT));
    }

    @Test
    void rejectsMissingApiKeyBeforeSendingRequestWhenMockIsDisabled() throws InterruptedException {
        LlmProperties properties = properties(Duration.ofSeconds(1), "   ");
        DeepSeekLlmClient client = client(properties);

        assertThatThrownBy(() -> client.chat(command(), "local-request").block())
                .isInstanceOfSatisfying(LlmCallException.class,
                        exception -> assertThat(exception.getErrorType()).isEqualTo(LlmErrorType.CONFIGURATION));
        assertThat(server.takeRequest(150, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void streamsRealDataOnlySseInOrderAndCompletesOnDone() throws InterruptedException {
        server.enqueue(sseResponse("""
                data: {"id":"1","model":"deepseek-v4-flash","choices":[{"delta":{"content":"Token"},"finish_reason":null}]}

                data: {"id":"1","model":"deepseek-v4-flash","choices":[{"delta":{"content":" 是文本单位"},"finish_reason":"stop"}]}

                data: [DONE]

                """));

        StepVerifier.create(client(properties(Duration.ofSeconds(1), "test-key"))
                        .stream(command(), "local-request"))
                .assertNext(chunk -> assertChunk(chunk, StreamChunk.Type.META, null))
                .assertNext(chunk -> assertChunk(chunk, StreamChunk.Type.DELTA, "Token"))
                .assertNext(chunk -> assertChunk(chunk, StreamChunk.Type.DELTA, " 是文本单位"))
                .assertNext(chunk -> {
                    assertChunk(chunk, StreamChunk.Type.DONE, null);
                    assertThat(chunk.durationMs()).isNotNegative();
                })
                .verifyComplete();

        RecordedRequest request = server.takeRequest(1, TimeUnit.SECONDS);
        assertThat(request).isNotNull();
        assertThat(request.getHeader("Accept")).contains(MediaType.TEXT_EVENT_STREAM_VALUE);
        assertThat(request.getBody().readUtf8())
                .contains("\"stream\":true")
                .contains("\"stream_options\":{\"include_usage\":true}");
    }

    @Test
    void suppressesEmptyDeltaForUsageChunk() {
        server.enqueue(sseResponse("""
                data: {"id":"1","model":"deepseek-v4-flash","choices":[{"delta":{"content":"Token"},"finish_reason":"stop"}]}

                data: {"id":"1","model":"deepseek-v4-flash","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}

                data: [DONE]

                """));

        StepVerifier.create(client(properties(Duration.ofSeconds(1), "test-key"))
                        .stream(command(), "local-request"))
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.META)
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.DELTA
                        && "Token".equals(chunk.content()))
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.DONE)
                .verifyComplete();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not-json"})
    void mapsEmptyOrInvalidSseDataToProtocolFailure(String data) {
        server.enqueue(sseResponse("data: " + data + "\n\n"));

        StepVerifier.create(client(properties(Duration.ofSeconds(1), "test-key"))
                        .stream(command(), "local-request"))
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.META)
                .expectErrorSatisfies(failure -> assertThat(failure)
                        .isInstanceOfSatisfying(LlmCallException.class,
                                exception -> assertThat(exception.getErrorType())
                                        .isEqualTo(LlmErrorType.PROTOCOL)))
                .verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 429, 503})
    void mapsStreamingHttpFailuresLikeRegularCalls(int status) {
        server.enqueue(jsonResponse(status, "{\"secret\":\"sensitive-upstream-body\"}"));

        LlmErrorType expectedType = switch (status) {
            case 401 -> LlmErrorType.AUTHENTICATION;
            case 429 -> LlmErrorType.RATE_LIMIT;
            default -> LlmErrorType.UPSTREAM;
        };
        StepVerifier.create(client(properties(Duration.ofSeconds(1), "test-key"))
                        .stream(command(), "local-request"))
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.META)
                .expectErrorSatisfies(failure -> assertThat(failure)
                        .isInstanceOfSatisfying(LlmCallException.class, exception -> {
                            assertThat(exception.getErrorType()).isEqualTo(expectedType);
                            assertThat(exception.getMessage())
                                    .doesNotContain("sensitive-upstream-body", "test-key");
                        }))
                .verify();
    }

    @Test
    void mapsStreamingTimeoutLikeRegularCall() {
        server.enqueue(new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE));

        StepVerifier.create(client(properties(Duration.ofMillis(100), "test-key"))
                        .stream(command(), "local-request"))
                .expectNextMatches(chunk -> chunk.type() == StreamChunk.Type.META)
                .expectErrorSatisfies(failure -> assertThat(failure)
                        .isInstanceOfSatisfying(LlmCallException.class,
                                exception -> assertThat(exception.getErrorType())
                                        .isEqualTo(LlmErrorType.TIMEOUT)))
                .verify();
    }

    private void assertChunk(StreamChunk chunk, StreamChunk.Type type, String content) {
        assertThat(chunk.type()).isEqualTo(type);
        assertThat(chunk.requestId()).isEqualTo("local-request");
        assertThat(chunk.model()).isEqualTo("deepseek-v4-flash");
        assertThat(chunk.content()).isEqualTo(content);
    }

    private void assertFailure(LlmErrorType expectedType) {
        assertThatThrownBy(() -> client(properties(Duration.ofSeconds(1), "test-key"))
                .chat(command(), "local-request")
                .block())
                .isInstanceOfSatisfying(LlmCallException.class, exception -> {
                    assertThat(exception.getErrorType()).isEqualTo(expectedType);
                    assertThat(exception.getMessage())
                            .doesNotContain("sensitive-upstream-body")
                            .doesNotContain("test-key");
                });
    }

    private DeepSeekLlmClient client(LlmProperties properties) {
        WebClient webClient = new WebClientConfiguration().deepSeekWebClient(properties);
        return new DeepSeekLlmClient(webClient, properties);
    }

    private LlmProperties properties(Duration responseTimeout, String apiKey) {
        return new LlmProperties(
                server.url("/").uri(),
                apiKey,
                "deepseek-v4-flash",
                false,
                Duration.ofSeconds(1),
                responseTimeout,
                4000,
                512
        );
    }

    private ChatCommand command() {
        return new ChatCommand("解释 Token", "你是 Java 面试官", 0.2, 0.9, 128);
    }

    private MockResponse jsonResponse(int status, String body) {
        return new MockResponse()
                .setResponseCode(status)
                .setHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .setBody(body);
    }

    private MockResponse sseResponse(String body) {
        return new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", MediaType.TEXT_EVENT_STREAM_VALUE)
                .setBody(body);
    }
}
