"use client";

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AssetAllocationChartProps {
    cash: number;
    stockValue: number; // This is longStockValue
    shortValue?: number;
    usedCredit?: number; // Debt
}

const COLOR_MAP: Record<string, string> = {
    'Cash': '#10B981',   // Emerald
    'Long': '#3B82F6',   // Blue
    'Short': '#A855F7',  // Purple
    'Debt': '#EF4444',    // Red
};

export default function AssetAllocationChart({ cash, stockValue, shortValue = 0, usedCredit = 0 }: AssetAllocationChartProps) {
    // We want to visualize Asset Distribution and Liabilities.
    // For the pie chart, we can show:
    // 1. Cash (Assets)
    // 2. Long Equity (Portion of Long stocks bought with cash)
    // 3. Long Debt (Portion of Long stocks bought with credit)
    // 4. Short Exposure (Current value of short positions)

    const debtUsedForLong = Math.min(stockValue, usedCredit);
    const longEquity = Math.max(0, stockValue - debtUsedForLong);

    // Remaining debt (if any) could be from short selling margin. 
    // But let's keep it simple for a single pie chart:
    const data = [
        { name: 'Cash', value: cash },
        { name: 'Long', value: longEquity },
        { name: 'Short', value: shortValue },
        { name: 'Debt', value: usedCredit },
    ];

    // Filter out zero values to avoid ugly empty charts
    const activeData = data.filter(d => d.value > 0);

    if (activeData.length === 0) {
        return <div className="text-gray-500 text-center py-10">No assets to display</div>;
    }

    return (
        <div className="w-full h-full min-h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={activeData}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="75%"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ percent }) => percent ? `${(percent * 100).toFixed(0)}%` : ''}
                        labelLine={false}
                    >
                        {activeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLOR_MAP[entry.name]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number) => `${value.toLocaleString()} KRW`}
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                        itemStyle={{ color: '#F3F4F6' }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
