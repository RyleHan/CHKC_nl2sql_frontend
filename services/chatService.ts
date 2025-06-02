import { AgentClient } from '../utils/AgentClient';
import { KnowledgeBaseClient } from '../utils/KnowledgeBaseClient';
import settings from '../config/settings';
import { ChatFile, ChatState } from '../types/chat';

export class ChatService {
    private agentClient: AgentClient;
    private kbClient: KnowledgeBaseClient;
    private chatStates: Map<string, ChatState>;

    constructor() {
        this.agentClient = new AgentClient(settings.AGENT_UUIDS.NORMAL_QA);
        this.kbClient = new KnowledgeBaseClient();
        this.chatStates = new Map();
    }

    updateAgentId(agentId: string) {
        this.agentClient = new AgentClient(agentId);
    }

    private getAgentId(activeCommands: Set<string>): string {
        if (activeCommands.has('report')) {
            return settings.AGENT_UUIDS.REPORT_WRITING;
        } else if (activeCommands.has('project-retrieval')) {
            return settings.AGENT_UUIDS.PROJECT_RECOMMEND;
        }
        return settings.AGENT_UUIDS.NORMAL_QA;
    }

    getChatState(agentId: string): ChatState {
        if (!this.chatStates.has(agentId)) {
            this.chatStates.set(agentId, {
                chatId: null,
                conversationId: null,
                messageId: null,
                files: []
            });
        }
        return this.chatStates.get(agentId)!;
    }

    async uploadFile(file: File): Promise<string> {
        try {
            const response = await this.kbClient.uploadFile({
                fileContent: file,  // 直接传递 File 对象
                fileName: file.name
            });
            return response;
        } catch (error: any) {
            console.error('文件上传失败:', error);
            throw new Error(`文件上传失败: ${error.message}`);
        }
    }

    async chatStream(
        userInput: string,
        activeCommands: Set<string>,
        files: File[] = []
    ): Promise<ReadableStream<Uint8Array>> {
        console.log('开始聊天流处理:', { userInput, activeCommands, files });
        
        const agentId = this.getAgentId(activeCommands);
        console.log('选择的 Agent ID:', agentId);
        
        const chatState = this.getChatState(agentId);
        console.log('当前聊天状态:', chatState);

        // 上传文件
        const uploadedFiles: ChatFile[] = [];
        if (files.length > 0) {  // 只在有文件时进行上传
            for (const file of files) {
                console.log('正在上传文件:', file.name);
                try {
                    const fileId = await this.uploadFile(file);
                    uploadedFiles.push({
                        fileId,
                        fileName: file.name
                    });
                    console.log('文件上传完成:', { fileId, fileName: file.name });
                } catch (error) {
                    console.error('文件上传失败:', error);
                    throw error;
                }
            }

            // 更新聊天状态
            chatState.files = [...chatState.files, ...uploadedFiles];
            console.log('更新后的聊天状态:', chatState);
        }

        // 准备请求参数
        console.log('准备发送聊天请求...');
        const response = await this.agentClient.chatStream({
            userInput,
            chatId: chatState.chatId?.toString() || null,
            files: uploadedFiles.length > 0 ? chatState.files : null,  // 只在有文件时传递文件信息
            state: {}  // 如果需要其他状态信息
        });

        console.log('收到服务器响应，开始处理流数据');
        return response;
    }
} 