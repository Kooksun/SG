"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Play, Pause, FastForward, Rewind, History } from "lucide-react";

interface RankingHistoryEntry {
    recorded_at: string;
    uid: string;
    rank: number;
    total_assets: number;
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
            }, 800);
        }
        return () => clearInterval(interval);
    }, [isPlaying, timestamps.length]);

    if (!isOpen) return null;

    const currentTimestamp = timestamps[currentIndex];
    const currentRankings = history.filter((h) => h.recorded_at === currentTimestamp)
        .sort((a, b) => a.rank - b.rank);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-gray-900 w-full max-w-2xl rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
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

                <div className="flex-1 overflow-y-auto p-6 relative bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.05),transparent)]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-4">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-400">데이터를 불러오는 중입니다...</span>
                        </div>
                    ) : currentRankings.length > 0 ? (
                        <div className="relative space-y-3">
                            {currentRankings.map((user, idx) => (
                                <div
                                    key={user.uid}
                                    className="flex items-center gap-4 bg-gray-800/40 p-4 rounded-xl border border-gray-700/50 transition-all duration-500 hover:bg-gray-800/60"
                                >
                                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-xl font-bold ${user.rank === 1 ? "bg-yellow-500/20 text-yellow-500" :
                                            user.rank === 2 ? "bg-slate-300/20 text-slate-300" :
                                                user.rank === 3 ? "bg-amber-600/20 text-amber-600" :
                                                    "bg-gray-700/30 text-gray-400"
                                        }`}>
                                        {user.rank}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-white font-semibold text-lg">{userMap[user.uid] || "알 수 없는 사용자"}</div>
                                        <div className="text-sm text-blue-400 font-mono">
                                            {user.total_assets.toLocaleString()} <span className="text-[10px] text-gray-500">KRW</span>
                                        </div>
                                    </div>
                                    {/* Potential for trend indicator if we compare with prev index */}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
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
                                onClick={() => setIsPlaying(!isPlaying)}
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
