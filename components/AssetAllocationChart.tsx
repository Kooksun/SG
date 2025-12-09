"use client";

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AssetAllocationChartProps {
    cash: number;
    stockValue: number;
    usedCredit?: number; // Optional, if we want to visualize debt
}

const COLOR_MAP: Record<string, string> = {
    'Cash': '#10B981',   // Emerald
    'Stock Equity': '#3B82F6', // Blue
    'Stock Debt': '#EF4444',   // Red
};

export default function AssetAllocationChart({ cash, stockValue, usedCredit = 0 }: AssetAllocationChartProps) {
    // Calculate components
    const stockDebt = usedCredit;
    const stockEquity = Math.max(0, stockValue - stockDebt);

    // If stock value is less than debt (technically insolvent on stocks), we just show all debt.
    // In reality, debt > stockValue means negative equity, but chart can't show negative.
    // We display 'Stock Debt' up to the Stock Value if insolvent, or full debt if we treat it as liability?
    // Let's stick to the visual: "Portion of Stocks financed by Debt".
    // So Stock Debt = min(stockValue, usedCredit).
    // Remaining Debt is not "Stock Debt", it's just "Debt". But for this chart (Asset Allocation),
    // we are likely visualizing the ASSETS.

    const displayStockDebt = Math.min(stockValue, stockDebt);
    const displayStockEquity = Math.max(0, stockValue - displayStockDebt);

    const data = [
        { name: 'Cash', value: cash },
        { name: 'Stock Equity', value: displayStockEquity },
        { name: 'Stock Debt', value: displayStockDebt },
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
                        innerRadius="60%"
                        outerRadius="80%"
                        paddingAngle={5}
                        dataKey="value"
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
