// agentConfig.js
const config = {
    // 选择环境 (test, uat, prod)
    env: 'uat',
    
    // 认证信息 - 使用个人秘钥或Agent Token
    auth: {
      authKey: 'your_auth_key',          // 替换为你的authKey
      authSecret: 'your_auth_secret',       // 替换为你的authSecret
      agentId: 'your_agent_id' // 替换为你的Agent ID
    },
    
    // 各环境API地址
    apiHosts: {
      test: 'https://test.agentspro.cn',
      uat: 'https://uat.agentspro.cn',
      prod: 'https://lingda.agentspro.cn'
    }
  };
  
  export default config;