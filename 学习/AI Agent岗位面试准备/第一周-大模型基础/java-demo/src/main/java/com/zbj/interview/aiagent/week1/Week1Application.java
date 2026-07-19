package com.zbj.interview.aiagent.week1;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class Week1Application {

    public static void main(String[] args) {
        SpringApplication.run(Week1Application.class, args);
    }
}
