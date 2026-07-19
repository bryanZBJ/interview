package com.zbj.interview.aiagent.week1.web.model;

import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * HTTP 接口使用的请求和响应模型。
 *
 * @author zhangbj
 */
public final class WebModels {

    private WebModels() {
    }

    public record ChatRequest(
            @NotBlank @Size(max = 4000) String message,
            @Size(max = 2000) String systemPrompt,
            @DecimalMin("0.0") @DecimalMax("2.0") Double temperature,
            @DecimalMin("0.0") @DecimalMax("1.0") Double topP,
            @Min(1) @Max(4096) Integer maxTokens
    ) {
    }

    public record ChatResponse(
            String requestId,
            String model,
            String content,
            String finishReason,
            Usage usage,
            long durationMs
    ) {

        public static ChatResponse from(ChatResult result) {
            return new ChatResponse(
                    result.requestId(),
                    result.model(),
                    result.content(),
                    result.finishReason(),
                    new Usage(result.promptTokens(), result.completionTokens(), result.totalTokens()),
                    result.durationMs()
            );
        }
    }

    public record Usage(
            Integer promptTokens,
            Integer completionTokens,
            Integer totalTokens
    ) {
    }

    public record StreamResponse(
            String requestId,
            String model,
            String content,
            Long durationMs
    ) {

        public static StreamResponse from(StreamChunk chunk) {
            return new StreamResponse(
                    chunk.requestId(), chunk.model(), chunk.content(), chunk.durationMs());
        }
    }

    public record ErrorResponse(
            Instant timestamp,
            String requestId,
            String code,
            String message
    ) {
    }
}
