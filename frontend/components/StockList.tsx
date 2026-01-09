"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { Stock } from "@/types";
import TradeModal from "./TradeModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist";

export default function StockList() {
    const { user } = useAuth();
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [watchlist, setWatchlist] = useState<string[]>([]);
    const [filterMode, setFilterMode] = useState<'all' | 'watchlist' | 'holdings'>('all');
    const [userBalance, setUserBalance] = useState(0);
    const [userCreditLimit, setUserCreditLimit] = useState(0);
    const [userUsedCredit, setUserUsedCredit] = useState(0);
    const [portfolio, setPortfolio] = useState<Record<string, number>>({});
    // New UI states
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'price' | 'change' | 'name'>('price');
    const [sortDesc, setSortDesc] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [systemTimes, setSystemTimes] = useState<{
        updatedAt: Date | null;
        stocksUpdatedAt: Date | null;
        indicesUpdatedAt: Date | null;
    }>({ updatedAt: null, stocksUpdatedAt: null, indicesUpdatedAt: null });



    useEffect(() => {
        const stocksRef = ref(rtdb, 'stocks');
        const unsubscribe = onValue(stocksRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                setStocks([]);
                return;
            }

            const stockData: Stock[] = Object.values(data);

            // Client-side sorting
            stockData.sort((a, b) => {
                let valA = a[sortField];
                let valB = b[sortField];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sortDesc ? 1 : -1;
                if (valA > valB) return sortDesc ? -1 : 1;
                return 0;
            });

            // Determine newest update time
            let newest: Date | null = null;
            stockData.forEach(stock => {
                let stockDate: Date | null = null;
                if (stock.updatedAt) {
                    if (typeof stock.updatedAt === 'string') {
                        stockDate = new Date(stock.updatedAt);
                    } else if (typeof stock.updatedAt.toDate === 'function') {
                        stockDate = stock.updatedAt.toDate();
                    }
                }

                if (stockDate && (!newest || stockDate > newest)) {
                    newest = stockDate;
                }
            });

            setStocks(stockData);
            setLastUpdated(newest);
        });

        return () => unsubscribe();
    }, [sortField, sortDesc]);

    useEffect(() => {
        const systemRef = ref(rtdb, 'system');
        const unsubscribe = onValue(systemRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setSystemTimes({
                    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
                    stocksUpdatedAt: data.stocksUpdatedAt ? new Date(data.stocksUpdatedAt) : null,
                    indicesUpdatedAt: data.indicesUpdatedAt ? new Date(data.indicesUpdatedAt) : null
                });
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) {
            setUserBalance(0);
            setUserCreditLimit(0);
            setUserUsedCredit(0);
            setPortfolio({});
            return;
        }
        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setWatchlist(data.watchlist || []);
                setUserBalance(data.balance || 0);
                setUserCreditLimit(data.creditLimit || 0);
                setUserUsedCredit(data.usedCredit || 0);
            }
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching user data in StockList:", error);
            }
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) {
            setPortfolio({});
            return;
        }
        const unsubscribe = onSnapshot(collection(db, "users", user.uid, "portfolio"), (snapshot) => {
            const portfolioMap: Record<string, number> = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                portfolioMap[data.symbol] = data.quantity;
            });
            setPortfolio(portfolioMap);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching portfolio in StockList:", error);
            }
        });
        return () => unsubscribe();
    }, [user]);

    const [activeTab, setActiveTab] = useState<'domestic' | 'overseas'>('domestic');

    // --- Search & Custom Symbol Features ---
    const [isSearchingServer, setIsSearchingServer] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // Listen for search results from server
    useEffect(() => {
        if (!user) return;
        const resultRef = ref(rtdb, `search_results/${user.uid}`);
        const unsubscribe = onValue(resultRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.query === searchTerm) {
                setSearchResults(data.results || []);
                setIsSearchingServer(false);
            }
        });
        return () => unsubscribe();
    }, [user, searchTerm]);

    const triggerServerSearch = async () => {
        if (!user) {
            alert("검색 기능은 로그인 후 이용하실 수 있습니다.");
            return;
        }
        if (!searchTerm.trim()) return;
        setIsSearchingServer(true);
        const requestRef = ref(rtdb, `search_requests/${user.uid}`);
        const { set } = await import("firebase/database");
        await set(requestRef, {
            query: searchTerm,
            status: 'pending',
            requestedAt: new Date().toISOString()
        });
    };

    const handleAddCustomSymbol = async (symbol: string) => {
        if (!user) return;
        const customRef = ref(rtdb, `custom_symbols/${symbol}`);
        const { set } = await import("firebase/database");
        await set(customRef, true);
        alert(`${symbol} 종목이 추가되었습니다. 서버 동기화 주기에 따라 약 5분 뒤부터 리스트에 나타납니다.`);
    };
    // ----------------------------------------

    const toggleWatchlist = async (e: React.MouseEvent, symbol: string) => {
        e.stopPropagation();
        if (!user) return;

        if (watchlist.includes(symbol)) {
            await removeFromWatchlist(user.uid, symbol);
        } else {
            await addToWatchlist(user.uid, symbol);
        }
    };

    const displayedStocks = stocks.filter(s => {
        // Filter by Tab
        const isUS = s.currency === 'USD';
        if (activeTab === 'domestic' && isUS) return false;
        if (activeTab === 'overseas' && !isUS) return false;

        // Filter by Watchlist / Holdings
        if (filterMode === 'watchlist' && !watchlist.includes(s.symbol)) return false;
        if (filterMode === 'holdings' && (portfolio[s.symbol] || 0) === 0) return false;

        return true;
    });

    // Apply search filter (case‑insensitive)
    const filteredStocks = displayedStocks.filter(s =>
        s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSort = (field: 'price' | 'change' | 'name') => {
        if (sortField === field) {
            setSortDesc(!sortDesc);
        } else {
            setSortField(field);
            setSortDesc(true);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            {/* Controls: Search + Last updated */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('domestic')}
                        className={`px-4 py-2 rounded font-bold ${activeTab === 'domestic' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                        국내
                    </button>
                    <button
                        onClick={() => setActiveTab('overseas')}
                        className={`px-4 py-2 rounded font-bold ${activeTab === 'overseas' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                        해외
                    </button>
                </div>
                <div className="flex flex-1 sm:max-w-md gap-2">
                    <input
                        type="text"
                        placeholder="검색 (심볼·이름)"
                        value={searchTerm}
                        onChange={e => {
                            setSearchTerm(e.target.value);
                            setSearchResults([]); // Reset results on new search
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') triggerServerSearch();
                        }}
                        className="px-3 py-2 rounded bg-gray-700 text-white focus:outline-none flex-1"
                    />
                    <button
                        onClick={triggerServerSearch}
                        disabled={isSearchingServer || !searchTerm.trim()}
                        className="bg-blue-600 px-4 py-2 rounded font-semibold disabled:bg-gray-600 hover:bg-blue-700 transition"
                    >
                        {isSearchingServer ? "..." : "검색"}
                    </button>
                </div>
                <div className="text-sm text-gray-400 text-right sm:w-28 leading-tight relative group cursor-help">
                    최종 갱신:<br />
                    <span className="font-mono">
                        {systemTimes.updatedAt ? systemTimes.updatedAt.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                        }) : (lastUpdated ? lastUpdated.toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                        }) : "-")}
                    </span>

                    {/* 상세 갱신 시각 툴팁 */}
                    <div className="absolute right-0 top-full mt-2 w-48 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl hidden group-hover:block z-50 text-xs text-left backdrop-blur-md bg-opacity-95">
                        <div className="font-bold text-blue-400 mb-2 border-b border-gray-700 pb-1">데이터 갱신 상세</div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-gray-500">시스템 전체</span>
                                <span className="text-gray-300 font-mono">
                                    {systemTimes.updatedAt?.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || "-"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-gray-500">종목 데이터</span>
                                <span className="text-gray-300 font-mono">
                                    {(systemTimes.stocksUpdatedAt || lastUpdated)?.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || "-"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-gray-500">환율/지수</span>
                                <span className="text-gray-300 font-mono">
                                    {systemTimes.indicesUpdatedAt?.toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || "-"}
                                </span>
                            </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-800 text-[10px] text-gray-600 italic">
                            * 서버 스케줄러가 1분마다 동기화합니다.
                        </div>
                    </div>
                </div>
            </div>

            {/* Server Search Results Section */}
            {searchTerm.trim() !== "" && (searchResults.length > 0 || isSearchingServer) && (
                <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-blue-900">
                    <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                        전체 종목 검색 결과
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {searchResults.map((res: any) => {
                            const isAlreadyTracked = stocks.some(s => s.symbol === res.symbol);
                            return (
                                <div key={res.symbol} className="bg-gray-800 p-3 rounded flex justify-between items-center border border-gray-700 hover:border-blue-500 transition">
                                    <div className="overflow-hidden">
                                        <div className="text-sm font-bold text-white truncate">{res.name}</div>
                                        <div className="text-xs text-gray-500 flex gap-2">
                                            <span>{res.symbol}</span>
                                            <span className="text-blue-700">{res.market}</span>
                                        </div>
                                    </div>
                                    {isAlreadyTracked ? (
                                        <span className="text-xs text-green-500 font-semibold px-2">추적중</span>
                                    ) : (
                                        <button
                                            onClick={() => handleAddCustomSymbol(res.symbol)}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-bold"
                                        >
                                            추가
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {searchResults.length === 0 && isSearchingServer && (
                        <div className="text-gray-500 text-center py-4">검색중...</div>
                    )}
                    {searchResults.length === 0 && !isSearchingServer && (
                        <div className="text-gray-500 text-center py-4 text-sm">
                            "{searchTerm}"에 대한 검색 결과가 없습니다. 심볼을 정확히 입력해 보세요.
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Market Watch ({activeTab === 'domestic' ? 'KOSPI/KOSDAQ' : 'US Stocks'})</h2>
                <div className="flex gap-2">
                    {user && (
                        <button
                            onClick={() => {
                                setFilterMode(prev => {
                                    if (prev === 'all') return 'watchlist';
                                    if (prev === 'watchlist') return 'holdings';
                                    return 'all';
                                });
                            }}
                            className={`px-3 py-1 rounded text-sm transition-colors ${filterMode === 'all' ? "bg-gray-700 text-gray-300" :
                                filterMode === 'watchlist' ? "bg-yellow-600 text-white" : "bg-emerald-600 text-white"
                                }`}
                        >
                            {filterMode === 'all' ? "Show All" : filterMode === 'watchlist' ? "Watchlist" : "Holdings"}
                        </button>
                    )}
                </div>
            </div>

            {/* Empty Result Helper */}
            {filteredStocks.length === 0 && searchTerm && !isSearchingServer && searchResults.length === 0 && (
                <div className="text-center py-12 bg-gray-900/50 rounded-xl mb-6">
                    <div className="text-4xl mb-4">🔍</div>
                    <div className="text-gray-300 font-semibold mb-2">찾으시는 종목이 목록에 없나요?</div>
                    <p className="text-gray-500 text-sm mb-4">상단 검색 버튼을 눌러 전체 시장에서 검색해 보세요.</p>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2 w-10"></th>
                            <th className="py-2">Symbol</th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('name')}>
                                Name{sortField === 'name' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('price')}>
                                Price{sortField === 'price' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('change')}>
                                Change{sortField === 'change' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStocks.map((stock) => {
                            const isUS = stock.currency === 'USD';
                            const priceDisplay = isUS
                                ? `$${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : `${stock.price.toLocaleString()} KRW`;

                            return (
                                <tr key={stock.symbol} className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer" onClick={() => {
                                    setSelectedStock(stock);
                                    setIsModalOpen(true);
                                }}>
                                    <td className="py-2 text-center">
                                        {user && (
                                            <button
                                                onClick={(e) => toggleWatchlist(e, stock.symbol)}
                                                className={`text-xl ${watchlist.includes(stock.symbol) ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
                                            >
                                                ★
                                            </button>
                                        )}
                                    </td>
                                    <td className="py-2">{stock.symbol}</td>
                                    <td className="py-2">{stock.name}</td>
                                    <td className="py-2">{priceDisplay}</td>
                                    <td className={`py-2 ${stock.change >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                        {stock.change > 0 ? "+" : ""}{stock.change.toLocaleString(undefined, { minimumFractionDigits: isUS ? 2 : 0, maximumFractionDigits: isUS ? 2 : 0 })} ({stock.change_percent.toFixed(2)}%)
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {selectedStock && (
                <TradeModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    stock={selectedStock}
                    balance={userBalance}
                    creditLimit={userCreditLimit}
                    usedCredit={userUsedCredit}
                    holdingQuantity={portfolio[selectedStock.symbol] || 0}
                />
            )}
        </div>
    );
}
