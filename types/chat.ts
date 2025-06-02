export interface ChatStreamResponse {
    chatId: number;
    complete: boolean;
    finish: boolean;
    content: string;
    conversationId: string;
    messageId: string;
    role: {
        id: string;
        name: string;
        avatar: string;
    };
    type: string;
}

export interface FileUploadResponse {
    code: number;
    msg: string;
    data: string;
}

export interface ChatFile {
    fileId: string;
    fileName: string;
    fileUrl?: string;
    groupName?: string;
}

export interface ChatState {
    chatId: number | null;
    conversationId: string | null;
    messageId: string | null;
    files: ChatFile[];
} 