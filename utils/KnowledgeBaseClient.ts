import axios from 'axios';
import FormData from 'form-data';
import settings from '../config/settings';
import { ApiResponse, CreateDatasetOptions, UploadFileOptions } from '../types';

export class KnowledgeBaseClient {
    private baseUrl: string;
    private authKey: string;
    private authSecret: string;
    private headers: Record<string, string>;
    private readonly UPLOAD_ENDPOINT: string;
    private readonly CREATE_DATASET_ENDPOINT: string;
    private readonly MODIFY_DATASET_ENDPOINT: string;
    private readonly DELETE_DATASET_ENDPOINT: string;

    constructor(authKey: string | null = null, authSecret: string | null = null) {
        this.baseUrl = `https://${settings.API_BASE_URL}`;
        this.authKey = authKey || settings.AUTH_KEY;
        this.authSecret = authSecret || settings.AUTH_SECRET;
        this.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        };

        this.UPLOAD_ENDPOINT = "/openapi/fs/upload";
        this.CREATE_DATASET_ENDPOINT = "/openapi/kb/createDsAndTask";
        this.MODIFY_DATASET_ENDPOINT = "/openapi/kb/modifyDsAndTask";
        this.DELETE_DATASET_ENDPOINT = "/openapi/kb/deleteDs";
    }

    private _getAuthHeader(): string {
        return `Bearer ${this.authKey}.${this.authSecret}`;
    }

    private _getAuthHeaders(): Record<string, string> {
        const headers = { ...this.headers };
        headers["Authorization"] = this._getAuthHeader();
        return headers;
    }

    private async _request<T>(
        method: string,
        endpoint: string,
        data: any = null,
        params: any = null
    ): Promise<ApiResponse<T>> {
        const headers = this._getAuthHeaders();
        const url = `${this.baseUrl}${endpoint}`;

        try {
            let response;
            if (method === "GET") {
                response = await axios.get(url, { headers, params });
            } else if (method === "POST") {
                response = await axios.post(url, data, { headers });
            } else if (method === "PUT") {
                response = await axios.put(url, data, { headers });
            } else if (method === "DELETE") {
                response = await axios.delete(url, { headers, params });
            } else {
                throw new Error(`不支持的请求方法: ${method}`);
            }

            const result = response.data;
            if (result.code !== 1 && result.code !== 200 && result.code !== 0) {
                throw new Error(`知识库API请求失败: ${result.msg || '未知错误'}`);
            }
            return result;
        } catch (error: any) {
            throw new Error(`请求知识库API失败: ${error.message}`);
        }
    }

    async createDataset({
        kbId,
        name,
        fileId,
        parserType = "general",
        skipIfExists = true,
        autoStartChunkTask = true,
        alwaysCreateNew = false
    }: CreateDatasetOptions): Promise<number> {
        const data = {
            kbId,
            fileId,
            name,
            parserType,
            skipIfExists,
            autoStartChunkTask,
            alwaysCreateNew
        };

        const response = await this._request<number>("POST", this.CREATE_DATASET_ENDPOINT, data);
        return response.data;
    }

    async deleteDataset(dsIds: number[]): Promise<boolean> {
        const data = {
            dsIdList: dsIds
        };
        const response = await this._request<boolean>("POST", this.DELETE_DATASET_ENDPOINT, data);
        return response.data;
    }

    async uploadFileToKb({ kbId, fileContent, fileName }: {
        kbId: string;
        fileContent: Buffer;
        fileName: string;
    }): Promise<{ fileId: string; datasetId: number }> {
        try {
            const fileId = await this.uploadFile({
                fileContent,
                fileName,
                returnType: "id"
            });

            const datasetId = await this.createDataset({
                kbId,
                name: fileName,
                fileId
            });

            return {
                fileId,
                datasetId
            };
        } catch (error: any) {
            throw new Error(`上传文件请求失败: ${error.message}`);
        }
    }

    async uploadFile({
        fileContent,
        fileName,
        returnType = "id",
        metadata = null
    }: UploadFileOptions): Promise<string> {
        const headers = this._getAuthHeaders();
        delete headers["Content-Type"]; // Remove Content-Type for multipart/form-data

        const formData = new FormData();
        if (fileContent instanceof Blob) {
            formData.append("file", fileContent, fileName);
        } else if (Buffer.isBuffer(fileContent)) {
            const blob = new Blob([fileContent], { type: 'application/octet-stream' });
            formData.append("file", blob, fileName);
        } else {
            throw new Error('不支持的文件内容类型');
        }

        const params: Record<string, any> = { returnType };
        if (metadata) {
            params.metadata = JSON.stringify(metadata);
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}${this.UPLOAD_ENDPOINT}`,
                formData,
                {
                    headers,  // 只使用认证头信息
                    params
                }
            );

            const result = response.data;
            if (result.code !== 1 && result.code !== 200 && result.code !== 0) {
                throw new Error(`上传文件失败: ${result.msg || '未知错误'}`);
            }

            return result.data;
        } catch (error: any) {
            throw new Error(`上传文件请求失败: ${error.message}`);
        }
    }
} 