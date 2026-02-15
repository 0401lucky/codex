'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Sparkles } from 'lucide-react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    oauth_denied: '授权已取消',
    missing_params: '参数缺失，请重新登录',
    invalid_state: '安全校验失败，请重新登录',
    callback_failed: '登录失败，请稍后重试',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfcf8] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center p-4 bg-gradient-to-br from-orange-100 to-amber-50 rounded-3xl mb-6 shadow-glow-gold border border-orange-100">
            <Sparkles className="w-10 h-10 text-orange-500 fill-orange-500" />
          </div>
          <h1 className="text-3xl font-black text-stone-700 tracking-tight mb-2">
            Codex 福利站
          </h1>
          <p className="text-stone-500 font-medium">
            每日免费抽奖，赢取 API 额度
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm text-center animate-fade-in">
            {errorMessages[error] || '登录出错，请重试'}
          </div>
        )}

        <div className="glass-card rounded-3xl p-8 animate-scale-in">
          <a
            href="/api/auth/linuxdo"
            className="group relative flex items-center justify-center gap-3 w-full py-4 px-6 gradient-warm text-white rounded-2xl font-bold text-lg shadow-[0_10px_30px_rgba(249,115,22,0.4)] hover:shadow-[0_15px_40px_rgba(249,115,22,0.6)] hover:-translate-y-1 active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full skew-y-12 group-hover:translate-y-[-200%] transition-transform duration-700 ease-in-out" />
            <svg className="w-6 h-6 relative z-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            <span className="relative z-10">使用 LinuxDo 登录</span>
          </a>

          <p className="text-center text-xs text-stone-400 mt-6 font-medium">
            使用 LinuxDo 账号登录即可参与抽奖
          </p>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8">
          100% 中奖概率 · 每日免费一次 · 最高 $20 额度
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#fdfcf8]">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
