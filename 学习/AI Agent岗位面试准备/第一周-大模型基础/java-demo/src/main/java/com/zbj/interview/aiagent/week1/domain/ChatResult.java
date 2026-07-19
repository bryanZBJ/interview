package com.zbj.interview.aiagent.week1.domain;

public record ChatResult(
        String requestId,
        String model,
        String content,
        String finishReason,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens,
        long durationMs
) {
}
