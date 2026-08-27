import { Handler } from 'hydrooj';
import {
    AI_ANALYSIS_DAILY_LIMIT,
    peekAiAnalysisRemaining,
    resolveAiAnalysisQuota,
} from '../lib/quota';

/** GET `/api/problem/ide-ai-quota?pid=` — 与 CodeFun 同路径，FishOJ 暂为日次数（无 AiQuota 钱包） */
export class ProblemIdeAiQuotaHandler extends Handler {
    async get() {
        const pid = String((this.request.query as { pid?: string })?.pid || '').trim();
        if (!pid) {
            this.response.body = { error: '参数缺失' };
            return;
        }
        const uid = Number(this.user._id);
        if (!uid) {
            this.response.body = { error: '请先登录' };
            return;
        }
        const q = resolveAiAnalysisQuota(this.user as any);
        if (q.unlimited) {
            this.response.body = {
                aiQuota: {
                    source: 'daily_count',
                    limited: false,
                    unlimited: true,
                    remaining: null,
                    dailyLimit: null,
                },
            };
            return;
        }
        if (!q.applyQuota) {
            this.response.body = { aiQuota: null };
            return;
        }
        const peek = await peekAiAnalysisRemaining(this.ctx, uid, q.dailyLimit || AI_ANALYSIS_DAILY_LIMIT);
        this.response.body = {
            aiQuota: {
                source: 'daily_count',
                limited: true,
                remaining: peek.remaining,
                dailyLimit: peek.dailyLimit,
            },
        };
    }
}
