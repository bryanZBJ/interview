package com.zbj.interview.aiagent.week1.domain;

public record StreamChunk(
        Type type,
        String requestId,
        String model,
        String content,
        Long durationMs
) {

    public enum Type {
        META,
        DELTA,
        DONE
    }
}
