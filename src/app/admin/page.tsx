'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Users, DollarSign, Activity, Loader2, RefreshCw } from 'lucide-react';

interface StatsData {
  todayDirectTotal: number;
  dailyDirectLimit: number;
  totalUsers: number;
  todayUsers: number;
  todaySpins: number;
  totalRecords: number;
  enabled: boolean;
}

interface RecentRecord {
  id: string;
  username: string;
  tierName: string;
  tierValue: number;
  createdAt: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/lottery/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentRecords(data.recentRecords || []);
      }
    } catch (err) {
      console.error('获取统计失败', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-stone-700">仪表盘</h1>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-xl"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <span className="text-sm font-bold text-stone-500">今日直充</span>
          </div>
          <div className="text-2xl font-black text-stone-700">${stats?.todayDirectTotal?.toFixed(0) || 0}</div>
          <div className="text-xs text-stone-400 mt-1">限额 ${stats?.dailyDirectLimit || 0}</div>
          <div className="mt-2 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((stats?.todayDirectTotal || 0) / (stats?.dailyDirectLimit || 1)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 rounded-xl"><Users className="w-5 h-5 text-indigo-600" /></div>
            <span className="text-sm font-bold text-stone-500">总用户数</span>
          </div>
          <div className="text-2xl font-black text-stone-700">{stats?.totalUsers || 0}</div>
          <div className="text-xs text-stone-400 mt-1">累计参与抽奖用户</div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-xl"><Users className="w-5 h-5 text-blue-600" /></div>
            <span className="text-sm font-bold text-stone-500">今日用户</span>
          </div>
          <div className="text-2xl font-black text-stone-700">{stats?.todayUsers || 0}</div>
          <div className="text-xs text-stone-400 mt-1">参与抽奖人数</div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-100 rounded-xl"><BarChart3 className="w-5 h-5 text-orange-600" /></div>
            <span className="text-sm font-bold text-stone-500">今日抽奖</span>
          </div>
          <div className="text-2xl font-black text-stone-700">{stats?.todaySpins || 0}</div>
          <div className="text-xs text-stone-400 mt-1">总计 {stats?.totalRecords || 0} 条记录</div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-100 rounded-xl"><Activity className="w-5 h-5 text-violet-600" /></div>
            <span className="text-sm font-bold text-stone-500">系统状态</span>
          </div>
          <div className={`text-2xl font-black ${stats?.enabled ? 'text-green-600' : 'text-red-500'}`}>
            {stats?.enabled ? '运行中' : '已关闭'}
          </div>
          <div className="text-xs text-stone-400 mt-1">抽奖开关</div>
        </div>
      </div>

      {/* 最近记录 */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-stone-700 mb-4">最近中奖记录</h2>
        {recentRecords.length === 0 ? (
          <p className="text-stone-400 text-sm py-8 text-center">暂无记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left py-3 px-2 font-bold text-stone-500">用户</th>
                  <th className="text-left py-3 px-2 font-bold text-stone-500">奖品</th>
                  <th className="text-right py-3 px-2 font-bold text-stone-500">金额</th>
                  <th className="text-right py-3 px-2 font-bold text-stone-500">时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => (
                  <tr key={record.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                    <td className="py-3 px-2 font-medium text-stone-700">{record.username}</td>
                    <td className="py-3 px-2 text-stone-600">{record.tierName}</td>
                    <td className="py-3 px-2 text-right font-bold text-green-600">${record.tierValue}</td>
                    <td className="py-3 px-2 text-right text-stone-400 text-xs">
                      {new Date(record.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
