package com.zbj.interview.aiagent.week1.client;

import com.zbj.interview.aiagent.week1.domain.ChatCommand;
import com.zbj.interview.aiagent.week1.domain.ChatResult;
import com.zbj.interview.aiagent.week1.domain.StreamChunk;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * 大模型调用的统一契约。
 *
 * @author zhangbj
 */
public interface LlmClient {

    Mono<ChatResult> chat(ChatCommand command, String requestId);

    Flux<StreamChunk> stream(ChatCommand command, String requestId);
}
