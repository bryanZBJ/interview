package com.zbj.interview.aiagent.week1.web;

import com.zbj.interview.aiagent.week1.config.LlmProperties;
import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.service.ChatService;
import com.zbj.interview.aiagent.week1.web.model.WebModels.ChatRequest;
import com.zbj.interview.aiagent.week1.web.model.WebModels.ChatResponse;
import com.zbj.interview.aiagent.week1.web.model.WebModels.StreamResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebInputException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Locale;

/**
 * 对外提供经过参数校验的普通聊天接口。
 *
 * @author zhangbj
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final int REQUEST_MESSAGE_LIMIT = 4000;

    private final ChatService chatService;
    private final LlmProperties properties;

    public ChatController(ChatService chatService, LlmProperties properties) {
        this.chatService = chatService;
        this.properties = properties;
    }

    @PostMapping
    public Mono<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        validateMessage(request.message());

        ChatCommand command = new ChatCommand(
                request.message(),
                request.systemPrompt(),
                request.temperature(),
                request.topP(),
                request.maxTokens()
        );
        return chatService.chat(command).map(ChatResponse::from);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StreamResponse>> stream(
            @RequestParam String message,
            @RequestParam(required = false) String systemPrompt,
            @RequestParam(required = false) Double temperature,
            @RequestParam(required = false) Double topP,
            @RequestParam(required = false) Integer maxTokens
    ) {
        validateStreamParameters(message, systemPrompt, temperature, topP, maxTokens);
        ChatCommand command = new ChatCommand(
                message, systemPrompt, temperature, topP, maxTokens);
        return chatService.stream(command)
                .map(chunk -> ServerSentEvent.<StreamResponse>builder()
                        .event(chunk.type().name().toLowerCase(Locale.ROOT))
                        .data(StreamResponse.from(chunk))
                        .build());
    }

    private void validateStreamParameters(
            String message,
            String systemPrompt,
            Double temperature,
            Double topP,
            Integer maxTokens
    ) {
        validateMessage(message);
        if (systemPrompt != null && systemPrompt.length() > 2000) {
            throw invalidInput();
        }
        if (temperature != null && (temperature < 0.0D || temperature > 2.0D)) {
            throw invalidInput();
        }
        if (topP != null && (topP < 0.0D || topP > 1.0D)) {
            throw invalidInput();
        }
        if (maxTokens != null && (maxTokens < 1 || maxTokens > 4096)) {
            throw invalidInput();
        }
    }

    private void validateMessage(String message) {
        int effectiveLimit = Math.min(REQUEST_MESSAGE_LIMIT, properties.maxInputLength());
        if (message == null || message.isBlank() || message.length() > effectiveLimit) {
            throw invalidInput();
        }
    }

    private ServerWebInputException invalidInput() {
        return new ServerWebInputException("invalid chat request parameters");
    }
}
