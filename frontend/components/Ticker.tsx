"use client";

import { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface IndexData {
    name: string;
    symbol: string;
    price: number;
    change: number;
    change_percent: number;
}

export default function Ticker() {
    const [indices, setIndices] = useState<IndexData[]>([]);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);

    useEffect(() => {
        const indicesRef = ref(rtdb, "system/indices");
        const rateRef = ref(rtdb, "system/exchange_rate");

        const unsubIndices = onValue(indicesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setIndices(Object.values(data));
            }
        });

        const unsubRate = onValue(rateRef, (snapshot) => {
            if (snapshot.exists()) {
                setExchangeRate(snapshot.val());
            }
        });

        return () => {
            unsubIndices();
            unsubRate();
        };
    }, []);

    const formatPrice = (val: number, name: string) => {
        if (name === "KOSPI" || name === "KOSDAQ") {
            return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

    const TickerItem = ({ data }: { data: IndexData }) => {
        const isUp = data.change > 0;
        const isDown = data.change < 0;
        const colorClass = isUp ? "text-red-400" : isDown ? "text-blue-400" : "text-gray-400";
        const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

        return (
            <div className="flex items-center gap-2 px-6 whitespace-nowrap border-r border-gray-800/50 last:border-r-0">
                <span className="text-gray-400 font-medium text-xs uppercase tracking-wider">{data.name}</span>
                <span className="font-bold tabular-nums text-sm">{formatPrice(data.price, data.name)}</span>
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${colorClass}`}>
                    <Icon size={12} />
                    <span>{data.change > 0 && "+"}{data.change_percent.toFixed(2)}%</span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 max-w-4xl overflow-hidden relative mx-4 hidden lg:block select-none">
            {/* Gradient Overlays */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-gray-900 to-transparent z-10"></div>
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-gray-900 to-transparent z-10"></div>

            <div className="ticker-container flex items-center h-full animate-marquee hover:pause">
                <div className="flex items-center">
                    {indices.map((idx) => (
                        <TickerItem key={idx.symbol} data={idx} />
                    ))}
                    {exchangeRate && (
                        <div className="flex items-center gap-2 px-6 whitespace-nowrap border-r border-gray-800/50">
                            <span className="text-gray-400 font-medium text-xs tracking-wider">USD/KRW</span>
                            <span className="font-bold tabular-nums text-sm">{exchangeRate?.toLocaleString()}</span>
                        </div>
                    )}
                </div>
                {/* Duplicate for seamless scrolling */}
                <div className="flex items-center">
                    {indices.map((idx) => (
                        <TickerItem key={`${idx.symbol}-dup`} data={idx} />
                    ))}
                    {exchangeRate && (
                        <div className="flex items-center gap-2 px-6 whitespace-nowrap border-r border-gray-800/50">
                            <span className="text-gray-400 font-medium text-xs tracking-wider">USD/KRW</span>
                            <span className="font-bold tabular-nums text-sm">{exchangeRate?.toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .ticker-container {
                    display: flex;
                    width: max-content;
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                }
                .hover\:pause:hover {
                    animation-play-state: paused;
                }
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
}
