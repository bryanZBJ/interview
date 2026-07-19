package com.zbj.interview.aiagent.week1.exception;

public class LlmCallException extends RuntimeException {

    private final LlmErrorType errorType;

    public LlmCallException(LlmErrorType errorType, String safeMessage) {
        super(safeMessage);
        this.errorType = errorType;
    }

    public LlmCallException(LlmErrorType errorType, String safeMessage, Throwable cause) {
        super(safeMessage, cause);
        this.errorType = errorType;
    }

    public LlmErrorType getErrorType() {
        return errorType;
    }
}
