"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { claimMissionReward } from "@/lib/trade";
import { CheckCircle2, Circle, Gift, X, Loader2 } from "lucide-react";

interface Mission {
    id: string;
    title: string;
    description: string;
    target: number;
    current: number;
    progress: number;
    reward: number;
    status: "IN_PROGRESS" | "COMPLETED" | "CLAIMED";
}

interface MissionModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
    isOwner: boolean;
}

export default function MissionModal({ uid, isOpen, onClose, isOwner }: MissionModalProps) {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !uid) return;

        setLoading(true);
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        const unsubscribe = onSnapshot(doc(db, "users", uid, "missions", today), (docSnapshot) => {
            if (docSnapshot.exists()) {
                setMissions(docSnapshot.data().missions || []);
            } else {
                setMissions([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching missions:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen, uid]);

    const handleClaim = async (missionId: string) => {
        if (!uid || claiming) return;
        setClaiming(missionId);
        try {
            await claimMissionReward(uid, missionId);
        } catch (error: any) {
            alert(error.message || "보상 수령 중 오류가 발생했습니다.");
        } finally {
            setClaiming(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl border border-gray-700 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Gift className="text-yellow-400" size={24} />
                        오늘의 미션
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                            <p>미션을 불러오는 중...</p>
                        </div>
                    ) : missions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 bg-gray-900/20 rounded-xl border border-dashed border-gray-700">
                            <Gift className="opacity-20 mb-4" size={48} />
                            <p>오늘의 미션이 아직 생성되지 않았습니다.<br />잠시 후 다시 확인해주세요!</p>
                        </div>
                    ) : (
                        missions.map((mission) => (
                            <div
                                key={mission.id}
                                className={`p-5 rounded-xl border transition-all duration-300 ${mission.status === "CLAIMED"
                                    ? "bg-gray-900/30 border-gray-800 opacity-60"
                                    : mission.status === "COMPLETED"
                                        ? "bg-blue-900/10 border-blue-500/50"
                                        : "bg-gray-700/30 border-gray-600 hover:border-gray-500"
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${mission.status === "CLAIMED" ? "bg-gray-800" :
                                            mission.status === "COMPLETED" ? "bg-green-500/20" : "bg-blue-500/20"
                                            }`}>
                                            {mission.status === "CLAIMED" || mission.status === "COMPLETED" ? (
                                                <CheckCircle2 className="text-green-400" size={18} />
                                            ) : (
                                                <Circle className="text-blue-400" size={18} />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg leading-none">{mission.title}</h3>
                                            <p className="text-gray-400 text-sm mt-1">{mission.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-yellow-400 font-mono font-black text-sm">
                                            +{mission.reward.toLocaleString()} P
                                        </span>
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">REWARD POINT</span>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-4">
                                    <div className="flex justify-between text-[11px] font-bold tracking-wider">
                                        <span className="text-gray-500 uppercase">Progress</span>
                                        <span className={`${mission.status === "COMPLETED" || mission.status === "CLAIMED" ? "text-green-400" : "text-blue-400"}`}>
                                            {mission.current.toLocaleString()} / {mission.target.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 ease-out ${mission.status === "CLAIMED" ? "bg-gray-700" :
                                                mission.status === "COMPLETED" ? "bg-green-500" : "bg-blue-500"
                                                }`}
                                            style={{ width: `${mission.progress}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {mission.status === "COMPLETED" && (
                                    <button
                                        onClick={() => handleClaim(mission.id)}
                                        disabled={!!claiming || !isOwner}
                                        className="w-full mt-5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-black py-3 rounded-lg transition-all shadow-lg shadow-yellow-500/10 flex items-center justify-center gap-2 text-sm"
                                    >
                                        {claiming === mission.id ? (
                                            <Loader2 className="animate-spin" size={18} />
                                        ) : !isOwner ? (
                                            <>본인만 보상을 받을 수 있습니다</>
                                        ) : (
                                            <>보상 수령하기</>
                                        )}
                                    </button>
                                )}
                                {mission.status === "CLAIMED" && (
                                    <div className="w-full mt-5 bg-gray-800/50 border border-gray-700 text-gray-500 py-2.5 rounded-lg text-center text-xs font-bold flex items-center justify-center gap-2">
                                        <CheckCircle2 size={14} />
                                        수령 완료
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-900/50 text-center text-[10px] text-gray-500 font-medium border-t border-gray-700 tracking-tight">
                    미션은 매일 자정(KST)에 자동으로 갱신됩니다. 보상을 잊지 말고 챙기세요!
                </div>
            </div>
        </div>
    );
}
