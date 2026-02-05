import React, { useState } from 'react';
import Card from '../components/Card';
import { Wallet, Briefcase, Coins, LogOut, History, Clock } from 'lucide-react';
import { useUserStore } from '../hooks/useUserStore';
import { authService } from '../lib/authService';
import { useAuth } from '../hooks/useAuth';

const MyPage: React.FC = () => {
    const { user } = useAuth();
    const { nickname, balance, equity, stocks: userStockCount } = useUserStore();
    const [activeTab, setActiveTab] = useState<'portfolio' | 'history' | 'waitlist'>('portfolio');

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <div className="header-main">
                    <div className="welcome-info">
                        <h1 className="welcome-text">안녕하세요, <span className="highlight">{nickname}</span>님</h1>
                        <p className="subtitle">개인 자산 현황과 거래 내역을 관리하세요.</p>
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

                <Card title="보유 종목" glow="none" className="asset-card">
                    <div className="asset-value">
                        <Briefcase className="icon secondary" />
                        <div className="value-info">
                            <span className="amount">{userStockCount ?? 0} <small>개</small></span>
                            <span className="subtitle">평가 금액: {(equity - balance).toLocaleString()}원</span>
                        </div>
                    </div>
                </Card>
            </section>

            <section className="main-content">
                <div className="mypage-tabs">
                    <button
                        className={`tab-item ${activeTab === 'portfolio' ? 'active' : ''}`}
                        onClick={() => setActiveTab('portfolio')}
                    >
                        <Briefcase size={18} />
                        <span>보유 포트폴리오</span>
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <History size={18} />
                        <span>거래 내역</span>
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'waitlist' ? 'active' : ''}`}
                        onClick={() => setActiveTab('waitlist')}
                    >
                        <Clock size={18} />
                        <span>지정가 대기</span>
                    </button>
                </div>

                <div className="tab-content">
                    {activeTab === 'portfolio' && (
                        <Card title="보유 주식 상세" className="full-width">
                            <div className="placeholder-content">보유 중인 종목 리스트 (준비 중)</div>
                            {/* TODO: 보유 주식 리스트 컴포넌트 추가 */}
                        </Card>
                    )}

                    {activeTab === 'history' && (
                        <Card title="최근 거래 기록" className="full-width">
                            <div className="placeholder-content">최근 매수/매도 내역이 없습니다.</div>
                            {/* TODO: 거래 내역 리스트 컴포넌트 추가 */}
                        </Card>
                    )}

                    {activeTab === 'waitlist' && (
                        <Card title="미체결 주문" className="full-width">
                            <div className="placeholder-content">현재 대기 중인 지정가 주문이 없습니다.</div>
                            {/* TODO: 지정가 대기 목록 컴포넌트 추가 */}
                        </Card>
                    )}
                </div>
            </section>
        </main>
    );
};

export default MyPage;
