"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import PortfolioTable from "@/components/PortfolioTable";
import TransactionHistory from "@/components/TransactionHistory";
import DashboardOverview from "@/components/DashboardOverview";
import ActiveOrders from "@/components/ActiveOrders";
import MissionModal from "@/components/MissionModal";
import { UserProfile, Stock } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { applyDailyInterestAndAutoLiquidate } from "@/lib/credit";
import { LayoutDashboard, PieChart, History, Coins, Gift, MessageCircle, Save } from "lucide-react";

interface PortfolioItem {
    symbol: string;
    quantity: number;
    averagePrice: number;
}

interface UserDashboardProps {
    uid: string;
}

type Tab = 'overview' | 'portfolio' | 'history' | 'orders';

export default function UserDashboard({ uid }: UserDashboardProps) {
    const { user: currentUser } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});
    const [exchangeRate, setExchangeRate] = useState(1400);
    const [aiStatus, setAiStatus] = useState<'init' | 'idle' | 'pending' | 'processing' | 'completed'>('init');
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [pendingSymbols, setPendingSymbols] = useState<Set<string>>(new Set());
    const [isMissionOpen, setIsMissionOpen] = useState(false);
    const [hasUnclaimed, setHasUnclaimed] = useState(false);
    const [comment, setComment] = useState("");
    const [isSavingComment, setIsSavingComment] = useState(false);
    const interestAppliedRef = useRef(false);

    // Security: Reset to overview if active tab is private and not the owner
    useEffect(() => {
        if (currentUser && currentUser.uid !== uid) {
            if (activeTab === 'history' || activeTab === 'orders') {
                setActiveTab('overview');
            }
        }
    }, [uid, currentUser, activeTab]);

    useEffect(() => {
        const rateRef = ref(rtdb, 'system/exchange_rate');
        const unsubscribe = onValue(rateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setExchangeRate(data);
        });
        return () => unsubscribe();
    }, []);

    // Listen for AI Analysis Request Status
    const [aiSignature, setAiSignature] = useState<string | null>(null);
    useEffect(() => {
        if (!uid) return;
        const aiRef = ref(rtdb, `ai_requests/${uid}`);
        const unsubscribe = onValue(aiRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setAiStatus(data.status);
                setAiSignature(data.portfolioSignature || null);
                if (data.status === 'completed' && data.result) {
                    setAiResult(data.result);
                    setAiTimestamp(data.completedAt);
                }
            } else {
                setAiStatus('idle');
                setAiResult(null);
                setAiTimestamp(null);
                setAiSignature(null);
            }
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(doc(db, "users", uid), (docSnapshot) => {
            if (docSnapshot.exists()) {
                setUserProfile(docSnapshot.data() as UserProfile);
            }
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching user profile in UserDashboard:", error);
            }
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid || !currentUser || currentUser.uid !== uid) return;
        if (interestAppliedRef.current) return;
        interestAppliedRef.current = true;

        const priceMap: Record<string, number> = {};
        Object.entries(stocks).forEach(([symbol, stock]) => {
            if (typeof stock.price === "number") {
                priceMap[symbol] = stock.price;
            }
        });

        void applyDailyInterestAndAutoLiquidate(uid, { priceMap });
    }, [uid, currentUser, stocks]);

    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(collection(db, "users", uid, "portfolio"), (snapshot) => {
            const items: PortfolioItem[] = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                const symbol = data.symbol || docSnapshot.id;
                items.push({
                    symbol: symbol,
                    quantity: data.quantity,
                    averagePrice: data.averagePrice || 0,
                });
            });
            setPortfolio(items);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching portfolio in UserDashboard:", error);
            }
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid || currentUser?.uid !== uid) {
            setPendingSymbols(new Set());
            return;
        }
        const q = query(
            collection(db, "active_orders"),
            where("uid", "==", uid),
            where("status", "==", "PENDING")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const symbols = new Set<string>();
            snapshot.docs.forEach(doc => {
                symbols.add(doc.data().symbol);
            });
            setPendingSymbols(symbols);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching active orders in UserDashboard:", error);
            }
        });
        return () => unsubscribe();
    }, [uid, currentUser]);

    useEffect(() => {
        if (!uid) return;

        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        const unsubscribe = onSnapshot(doc(db, "users", uid, "missions", today), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const missions = docSnapshot.data().missions || [];
                const unclaimed = missions.some((m: any) => m.status === "COMPLETED");
                setHasUnclaimed(unclaimed);
            } else {
                setHasUnclaimed(false);
            }
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching missions in UserDashboard:", error);
            }
        });

        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid) return;
        const commentRef = ref(rtdb, `users/${uid}/comment`);
        const unsubscribe = onValue(commentRef, (snapshot) => {
            if (snapshot.exists()) {
                setComment(snapshot.val());
            } else {
                setComment("");
            }
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        const stocksRef = ref(rtdb, 'stocks');
        const unsubscribe = onValue(stocksRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setStocks(data);
            } else {
                setStocks({});
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!uid || !currentUser || currentUser.uid !== uid || aiStatus === ('init' as any) || aiStatus === 'pending' || aiStatus === 'processing' || portfolio.length === 0) return;

        const currentSignature = [...portfolio]
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map(item => `${item.symbol}:${item.quantity}`)
            .join('|');

        const lastUpdateTime = aiTimestamp ? new Date(aiTimestamp).getTime() : 0;
        const tenMinutesAgo = Date.now() - 600000; // 10 minutes * 60 seconds * 1000ms

        // Auto request if:
        // 1. Signature changed (Portfolio changed)
        // 2. AND Last report is older than 10 minutes
        // 3. AND aiStatus is not init/pending/processing
        if (currentSignature !== aiSignature && lastUpdateTime < tenMinutesAgo) {
            console.log("Automated AI Analysis Refresh triggered (10min cooldown).");
            void handleRequestAiAnalysis();
        }
    }, [uid, portfolio, aiSignature, aiTimestamp, aiStatus]);

    const handleRequestAiAnalysis = async () => {
        if (!uid || !currentUser || currentUser.uid !== uid) return;
        try {
            // Use IMPORT update directly to avoid name collision or misunderstanding
            const { update: rtdbUpdate } = await import("firebase/database");
            await rtdbUpdate(ref(rtdb, `ai_requests/${uid}`), {
                status: 'pending',
                result: null, // Clear previous results to avoid showing error/stale content during generation
                timestamp: Date.now()
            });
        } catch (error) {
            console.error("Failed to request AI analysis:", error);
        }
    };

    const handleSaveComment = async () => {
        if (!uid || currentUser?.uid !== uid) return;
        setIsSavingComment(true);
        try {
            await set(ref(rtdb, `users/${uid}/comment`), comment);
        } catch (error) {
            console.error("Failed to save comment:", error);
        } finally {
            setIsSavingComment(false);
        }
    };

    if (!userProfile) return <div className="text-white p-8">Loading...</div>;

    let longStockValue = 0;
    let shortStockValue = 0;
    let totalShortInitialValue = 0;
    portfolio.forEach((item) => {
        const stock = stocks[item.symbol];
        if (stock) {
            const price = stock.currency === 'USD' ? stock.price * exchangeRate : stock.price;
            if (item.quantity > 0) {
                longStockValue += item.quantity * price;
            } else if (item.quantity < 0) {
                // Short value is the current cost to cover. 
                shortStockValue += Math.abs(item.quantity) * price;
                // Initial value is what was added to usedCredit when shorting
                totalShortInitialValue += Math.abs(item.quantity) * (item.averagePrice || 0);
            }
        }
    });

    const totalAssets = (userProfile.balance - totalShortInitialValue) + longStockValue;

    return (
        <main className="min-h-screen bg-gray-900 text-white">
            <Navbar />
            <div className="container mx-auto p-4 space-y-6">
                {/* Header & Tabs Compact Layout */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-gray-800 p-2 rounded-lg mb-6 shadow-md border border-gray-700">
                    <div className="flex items-center space-x-6 px-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <LayoutDashboard className="text-blue-400" size={24} />
                            {userProfile.displayName}'s Page
                        </h2>

                        <div className="h-6 w-px bg-gray-600 hidden md:block"></div>

                        <div className="flex space-x-1">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'overview'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('portfolio')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'portfolio'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Portfolio
                            </button>
                            {currentUser?.uid === uid && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('history')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history'
                                            ? 'bg-blue-600 text-white shadow'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        History
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('orders')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'orders'
                                            ? 'bg-blue-600 text-white shadow'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        Orders
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="h-6 w-px bg-gray-600 hidden md:block"></div>

                        {/* Comment Section */}
                        <div className="flex-1 flex items-center min-w-[200px] max-w-md">
                            {currentUser?.uid === uid ? (
                                <div className="flex items-center gap-2 w-full bg-gray-900/50 rounded-lg px-3 py-1 border border-gray-700 focus-within:border-blue-500 transition-all">
                                    <MessageCircle size={16} className="text-gray-500 shrink-0" />
                                    <input
                                        type="text"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        onBlur={handleSaveComment}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveComment()}
                                        placeholder="한마디 남기기..."
                                        className="bg-transparent border-none focus:ring-0 text-sm text-gray-300 placeholder:text-gray-600 w-full py-1"
                                    />
                                    {isSavingComment ? (
                                        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
                                    ) : (
                                        <button onClick={handleSaveComment} className="text-gray-500 hover:text-blue-400 transition-colors shrink-0">
                                            <Save size={16} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                comment && (
                                    <div className="flex items-center gap-2 overflow-hidden bg-blue-500/5 rounded-lg px-4 py-1.5 border border-blue-500/20 w-full group">
                                        <MessageCircle size={16} className="text-blue-400 shrink-0" />
                                        <div className="overflow-hidden relative flex-1">
                                            <div className="whitespace-nowrap inline-block animate-marquee-slow hover:pause text-sm text-blue-200/80 font-medium">
                                                {comment}
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Mission & Point Display - Far Right */}
                    <div className="flex items-center gap-2 mr-2">
                        <button
                            onClick={() => setIsMissionOpen(true)}
                            className="relative flex items-center gap-2 px-3 py-2 bg-gray-900/40 hover:bg-gray-800/60 rounded-lg border border-gray-700/50 transition-all group"
                        >
                            <Gift size={18} className={hasUnclaimed ? "text-yellow-400 animate-bounce" : "text-gray-400 group-hover:text-white"} />
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider leading-none">Missions</span>
                                <span className="text-xs font-bold text-gray-300 leading-tight">Daily</span>
                            </div>
                            {hasUnclaimed && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-900 animate-pulse"></span>
                            )}
                        </button>

                        <div className="px-4 py-2 bg-gray-900/40 rounded-lg border border-gray-700/50 flex items-center gap-3">
                            <div className="p-1.5 bg-yellow-500/10 rounded-md">
                                <Coins size={16} className="text-yellow-500" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider leading-none">My Points</span>
                                <span className="text-sm font-black text-yellow-400 leading-tight">
                                    {(userProfile.points || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">P</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="min-h-[500px]">
                    {activeTab === 'overview' && (
                        <DashboardOverview
                            userProfile={userProfile}
                            stockValue={longStockValue}
                            shortValue={shortStockValue}
                            shortInitialValue={totalShortInitialValue}
                            totalAssets={totalAssets}
                            aiStatus={aiStatus}
                            aiResult={aiResult}
                            aiTimestamp={aiTimestamp}
                            onAiRequest={handleRequestAiAnalysis}
                            isOwner={currentUser?.uid === uid}
                        />
                    )}

                    {activeTab === 'portfolio' && (
                        <div className="animate-fade-in">
                            <PortfolioTable
                                uid={uid}
                                realtimeStocks={stocks}
                                isOwner={currentUser?.uid === uid}
                                balance={userProfile.balance}
                                creditLimit={userProfile.creditLimit || 0}
                                usedCredit={userProfile.usedCredit || 0}
                                pendingSymbols={pendingSymbols}
                                onTabChange={setActiveTab}
                            />
                        </div>
                    )}

                    {activeTab === 'history' && currentUser?.uid === uid && (
                        <div className="animate-fade-in">
                            <TransactionHistory uid={uid} stocks={stocks} />
                        </div>
                    )}

                    {activeTab === 'orders' && currentUser?.uid === uid && (
                        <div className="animate-fade-in">
                            <ActiveOrders stocks={stocks} exchangeRate={exchangeRate} />
                        </div>
                    )}
                </div>
            </div>

            <MissionModal
                uid={uid}
                isOpen={isMissionOpen}
                onClose={() => setIsMissionOpen(false)}
                isOwner={currentUser?.uid === uid}
            />
        </main>
    );
}

