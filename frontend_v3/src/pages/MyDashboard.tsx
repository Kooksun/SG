import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import StockSearch from '../components/StockSearch';
import StockList, { StockItem } from '../components/StockList';
import { Wallet, Briefcase, Coins, LogOut } from 'lucide-react';
import { useUserStore } from '../hooks/useUserStore';
import { useStocks } from '../hooks/useStocks';
import { authService } from '../lib/authService';
import { useAuth } from '../hooks/useAuth';
import TradeModal from '../components/TradeModal';

const MyDashboard: React.FC = () => {
    const { user } = useAuth();
    const { nickname, balance, equity, stocks: userStockCount } = useUserStore();
    const { stocks } = useStocks();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);

    const filteredStocks = useMemo(() => {
        if (!searchQuery) return stocks.slice(0, 20);
        return stocks.filter(s =>
            s.name.includes(searchQuery) || s.symbol.includes(searchQuery)
        ).slice(0, 50);
    }, [stocks, searchQuery]);

    const handleSelectStock = (stock: StockItem) => {
        setSelectedStock(stock);
    };

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <div className="header-main">
                    <div className="welcome-info">
                        <h1 className="welcome-text">안녕하세요, <span className="highlight">{nickname}</span>님</h1>
                        <p className="subtitle">오늘의 시장 현황과 자산을 확인해보세요.</p>
                    </div>
                    <button className="logout-btn" onClick={() => authService.signOut()} title="로그아웃">
                        <LogOut size={20} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </header>

            <section className="asset-overview">
                <Card title="자산 총액" glow="blue" className="asset-card">
                    <div className="asset-value">
                        <Wallet className="icon blue" />
                        <div className="value-info">
                            <span className="amount">{equity.toLocaleString()} <small>원</small></span>
                            <span className="change positive">+0.0% (오늘)</span>
                        </div>
                    </div>
                </Card>

                <Card title="가용 현금" glow="emerald" className="asset-card">
                    <div className="asset-value">
                        <Coins className="icon emerald" />
                        <div className="value-info">
                            <span className="amount">{balance.toLocaleString()} <small>원</small></span>
                            <span className="subtitle">즉시 매수 가능</span>
                        </div>
                    </div>
                </Card>

                <Card title="보유 주식" glow="none" className="asset-card">
                    <div className="asset-value">
                        <Briefcase className="icon secondary" />
                        <div className="value-info">
                            <span className="amount">{(equity - balance).toLocaleString()} <small>원</small></span>
                            <span className="subtitle">{userStockCount ?? 0}개 종목</span>
                        </div>
                    </div>
                </Card>
            </section>

            <section className="main-content">
                <Card title="포트폴리오 수익률" className="chart-card">
                    <div className="placeholder-content">차트 영역 (준비 중)</div>
                </Card>

                <Card title="종목 탐색" className="stock-list-card">
                    <div className="stock-search-wrapper">
                        <StockSearch onSearch={setSearchQuery} />
                    </div>
                    <StockList stocks={filteredStocks} onSelect={handleSelectStock} />
                </Card>
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

export default MyDashboard;
