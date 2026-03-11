import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import StockSearch from '../components/StockSearch';
import StockList, { StockItem } from '../components/StockList';
import { TrendingUp, Layers, Zap } from 'lucide-react';
import { useStocks } from '../hooks/useStocks';
import { useAuth } from '../hooks/useAuth';
import { useUserStore } from '../hooks/useUserStore';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { useStockLookup } from '../hooks/useStockLookup';
import TradeModal from '../components/TradeModal';

type MarketFilter = 'ALL' | 'KOSPI' | 'KOSDAQ' | 'ETF' | 'ETN' | 'WATCHLIST' | 'HOLDINGS';
type SortField = 'NAME' | 'PRICE' | 'CHANGE' | 'VOLUME';
type SortDirection = 'ASC' | 'DESC';

const MarketPage: React.FC = () => {
    const { user } = useAuth();
    const { balance, watchlist, holdings } = useUserStore();
    const { stocks } = useStocks();
    const { updatedAt } = useRealtimeData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
    const [filter, setFilter] = useState<MarketFilter>('ALL');
    const [sortField, setSortField] = useState<SortField>('PRICE');
    const [sortDirection, setSortDirection] = useState<SortDirection>('DESC');
    const { lookupStock, isLookingUp, error: lookupError } = useStockLookup();

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortField(field);
            setSortDirection('DESC');
        }
    };

    const filteredStocks = useMemo(() => {
        let result = stocks;

        // 1. Market Filter
        if (filter !== 'ALL') {
            if (filter === 'WATCHLIST') {
                result = result.filter(s => watchlist.includes(s.symbol));
            } else if (filter === 'HOLDINGS') {
                result = result.filter(s => holdings.includes(s.symbol));
            } else {
                result = result.filter(s => s.market === filter);
            }
        }

        // 2. Search Query
        if (searchQuery) {
            const lowQuery = searchQuery.toLowerCase();
            result = result.filter(s =>
                s.name.toLowerCase().includes(lowQuery) ||
                s.symbol.toLowerCase().includes(lowQuery)
            );
        }

        // 3. Sorting
        result = [...result].sort((a, b) => {
            let comparison = 0;
            if (sortField === 'NAME') {
                comparison = a.name.localeCompare(b.name, 'ko-KR');
            } else if (sortField === 'PRICE') {
                comparison = a.price - b.price;
            } else if (sortField === 'CHANGE') {
                comparison = a.changePercent - b.changePercent;
            } else if (sortField === 'VOLUME') {
                comparison = a.volume - b.volume;
            }
            return sortDirection === 'ASC' ? comparison : -comparison;
        });

        return result.slice(0, 100);
    }, [stocks, searchQuery, filter, sortField, sortDirection, watchlist, holdings]);

    const handleSelectStock = (stock: StockItem) => {
        setSelectedStock(stock);
    };

    const handleExternalLookup = async () => {
        if (!searchQuery) return;
        const res = await lookupStock(searchQuery);
        if (res) {
            setSelectedStock(res);
        }
    };

    const isCodeSearchPossible = useMemo(() => {
        return searchQuery.length === 6 && /^\d+$/.test(searchQuery) && filteredStocks.length === 0;
    }, [searchQuery, filteredStocks]);

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <div className="header-with-badge">
                    <h1 className="welcome-text">시세 <span className="highlight">탐색</span></h1>
                    <div className="live-badge">
                        <Zap size={14} className="icon-pulse" />
                        <span>LIVE</span>
                        {updatedAt && <span className="update-time">{new Date(updatedAt).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                    </div>
                </div>
                <p className="subtitle">코스피, 코스닥, 그리고 주요 ETF의 실시간 시세를 확인하세요.</p>
            </header>

            <section className="main-content market-layout">
                <div className="market-sidebar">
                    <Card title="종목 검색" glow="blue" className="search-card">
                        <div className="stock-search-wrapper">
                            <StockSearch onSearch={setSearchQuery} />
                        </div>
                    </Card>

                    <Card title="필터 및 정렬" className="market-stats-card">
                        <div className="filter-section">
                            <span className="filter-label"><Layers size={14} /> 조회 범위</span>
                            <div className="filter-tabs-mini">
                                {(['ALL', 'KOSPI', 'KOSDAQ', 'ETF', 'ETN', 'WATCHLIST', 'HOLDINGS'] as MarketFilter[]).map(f => (
                                    <button
                                        key={f}
                                        className={`filter-btn-mini ${filter === f ? 'active' : ''}`}
                                        onClick={() => setFilter(f)}
                                    >
                                        {f === 'ALL' ? '전체' : (f === 'WATCHLIST' ? '관심종목' : (f === 'HOLDINGS' ? '보유종목' : f))}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="filter-section">
                            <span className="filter-label"><TrendingUp size={14} /> 정렬 기준</span>
                            <div className="filter-tabs-mini">
                                <button
                                    className={`filter-btn-mini ${sortField === 'NAME' ? 'active' : ''}`}
                                    onClick={() => handleSort('NAME')}
                                >종목명 {sortField === 'NAME' && (sortDirection === 'ASC' ? '↑' : '↓')}</button>
                                <button
                                    className={`filter-btn-mini ${sortField === 'PRICE' ? 'active' : ''}`}
                                    onClick={() => handleSort('PRICE')}
                                >현재가 {sortField === 'PRICE' && (sortDirection === 'ASC' ? '↑' : '↓')}</button>
                                <button
                                    className={`filter-btn-mini ${sortField === 'CHANGE' ? 'active' : ''}`}
                                    onClick={() => handleSort('CHANGE')}
                                >전일대비 {sortField === 'CHANGE' && (sortDirection === 'ASC' ? '↑' : '↓')}</button>
                                <button
                                    className={`filter-btn-mini ${sortField === 'VOLUME' ? 'active' : ''}`}
                                    onClick={() => handleSort('VOLUME')}
                                >거래량 {sortField === 'VOLUME' && (sortDirection === 'ASC' ? '↑' : '↓')}</button>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="market-main">
                    <Card
                        title={
                            searchQuery ? `'${searchQuery}' 검색 결과` :
                                filter === 'WATCHLIST' ? '관심종목 시세' :
                                    filter === 'HOLDINGS' ? '보유종목 시세' :
                                        `${filter === 'ALL' ? '실시간' : filter} 시세`
                        }
                        className="stock-list-card full-height"
                    >
                        <StockList stocks={filteredStocks} onSelect={handleSelectStock} />

                        {filteredStocks.length === 0 && searchQuery && (
                            <div className="empty-search-container">
                                <p className="empty-msg">'{searchQuery}'에 대한 검색 결과가 없습니다.</p>
                                {isCodeSearchPossible ? (
                                    <button
                                        className="external-search-btn"
                                        onClick={handleExternalLookup}
                                        disabled={isLookingUp}
                                    >
                                        {isLookingUp ? '조회 중...' : '종목 코드로 외부 시세 조회하기'}
                                    </button>
                                ) : (
                                    <p className="hint-msg">정확한 종목명이나 6자리 종목 코드를 입력해 보세요.</p>
                                )}
                                {lookupError && <p className="error-msg-mini">{lookupError}</p>}
                            </div>
                        )}
                    </Card>
                </div>
            </section>

            {selectedStock && user && (
                <TradeModal
                    stock={selectedStock}
                    onClose={() => setSelectedStock(null)}
                    userBalance={balance}
                    uid={user.uid}
                />
            )}
        </main>
    );
};

export default MarketPage;
