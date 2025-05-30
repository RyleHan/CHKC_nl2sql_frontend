# CHKC 

智能项目推荐前端

## 🚀 快速开始 | Quick Start

### 前置要求 | Prerequisites
- Python 3.x
- 现代浏览器（支持ES6+）| Modern browser (ES6+ support)

### 安装步骤 | Installation Steps

1. 克隆项目 | Clone the project
```bash
git clone https://github.com/RyleHan/CHKC_nl2sql_frontend.git
cd CHKC_v1
```

2. 配置认证信息 | Configure Authentication
打开 `agentConfig.js` 文件，修改以下配置：
```javascript
auth: {
    authKey: 'your_auth_key',        // 替换为你的authKey
    authSecret: 'your_auth_secret',  // 替换为你的authSecret
    agentId: 'your_agent_id'        // 替换为你的Agent ID
}
```

3. 启动本地服务器 | Start local server
```bash
python3 -m http.server
```

4. 访问应用 | Access the application
在浏览器中打开：
```
http://localhost:8000
```

## 📁 项目结构 | Project Structure

```
CHKC_nl2sql_frontend/
├── index.html          # 主页面 | Main page
├── style.css          # 样式文件 | Styles
├── script.js          # 主要业务逻辑 | Main business logic
├── agentConfig.js     # 代理配置 | Agent configuration
├── agentApi.js        # API接口封装 | API interface
└── authUtils.js       # 认证工具 | Authentication utilities
```



## 📝 问题反馈 | Issues

如果你发现任何问题或有改进建议，请在GitHub Issues中提出。

If you find any issues or have suggestions for improvements, please raise them in GitHub Issues.

## 📄 许可证 | License

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 了解详情

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details 