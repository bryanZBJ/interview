package com.zbj.interview.aiagent.week1.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.time.Duration;

@ConfigurationProperties("llm")
public record LlmProperties(
        URI baseUrl,
        String apiKey,
        String model,
        boolean mockEnabled,
        Duration connectTimeout,
        Duration responseTimeout,
        int maxInputLength,
        int defaultMaxTokens
) {
}
