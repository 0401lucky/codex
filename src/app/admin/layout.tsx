'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (!data.success || !data.user?.isAdmin) {
          router.push('/lottery');
          return;
        }
        setAuthorized(true);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfcf8] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
        <p className="text-stone-400 font-medium">验证权限中...</p>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#fdfcf8]">
      <nav className="sticky top-0 z-40 glass border-b border-white/40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-xl">
                <Shield className="w-5 h-5 text-violet-600" />
              </div>
              <span className="font-black text-stone-700 text-lg">管理后台</span>
            </div>
            <div className="flex items-center gap-2">
              <a href="/admin" className="px-3 py-1.5 text-sm font-bold text-stone-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                仪表盘
              </a>
              <a href="/admin/lottery" className="px-3 py-1.5 text-sm font-bold text-stone-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                抽奖配置
              </a>
              <a href="/lottery" className="px-3 py-1.5 text-sm font-bold text-stone-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                返回抽奖
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
