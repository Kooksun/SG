import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import Card from './Card';
import { useUserStore } from '../hooks/useUserStore';
import { useDetailedHoldings } from '../hooks/useDetailedHoldings';

const COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#64748b', '#94a3b8'];

interface AssetCompositionChartProps {
    onViewChange: (view: 'leaderboard' | 'market' | 'assets' | 'portfolio' | 'history') => void;
}

const AssetCompositionChart: React.FC<AssetCompositionChartProps> = ({ onViewChange }) => {
    const { uid, balance } = useUserStore();
    const { detailedHoldings } = useDetailedHoldings(uid);

    const chartData = useMemo(() => {
        if (!detailedHoldings) return [];

        const totalStockValue = detailedHoldings.reduce((sum, h) => sum + h.marketValue, 0);

        const data = [
            { name: '현금', value: balance }
        ];

        // Top 5 Holdings
        const top5 = detailedHoldings.slice(0, 5);
        top5.forEach(h => {
            data.push({ name: h.name, value: h.marketValue });
        });

        // Others
        if (detailedHoldings.length > 5) {
            const othersValue = detailedHoldings.slice(5).reduce((sum, h) => sum + h.marketValue, 0);
            data.push({ name: '기타', value: othersValue });
        }

        return data.filter(d => d.value > 0);
    }, [balance, detailedHoldings]);

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip" style={{
                    backgroundColor: 'rgba(22, 27, 34, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '10px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(8px)'
                }}>
                    <p className="label" style={{ color: '#fff', marginBottom: '4px', fontWeight: 600 }}>{payload[0].name}</p>
                    <p className="intro" style={{ color: payload[0].payload.fill || '#fff' }}>
                        {payload[0].value.toLocaleString()}원
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card
            title="자산 구성"
            className="asset-composition-card clickable-card"
            glow="blue"
            onClick={() => onViewChange('portfolio')}
        >
            <div style={{ width: '100%', height: 300 }}>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                formatter={(value) => <span style={{ color: '#8b949e', fontSize: '12px' }}>{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="no-data" style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)'
                    }}>
                        보유 자산이 없습니다.
                    </div>
                )}
            </div>
        </Card>
    );
};

export default AssetCompositionChart;
