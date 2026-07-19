package com.zbj.interview.aiagent.week1.web;

import com.zbj.interview.aiagent.week1.exception.LlmCallException;
import com.zbj.interview.aiagent.week1.exception.LlmErrorType;
import com.zbj.interview.aiagent.week1.web.model.WebModels.ErrorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ServerWebInputException;

import java.time.Instant;
import java.util.UUID;

/**
 * 将 Web 层异常转换为不包含上游敏感信息的统一响应。
 *
 * @author zhangbj
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(WebExchangeBindException.class)
    public ResponseEntity<ErrorResponse> handleValidation(WebExchangeBindException exception) {
        return validationError();
    }

    @ExceptionHandler(ServerWebInputException.class)
    public ResponseEntity<ErrorResponse> handleInvalidInput(ServerWebInputException exception) {
        return validationError();
    }

    @ExceptionHandler(LlmCallException.class)
    public ResponseEntity<ErrorResponse> handleLlmCall(LlmCallException exception) {
        String requestId = newRequestId();
        ErrorMapping mapping = ErrorMapping.from(exception.getErrorType());
        log.warn("LLM request failed, requestId={}, errorType={}", requestId, exception.getErrorType());
        return ResponseEntity.status(mapping.status())
                .contentType(MediaType.APPLICATION_JSON)
                .body(error(requestId, exception.getErrorType().name(), mapping.message()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception exception) {
        String requestId = newRequestId();
        log.error("Unexpected request failure, requestId={}, failureType={}",
                requestId, exception.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_JSON)
                .body(error(requestId, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试"));
    }

    private ResponseEntity<ErrorResponse> validationError() {
        String requestId = newRequestId();
        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_JSON)
                .body(error(requestId, "VALIDATION_ERROR", "请求参数校验失败"));
    }

    private ErrorResponse error(String requestId, String code, String message) {
        return new ErrorResponse(Instant.now(), requestId, code, message);
    }

    private String newRequestId() {
        return UUID.randomUUID().toString();
    }

    private record ErrorMapping(HttpStatus status, String message) {

        private static ErrorMapping from(LlmErrorType errorType) {
            return switch (errorType) {
                case AUTHENTICATION -> new ErrorMapping(
                        HttpStatus.BAD_GATEWAY, "大模型认证失败，请联系管理员");
                case RATE_LIMIT -> new ErrorMapping(
                        HttpStatus.TOO_MANY_REQUESTS, "请求过于频繁，请稍后重试");
                case TIMEOUT -> new ErrorMapping(
                        HttpStatus.GATEWAY_TIMEOUT, "大模型响应超时，请稍后重试");
                case UPSTREAM -> new ErrorMapping(
                        HttpStatus.BAD_GATEWAY, "大模型服务暂时不可用，请稍后重试");
                case PROTOCOL -> new ErrorMapping(
                        HttpStatus.BAD_GATEWAY, "大模型响应格式异常，请稍后重试");
                case CONFIGURATION -> new ErrorMapping(
                        HttpStatus.SERVICE_UNAVAILABLE, "大模型服务配置不可用，请联系管理员");
            };
        }
    }
}
