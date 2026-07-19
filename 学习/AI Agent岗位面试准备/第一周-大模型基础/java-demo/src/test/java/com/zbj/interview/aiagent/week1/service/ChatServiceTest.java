package com.zbj.interview.aiagent.week1.service;

import com.zbj.interview.aiagent.week1.client.LlmClient;
import com.zbj.interview.aiagent.week1.client.MockLlmClient;
import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

import java.net.URI;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class ChatServiceTest {

    private final LlmProperties properties = new LlmProperties(
            URI.create("http://localhost"), "", "deepseek-v4-flash", true,
            Duration.ofSeconds(1), Duration.ofSeconds(5), 4000, 512);
    private final LlmClient client = new MockLlmClient(properties);
    private final ChatService service = new ChatService(client, properties);

    @Test
    void returnsMockChatResultWithUuidRequestId() {
        ChatResult result = service.chat(
                new ChatCommand("解释 Token", null, 0.2, 0.9, 128)
        ).block();

        assertThat(result).isNotNull();
        assertThat(result.content()).contains("Mock").contains("解释 Token");
        assertThatCode(() -> UUID.fromString(result.requestId())).doesNotThrowAnyException();
    }

    @Test
    void streamsMetaAtLeastTwoDeltasAndDoneWithSameRequestId() {
        StepVerifier.create(service.stream(
                        new ChatCommand("流式回答", null, 0.2, 0.9, 128))
                        .collectList())
                .assertNext(chunks -> {
                    assertThat(chunks).hasSizeGreaterThanOrEqualTo(4);
                    assertThat(chunks.get(0).type()).isEqualTo(StreamChunk.Type.META);
                    assertThat(chunks.get(chunks.size() - 1).type()).isEqualTo(StreamChunk.Type.DONE);
                    assertThat(chunks.stream()
                            .filter(chunk -> chunk.type() == StreamChunk.Type.DELTA))
                            .hasSizeGreaterThanOrEqualTo(2);

                    String requestId = chunks.get(0).requestId();
                    assertThatCode(() -> UUID.fromString(requestId)).doesNotThrowAnyException();
                    assertThat(chunks).allMatch(chunk -> requestId.equals(chunk.requestId()));
                })
                .verifyComplete();
    }
}
