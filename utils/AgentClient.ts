import axios, { AxiosResponse } from 'axios';
import { Readable } from 'stream';
import settings from '../config/settings';
import { AuthHeaders, ChatPayload, ApiResponse } from '../types';

export class AgentClient {
    private agentUuid: string;
    private authKey: string;
    private authSecret: string;
    private baseUrl: string;

    constructor(agentId: string, authKey: string | null = null, authSecret: string | null = null) {
        if (!agentId) {
            throw new Error('agentId is required');
        }
        this.agentUuid = agentId;
        this.authKey = authKey || settings.AUTH_KEY;
        this.authSecret = authSecret || settings.AUTH_SECRET;
        this.baseUrl = `https://${settings.API_BASE_URL}`;
    }

    private _getAuthHeaders(): AuthHeaders {
        return {
            "Authorization": `Bearer ${this.authKey}.${this.authSecret}`,
            "Content-Type": "application/json"
        };
    }

    private _preparePayload({
        userInput,
        chatId = null,
        conversationId = null,
        state = {},
        images = null,
        files = null,
        debug = false
    }: {
        userInput: string;
        chatId?: string | null;
        conversationId?: string | null;
        state?: Record<string, any>;
        images?: any[] | null;
        files?: any[] | null;
        debug?: boolean;
    }): ChatPayload {
        const payload: ChatPayload = {
            agentId: this.agentUuid!,
            userChatInput: userInput,
            debug,
            state
        };

        if (chatId) payload.chatId = chatId;
        if (conversationId) payload.conversationId = conversationId;
        if (images) payload.images = images;
        if (files) payload.files = files;

        return payload;
    }

    async chatStream({
        userInput,
        chatId = null,
        conversationId = null,
        state = {},
        images = null,
        files = null,
        debug = false
    }: {
        userInput: string;
        chatId?: string | null;
        conversationId?: string | null;
        state?: Record<string, any>;
        images?: any[] | null;
        files?: any[] | null;
        debug?: boolean;
    }): Promise<ReadableStream<Uint8Array>> {
        const url = `${this.baseUrl}/openapi/agents/chat/stream/v1`;
        const headers = this._getAuthHeaders();
        
        // 构建符合接口文档的请求体
        const payload = {
            agentId: this.agentUuid,
            chatId: chatId,
            userChatInput: userInput,
            state: state,
            images: images,
            files: files,
            debug: debug
        };

        try {
            console.log('发送聊天请求:', { url, payload });
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('服务器响应错误:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`请求失败: ${response.status} - ${errorText}`);
            }

            if (!response.body) {
                console.error('响应体为空');
                throw new Error('响应体为空');
            }

            console.log('收到服务器响应，状态:', response.status);
            return response.body;
        } catch (error: any) {
            console.error('聊天请求失败:', error);
            throw new Error(`Agent API error: ${error.message}`);
        }
    }

    async chatCompletions({
        userInput,
        chatId = null,
        conversationId = null,
        state = {},
        images = null,
        files = null,
        debug = false
    }: {
        userInput: string;
        chatId?: string | null;
        conversationId?: string | null;
        state?: Record<string, any>;
        images?: any[] | null;
        files?: any[] | null;
        debug?: boolean;
    }): Promise<ApiResponse> {
        const url = `${this.baseUrl}/openapi/agents/chat/completions/v1`;
        const headers = this._getAuthHeaders();
        const payload = this._preparePayload({
            userInput,
            chatId,
            conversationId,
            state,
            images,
            files,
            debug
        });

        try {
            const response = await axios.post(url, payload, { headers });
            return response.data;
        } catch (error: any) {
            throw new Error(`Agent API error: ${error.response?.status}, ${error.response?.data}`);
        }
    }

    async chatCompletionsAsync({
        userInput,
        chatId = null,
        conversationId = null,
        state = {},
        images = null,
        files = null,
        debug = false,
        callbackUrl = null
    }: {
        userInput: string;
        chatId?: string | null;
        conversationId?: string | null;
        state?: Record<string, any>;
        images?: any[] | null;
        files?: any[] | null;
        debug?: boolean;
        callbackUrl?: string | null;
    }): Promise<ApiResponse> {
        const url = `${this.baseUrl}/openapi/agents/chat/completions/async/v1`;
        const headers = this._getAuthHeaders();
        const payload = this._preparePayload({
            userInput,
            chatId,
            conversationId,
            state,
            images,
            files,
            debug
        });

        if (callbackUrl) {
            (payload as any).callbackUrl = callbackUrl;
        }

        try {
            const response = await axios.post(url, payload, { headers });
            return response.data;
        } catch (error: any) {
            throw new Error(`Agent API error: ${error.response?.status}, ${error.response?.data}`);
        }
    }

    async chatCompletionsAsyncPolling(requestId: string, agentId: string | null = null): Promise<ApiResponse> {
        const url = `${this.baseUrl}/openapi/agents/chat/completions/async/polling/v1`;
        const headers = this._getAuthHeaders();
        const params = {
            agentId: agentId || this.agentUuid,
            requestId
        };

        try {
            const response = await axios.get(url, { headers, params });
            return response.data;
        } catch (error: any) {
            throw new Error(`Agent API error: ${error.response?.status}, ${error.response?.data}`);
        }
    }
} 