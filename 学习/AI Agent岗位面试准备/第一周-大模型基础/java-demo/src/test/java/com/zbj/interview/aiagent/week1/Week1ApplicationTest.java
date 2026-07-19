package com.zbj.interview.aiagent.week1;

import com.zbj.interview.aiagent.week1.client.LlmClient;
import com.zbj.interview.aiagent.week1.client.MockLlmClient;
import com.zbj.interview.aiagent.week1.service.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class Week1ApplicationTest {

    @Autowired
    private List<LlmClient> clients;

    @Autowired
    private ChatService chatService;

    @Test
    void mockModeStartsWithOneLlmClientAndChatService() {
        assertThat(clients).singleElement().isInstanceOf(MockLlmClient.class);
        assertThat(chatService).isNotNull();
    }
}
