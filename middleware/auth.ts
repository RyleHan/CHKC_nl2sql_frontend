import { Request, Response, NextFunction } from 'express';
import settings from '../config/settings';

/**
 * 验证Bearer Token中间件
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                code: 401,
                message: '无效的认证格式'
            });
            return;
        }

        const token = authHeader.split(' ')[1];
        const [authKey, authSecret] = token.split('.');

        if (!authKey || !authSecret) {
            res.status(401).json({
                code: 401,
                message: '无效的token格式'
            });
            return;
        }

        // 验证主认证信息
        if (authKey === settings.AUTH_KEY && authSecret === settings.AUTH_SECRET) {
            next();
            return;
        }

        // 验证Agent认证信息
        const agentKeys = [
            [settings.AGENT_UUIDS.NORMAL_QA, settings.AUTH_KEY, settings.AUTH_SECRET],
            [settings.AGENT_UUIDS.PROJECT_RECOMMEND, settings.AUTH_KEY, settings.AUTH_SECRET],
            [settings.AGENT_UUIDS.REPORT_WRITING, settings.AUTH_KEY, settings.AUTH_SECRET]
        ];

        if (agentKeys.some(([uuid, key, secret]) => 
            authKey === key && authSecret === secret)) {
            next();
            return;
        }

        res.status(401).json({
            code: 401,
            message: '无效的认证信息'
        });
    } catch (error) {
        res.status(401).json({
            code: 401,
            message: '无效的认证信息'
        });
    }
}; 