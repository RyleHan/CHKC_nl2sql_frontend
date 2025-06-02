export interface Settings {
    API_BASE_URL: string;
    AUTH_KEY: string;
    AUTH_SECRET: string;
    AGENT_UUIDS: {
        NORMAL_QA: string;
        PROJECT_RECOMMEND: string;
        REPORT_WRITING: string;
    };
}

export interface AuthHeaders {
    [key: string]: string;
    Authorization: string;
    "Content-Type": string;
}

export interface ChatPayload {
    agentId: string;
    userChatInput: string;
    debug?: boolean;
    state?: Record<string, any>;
    chatId?: string | null;
    conversationId?: string | null;
    images?: any[];
    files?: any[];
}

export interface CreateDatasetOptions {
    kbId: string;
    name: string;
    fileId: string;
    parserType?: string;
    skipIfExists?: boolean;
    autoStartChunkTask?: boolean;
    alwaysCreateNew?: boolean;
}

export interface UploadFileOptions {
    fileContent: File | Buffer;
    fileName: string;
    returnType?: 'id' | 'url';
    metadata?: Record<string, any> | null;
}

export interface ApiResponse<T = any> {
    code: number;
    data: T;
    msg?: string;
} 