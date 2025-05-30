// authUtils.js
import config from './agentConfig.js';
import md5 from 'md5'; // 需要安装md5库: npm install md5

// 生成MD5签名
function generateMD5Signature(timestamp) {
  const { authKey, authSecret } = config.auth;
  return md5(`${authKey}${authSecret}${timestamp}`);
}

// 获取请求头
export function getHeaders(authMethod = 'md5') {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  const timestamp = Date.now().toString();
  
  switch(authMethod) {
    case 'md5':
      headers.authKey = config.auth.authKey;
      headers.timestamp = timestamp;
      headers.sign = generateMD5Signature(timestamp);
      break;
      
    case 'bearer':
      headers.Authorization = `Bearer ${config.auth.authKey}.${config.auth.authSecret}`;
      break;
      
    case 'token':
      headers.token = `${config.auth.authKey}.${config.auth.authSecret}`;
      break;
      
    default:
      throw new Error('Unsupported authentication method');
  }
  
  return headers;
}