package com.zbj.interview.aiagent.week1.domain;

public record ChatCommand(
        String message,
        String systemPrompt,
        Double temperature,
        Double topP,
        Integer maxTokens
) {
}
