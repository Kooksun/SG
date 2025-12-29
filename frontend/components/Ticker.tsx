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

        // LED Screen Colors: Bright Green (#00FF41), Bright Red (#FF3131), Bright Yellow (#FFD700)
        const glowColor = isUp ? "rgba(239, 68, 68, 0.6)" : isDown ? "rgba(59, 130, 246, 0.6)" : "rgba(156, 163, 175, 0.6)";
        const textColor = isUp ? "text-red-400" : isDown ? "text-blue-400" : "text-gray-400";
        const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

        return (
            <div className="flex items-center gap-3 px-8 whitespace-nowrap border-x border-gray-900/10">
                <span className="text-gray-500 font-bold text-[15px] tracking-tighter uppercase font-mono">{data.name}</span>
                <span className={`font-black font-mono text-base tabular-nums ${textColor}`} style={{ textShadow: `0 0 8px ${glowColor}` }}>
                    {formatPrice(data.price, data.name)}
                </span>
                <div className={`flex items-center gap-1 text-sm font-bold font-mono ${textColor}`}>
                    <span>{data.change > 0 && "▲"}{data.change < 0 && "▼"}{Math.abs(data.change_percent).toFixed(2)}%</span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 max-w-5xl overflow-hidden relative mx-6 h-9 bg-black/90 border-y border-gray-800/50 shadow-inner flex items-center lg:block hidden">
            {/* LED Mesh Texture Effect */}
            <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.03]"
                style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '3px 3px' }}></div>

            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-10"></div>

            {/* Side Masks for Seamless Look */}
            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/80 to-transparent z-30"></div>
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black/80 to-transparent z-30"></div>

            <div className="ticker-container flex items-center h-full animate-marquee hover:pause">
                <div className="flex items-center">
                    {indices.map((idx) => (
                        <TickerItem key={idx.symbol} data={idx} />
                    ))}
                    {exchangeRate && (
                        <div className="flex items-center gap-3 px-8 whitespace-nowrap border-x border-gray-900/10">
                            <span className="text-gray-500 font-bold text-[15px] tracking-tighter font-mono">USD/KRW</span>
                            <span className="font-black font-mono text-base tabular-nums text-emerald-400" style={{ textShadow: '0 0 8px rgba(52, 211, 153, 0.6)' }}>
                                {exchangeRate.toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
                {/* Duplicate for seamless scrolling */}
                <div className="flex items-center">
                    {indices.map((idx) => (
                        <TickerItem key={`${idx.symbol}-dup`} data={idx} />
                    ))}
                    {exchangeRate && (
                        <div className="flex items-center gap-3 px-8 whitespace-nowrap border-x border-gray-900/10">
                            <span className="text-gray-500 font-bold text-[10px] tracking-tighter font-mono">USD/KRW</span>
                            <span className="font-black font-mono text-base tabular-nums text-emerald-400" style={{ textShadow: '0 0 8px rgba(52, 211, 153, 0.6)' }}>
                                {exchangeRate.toLocaleString()}
                            </span>
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
                    animation: marquee 40s linear infinite;
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
