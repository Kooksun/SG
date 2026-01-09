"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { X, Play, Pause, FastForward, Rewind, History } from "lucide-react";

interface RankingHistoryEntry {
    recorded_at: string;
    uid: string;
    rank: number;
    total_assets: number;
    comment?: string;
}

interface UserMap {
    [uid: string]: string;
}

export default function RankingHistoryModal({
    isOpen,
    onClose,
    userMap
}: {
    isOpen: boolean;
    onClose: () => void;
    userMap: UserMap;
}) {
    const [history, setHistory] = useState<RankingHistoryEntry[]>([]);
    const [timestamps, setTimestamps] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("user_ranking_history")
            .select("*")
            .order("recorded_at", { ascending: true });

        if (error) {
            console.error("Error fetching ranking history:", error);
        } else if (data) {
            setHistory(data);
            const ts = Array.from(new Set(data.map((h: any) => h.recorded_at)));
            setTimestamps(ts);
            setCurrentIndex(ts.length - 1);
        }
        setLoading(false);
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentIndex((prev) => {
                    if (prev >= timestamps.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000); // 1.0s for a smoother transition feel
        }
        return () => clearInterval(interval);
    }, [isPlaying, timestamps.length]);

    const currentTimestamp = timestamps[currentIndex];

    // Get unique UIDs ever present in the history to maintain stable DOM elements
    const allUserUids = useMemo(() => {
        const uids = new Set<string>();
        history.forEach(h => uids.add(h.uid));
        return Array.from(uids);
    }, [history]);

    // Current rankings for all known users
    const userRankingMap = useMemo(() => {
        const map: Record<string, { rank: number; assets: number; comment?: string }> = {};
        const entries = history.filter((h) => h.recorded_at === currentTimestamp);
        entries.forEach(e => {
            map[e.uid] = { rank: e.rank, assets: e.total_assets, comment: e.comment };
        });
        return map;
    }, [history, currentTimestamp]);

    // Min/Max assets in current frame for dynamic scaling
    const { minAssets, maxAssets } = useMemo(() => {
        const currentFrame = history.filter(h => h.recorded_at === currentTimestamp);
        if (currentFrame.length === 0) return { minAssets: 0, maxAssets: 1 };

        const assets = currentFrame.map(h => h.total_assets);
        const min = Math.min(...assets);
        const max = Math.max(...assets);

        // If all users have the same assets, range will be 0. 
        // We'll handle this in the render logic.
        return { minAssets: min, maxAssets: max };
    }, [history, currentTimestamp]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-gray-900 w-full max-w-3xl rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-gray-800 overflow-hidden flex flex-col h-[600px]">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <History className="text-blue-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">순위 기록 애니메이션</h2>
                            <p className="text-sm text-gray-400 font-mono">
                                {currentTimestamp ? new Date(currentTimestamp).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                }) : "데이터 로딩 중..."}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 p-6 relative bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.05),transparent)] overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-400">데이터를 불러오는 중입니다...</span>
                        </div>
                    ) : allUserUids.length > 0 ? (
                        <div className="relative h-full">
                            {allUserUids.map((uid) => {
                                const data = userRankingMap[uid];
                                // If user is not in the current timestamp, hide them (opactiy 0)
                                const isVisible = !!data;
                                const rank = data?.rank || 11; // Off-screen rank
                                const assets = data?.assets || 0;

                                // Dynamic Scaling: 
                                // Base width is 20%. The remaining 80% is scaled within the [min, max] range.
                                const range = maxAssets - minAssets;
                                let widthPercent = 100;
                                if (range > 0) {
                                    widthPercent = 20 + ((assets - minAssets) / range) * 80;
                                } else if (maxAssets > 0) {
                                    widthPercent = 100; // All same, full width
                                } else {
                                    widthPercent = 0;
                                }

                                return (
                                    <div
                                        key={uid}
                                        className="absolute left-0 right-0 h-12 transition-all duration-700 ease-in-out"
                                        style={{
                                            top: `${(rank - 1) * 52}px`,
                                            opacity: isVisible ? 1 : 0,
                                            transform: isVisible ? 'translateX(0)' : 'translateX(-20px)'
                                        }}
                                    >
                                        <div className="flex items-center h-full gap-3">
                                            <div className="w-12 text-right font-mono text-gray-400 font-bold pr-1">
                                                #{rank}
                                            </div>
                                            <div className="flex-1 relative h-9 bg-gray-800/30 rounded-lg overflow-hidden border border-gray-700/30">
                                                {/* The Bar */}
                                                <div
                                                    className="absolute inset-y-0 left-0 bg-blue-600/50 border-r border-blue-400/50 transition-all duration-700 ease-in-out"
                                                    style={{ width: `${Math.max(1, widthPercent)}%` }}
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-transparent"></div>
                                                </div>

                                                {/* Content Overlay */}
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                    <span className="text-white font-bold text-sm drop-shadow-md truncate max-w-[60%]">
                                                        {userMap[uid] || "Unknown"}
                                                    </span>
                                                    <span className="text-blue-300 font-mono text-xs font-bold whitespace-nowrap drop-shadow-md">
                                                        {assets.toLocaleString()} <span className="text-[10px] opacity-60">KRW</span>
                                                    </span>
                                                </div>

                                                {/* Comment Overlay */}
                                                {isVisible && userRankingMap[uid]?.comment && (
                                                    <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none overflow-hidden">
                                                        <span className="text-white/60 text-s font-medium whitespace-nowrap truncate max-w-full drop-shadow-md">
                                                            {userRankingMap[uid].comment}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Grid lines for context */}
                            <div className="absolute inset-x-[60px] inset-y-0 pointer-events-none flex justify-between border-x border-gray-800/50">
                                <div className="border-l border-gray-800/30 h-full"></div>
                                <div className="border-l border-gray-800/30 h-full"></div>
                                <div className="border-l border-gray-800/30 h-full"></div>
                                <div className="border-l border-gray-800/30 h-full"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <History size={48} className="text-gray-700 mb-4" />
                            <p className="text-gray-400">기록된 순위 데이터가 없습니다.<br />매시간 정각에 데이터가 기록됩니다.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <div className="flex flex-col gap-6">
                        <div className="relative px-2">
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, timestamps.length - 1)}
                                value={currentIndex}
                                onChange={(e) => {
                                    setCurrentIndex(parseInt(e.target.value));
                                    setIsPlaying(false);
                                }}
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                            />
                            <div className="flex justify-between mt-2 text-[10px] text-gray-500 font-mono px-1">
                                <span>{timestamps[0] ? new Date(timestamps[0]).toLocaleDateString() : ""}</span>
                                <span>{timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toLocaleDateString() : ""}</span>
                            </div>
                        </div>

                        <div className="flex justify-center items-center gap-6">
                            <button
                                onClick={() => { setCurrentIndex(0); setIsPlaying(false); }}
                                className="p-2.5 hover:bg-gray-800 rounded-xl text-gray-400 transition-all hover:text-white"
                                title="처음으로"
                            >
                                <Rewind size={22} />
                            </button>
                            <button
                                onClick={() => {
                                    if (!isPlaying && currentIndex >= timestamps.length - 1) {
                                        setCurrentIndex(0);
                                    }
                                    setIsPlaying(!isPlaying);
                                }}
                                disabled={timestamps.length <= 1}
                                className={`p-4 rounded-2xl text-white shadow-xl transition-all transform active:scale-95 ${isPlaying
                                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                            </button>
                            <button
                                onClick={() => { setCurrentIndex(timestamps.length - 1); setIsPlaying(false); }}
                                className="p-2.5 hover:bg-gray-800 rounded-xl text-gray-400 transition-all hover:text-white"
                                title="현재로"
                            >
                                <FastForward size={22} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
