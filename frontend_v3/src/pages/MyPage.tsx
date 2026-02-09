import React, { useState } from 'react';
import Card from '../components/Card';
import { LogOut, Wallet, TrendingUp, Briefcase, CircleDollarSign, User, History, PieChart as PieIcon } from 'lucide-react';
import { useUserStore } from '../hooks/useUserStore';
import { authService } from '../lib/authService';
import { useAuth } from '../hooks/useAuth';
import AssetCompositionChart from '../components/AssetCompositionChart';
import PortfolioTable from '../components/PortfolioTable';
import TradeHistoryTable from '../components/TradeHistoryTable';
import { useDetailedHoldings } from '../hooks/useDetailedHoldings';
import { useTradeHistory } from '../hooks/useTradeHistory';
import './MyPage.css';

type TabType = 'assets' | 'portfolio' | 'history';

const MyPage: React.FC = () => {
    const { user } = useAuth();
    const { nickname, balance, equity, totalPnl, pnlRate, uid } = useUserStore();
    const [activeTab, setActiveTab] = useState<TabType>('assets');

    const { detailedHoldings } = useDetailedHoldings(uid);
    const { history } = useTradeHistory(uid);

    const stockValue = equity - balance;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'assets':
                return (
                    <div className="mypage-content-grid">
                        {/* 1열: 자산 정보 */}
                        <section className="mypage-column">
                            <Card title="자산 현황" className="unified-asset-card" glow="blue">
                                <div className="asset-summary-content">
                                    <div className="asset-primary-value">
                                        <div className="value-row">
                                            <span className="amount">{equity.toLocaleString()}</span>
                                            <span className="unit">원</span>
                                        </div>
                                        <div className={`asset-pnl-chip ${totalPnl >= 0 ? 'up' : 'down'}`}>
                                            {totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingUp size={14} className="flip-v" />}
                                            <span>
                                                {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}% ({totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}원)
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="asset-divider" />

                                <div className="asset-details-rows">
                                    <div className="asset-row">
                                        <div className="row-label">
                                            <CircleDollarSign size={18} className="cash-icon" />
                                            <span>보유 현금</span>
                                        </div>
                                        <span className="row-value">{balance.toLocaleString()}원</span>
                                    </div>
                                    <div className="asset-row">
                                        <div className="row-label">
                                            <Briefcase size={18} className="stock-icon" />
                                            <span>주식 평가금</span>
                                        </div>
                                        <span className="row-value">{stockValue.toLocaleString()}원</span>
                                    </div>
                                </div>
                            </Card>
                        </section>

                        {/* 2열: 포트폴리오 차트 */}
                        <section className="mypage-column">
                            <AssetCompositionChart />
                        </section>
                    </div>
                );
            case 'portfolio':
                return <PortfolioTable holdings={detailedHoldings} />;
            case 'history':
                return <TradeHistoryTable history={history} />;
            default:
                return null;
        }
    };

    return (
        <main className="dashboard my-page">
            <header className="dashboard-header">
                <div className="header-main">
                    <div className="welcome-info">
                        <div className="user-badge">
                            <User size={16} />
                            <span>Investor</span>
                        </div>
                        <h1 className="welcome-text">안녕하세요, <span className="highlight">{nickname}</span>님</h1>
                        <p className="subtitle">자산 현황을 한눈에 확인하고 전략을 세워보세요.</p>
                    </div>
                    <button className="logout-btn" onClick={() => authService.signOut()} title="로그아웃">
                        <LogOut size={18} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </header>

            <nav className="mypage-tabs">
                <button
                    className={`tab-item ${activeTab === 'assets' ? 'active' : ''}`}
                    onClick={() => setActiveTab('assets')}
                >
                    <PieIcon size={18} />
                    <span>자산</span>
                </button>
                <button
                    className={`tab-item ${activeTab === 'portfolio' ? 'active' : ''}`}
                    onClick={() => setActiveTab('portfolio')}
                >
                    <Briefcase size={18} />
                    <span>포트폴리오</span>
                </button>
                <button
                    className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <History size={18} />
                    <span>거래내역</span>
                </button>
            </nav>

            <div className="tab-content">
                {renderTabContent()}
            </div>
        </main>
    );
};

export default MyPage;
