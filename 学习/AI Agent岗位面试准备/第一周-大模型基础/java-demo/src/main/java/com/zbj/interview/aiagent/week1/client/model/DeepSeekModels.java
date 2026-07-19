package com.zbj.interview.aiagent.week1.client.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * DeepSeek Chat Completions 接口使用的请求和响应模型。
 *
 * @author zhangbj
 */
public final class DeepSeekModels {

    private DeepSeekModels() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChatCompletionRequest(
            String model,
            List<Message> messages,
            Double temperature,
            @JsonProperty("top_p") Double topP,
            @JsonProperty("max_tokens") Integer maxTokens,
            boolean stream,
            @JsonProperty("stream_options") StreamOptions streamOptions,
            Thinking thinking
    ) {
    }

    public record StreamOptions(@JsonProperty("include_usage") boolean includeUsage) {
    }

    public record Thinking(String type) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChatCompletionResponse(
            String id,
            String model,
            List<Choice> choices,
            Usage usage
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Choice(
            Integer index,
            Message message,
            @JsonProperty("finish_reason") String finishReason
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChatCompletionChunk(
            String id,
            String model,
            List<StreamChoice> choices,
            Usage usage
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StreamChoice(
            Integer index,
            Delta delta,
            @JsonProperty("finish_reason") String finishReason
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Delta(String role, String content) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(String role, String content) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Usage(
            @JsonProperty("prompt_tokens") Integer promptTokens,
            @JsonProperty("completion_tokens") Integer completionTokens,
            @JsonProperty("total_tokens") Integer totalTokens
    ) {
    }
}
