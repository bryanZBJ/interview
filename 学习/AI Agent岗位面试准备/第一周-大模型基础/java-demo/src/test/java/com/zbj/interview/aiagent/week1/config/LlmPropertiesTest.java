package com.zbj.interview.aiagent.week1.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.net.URI;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class LlmPropertiesTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration.class)
            .withPropertyValues(
                    "llm.base-url=https://api.example.com/v1",
                    "llm.api-key=test-key",
                    "llm.model=test-model",
                    "llm.mock-enabled=true",
                    "llm.connect-timeout=2s",
                    "llm.response-timeout=30s",
                    "llm.max-input-length=100",
                    "llm.default-max-tokens=512"
            );

    @Test
    void shouldBindLlmProperties() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(LlmProperties.class);

            LlmProperties properties = context.getBean(LlmProperties.class);
            assertThat(properties.baseUrl()).isEqualTo(URI.create("https://api.example.com/v1"));
            assertThat(properties.apiKey()).isEqualTo("test-key");
            assertThat(properties.model()).isEqualTo("test-model");
            assertThat(properties.mockEnabled()).isTrue();
            assertThat(properties.connectTimeout()).isEqualTo(Duration.ofSeconds(2));
            assertThat(properties.responseTimeout()).isEqualTo(Duration.ofSeconds(30));
            assertThat(properties.maxInputLength()).isEqualTo(100);
            assertThat(properties.defaultMaxTokens()).isEqualTo(512);
        });
    }

    @EnableConfigurationProperties(LlmProperties.class)
    private static class TestConfiguration {
    }
}
