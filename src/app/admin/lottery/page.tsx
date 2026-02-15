'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Power, PowerOff } from 'lucide-react';

interface LotteryTier {
  id: string;
  name: string;
  value: number;
  probability: number;
  color: string;
}

interface LotteryConfig {
  enabled: boolean;
  dailyDirectLimit: number;
  tiers: LotteryTier[];
}

export default function AdminLotteryPage() {
  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/lottery/config');
      const data = await res.json();
      if (data.success) setConfig(data.config);
    } catch (err) {
      console.error('获取配置失败', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/lottery/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setMessage({ type: 'success', text: '配置已保存' });
      } else {
        setMessage({ type: 'error', text: data.message || '保存失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    const newEnabled = !config.enabled;
    setConfig({ ...config, enabled: newEnabled });

    try {
      const res = await fetch('/api/admin/lottery/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setMessage({ type: 'success', text: newEnabled ? '抽奖已开启' : '抽奖已关闭' });
      }
    } catch {
      setConfig({ ...config, enabled: !newEnabled }); // rollback
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const updateTierProbability = (tierId: string, probability: number) => {
    if (!config) return;
    setConfig({
      ...config,
      tiers: config.tiers.map(t =>
        t.id === tierId ? { ...t, probability: Math.max(0, Math.min(100, probability)) } : t
      ),
    });
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const totalProbability = config.tiers.reduce((sum, t) => sum + t.probability, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-stone-700">抽奖配置</h1>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
              message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {/* 开关和限额 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-stone-700 mb-1">抽奖开关</h3>
              <p className="text-sm text-stone-400">控制抽奖功能的启停</p>
            </div>
            <button
              onClick={handleToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                config.enabled
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              {config.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
              {config.enabled ? '运行中' : '已关闭'}
            </button>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-bold text-stone-700 mb-1">每日直充限额</h3>
          <p className="text-sm text-stone-400 mb-3">每天最多发放的直充总额（美元）</p>
          <div className="flex items-center gap-2">
            <span className="text-stone-500 font-bold">$</span>
            <input
              type="number"
              value={config.dailyDirectLimit}
              onChange={(e) => setConfig({ ...config, dailyDirectLimit: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-700 font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            />
          </div>
        </div>
      </div>

      {/* 档位概率 */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-stone-700 mb-1">档位概率设置</h3>
            <p className="text-sm text-stone-400">调整各档位的中奖概率权重</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${
            totalProbability === 100 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            总权重: {totalProbability}
          </div>
        </div>

        <div className="space-y-4">
          {config.tiers.map((tier) => (
            <div key={tier.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-stone-100">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: tier.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-stone-700 text-sm">{tier.name}</div>
                <div className="text-xs text-stone-400">${tier.value}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tier.probability}
                  onChange={(e) => updateTierProbability(tier.id, Number(e.target.value))}
                  className="w-32 accent-violet-500"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tier.probability}
                  onChange={(e) => updateTierProbability(tier.id, Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-center text-sm font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <span className="text-xs text-stone-400 w-4">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
