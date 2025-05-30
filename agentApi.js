// agentApi.js
import config from './agentConfig.js';
import { getHeaders } from './authUtils.js';

// 获取API基础URL
function getBaseUrl() {
  return config.apiHosts[config.env];
}

/**
 * 与Agent聊天（流式接口）
 * @param {string} userInput 用户输入内容
 * @param {string|null} chatId 对话ID，第一次可不传
 * @param {Object} state 环境变量
 * @returns {Promise<ReadableStream>} 返回流式响应
 */
export async function chatWithAgentStream(userInput, chatId = null, state = {}) {
  const url = `${getBaseUrl()}/openapi/agents/chat/stream/v1`;
  const headers = getHeaders('md5'); // 使用MD5认证
  
  const body = {
    agentId: config.auth.agentId,
    chatId: chatId,
    userChatInput: userInput,
    state: state,
    files: [],
    images: [],
    debug: false
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.body;
}

/**
 * 与Agent聊天（非流式接口）
 * @param {string} userInput 用户输入内容
 * @param {string|null} chatId 对话ID，第一次可不传
 * @param {Object} state 环境变量
 * @returns {Promise<Object>} 返回完整响应
 */
export async function chatWithAgent(userInput, chatId = null, state = {}) {
  const url = `${getBaseUrl()}/openapi/agents/chat/completions/v1`;
  const headers = getHeaders('bearer'); // 使用Bearer Token认证
  
  console.log('Requesting URL (chatWithAgent):', url); // 打印请求的URL

  const body = {
    agentId: config.auth.agentId,
    chatId: chatId,
    userChatInput: userInput,
    state: state,
    files: [],
    images: [],
    debug: false
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * 结束对话流
 * @param {string} conversationId 会话ID
 * @returns {Promise<Object>} 返回操作结果
 */
export async function closeConversation(conversationId) {
  const url = `${getBaseUrl()}/openapi/agents/chat/close?agentId=${config.auth.agentId}&conversationId=${conversationId}`;
  const headers = getHeaders('token'); // 使用Token认证
  
  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}