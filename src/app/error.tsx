'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfcf8] px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl mb-6">
          <AlertCircle className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-stone-700 mb-3">出了点问题</h2>
        <p className="text-stone-500 mb-8">
          页面遇到了一个错误，请尝试刷新页面。如果问题持续存在，请联系管理员。
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
        >
          <RefreshCw className="w-4 h-4" />
          重新加载
        </button>
      </div>
    </div>
  );
}
