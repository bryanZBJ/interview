package com.zbj.interview.aiagent.week1.config;

import com.zbj.interview.aiagent.week1.client.DeepSeekLlmClient;
import com.zbj.interview.aiagent.week1.client.LlmClient;
import com.zbj.interview.aiagent.week1.client.MockLlmClient;
import com.zbj.interview.aiagent.week1.service.ChatService;
import io.netty.channel.ChannelOption;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

/**
 * 根据运行模式装配唯一的大模型客户端，并配置网络超时。
 *
 * @author zhangbj
 */
@Configuration(proxyBeanMethods = false)
public class WebClientConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "llm", name = "mock-enabled", havingValue = "false")
    public WebClient deepSeekWebClient(LlmProperties properties) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS,
                        Math.toIntExact(properties.connectTimeout().toMillis()))
                .responseTimeout(properties.responseTimeout());

        return WebClient.builder()
                .baseUrl(properties.baseUrl().toString())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
                .build();
    }

    @Bean
    @ConditionalOnProperty(prefix = "llm", name = "mock-enabled", havingValue = "false")
    public DeepSeekLlmClient deepSeekLlmClient(WebClient deepSeekWebClient, LlmProperties properties) {
        return new DeepSeekLlmClient(deepSeekWebClient, properties);
    }

    @Bean
    @ConditionalOnProperty(prefix = "llm", name = "mock-enabled", havingValue = "true", matchIfMissing = true)
    public MockLlmClient mockLlmClient(LlmProperties properties) {
        return new MockLlmClient(properties);
    }

    @Bean
    public ChatService chatService(LlmClient client, LlmProperties properties) {
        return new ChatService(client, properties);
    }
}
