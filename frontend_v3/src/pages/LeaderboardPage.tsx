import React from 'react';
import Card from '../components/Card';
import { Trophy, Users, BarChart3, PieChart, Coins, Clock, ArrowUpRight, TrendingUp } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useUserStore } from '../hooks/useUserStore';
import './LeaderboardPage.css';

const LeaderboardPage: React.FC = () => {
    const { data, loading } = useLeaderboard();
    const { nickname } = useUserStore();

    if (loading || !data) {
        return (
            <main className="dashboard">
                <div className="loading-state">데이터를 분석 중입니다...</div>
            </main>
        );
    }

    const stats = data?.stats;
    const rankings = data?.list || [];
    const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null;

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <div className="header-with-badge">
                    <h1 className="welcome-text">리더보드 & <span className="highlight">통합 분석</span></h1>
                    <div className="live-badge">
                        <Clock size={14} className="icon-pulse" />
                        <span>FINAL</span>
                        {updatedAt && (
                            <span className="update-time-small">
                                {updatedAt.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })} 업데이트
                            </span>
                        )}
                    </div>
                </div>
                <p className="subtitle">전체 참가자들의 투자 현황과 시장의 흐름을 분석한 결과입니다.</p>
            </header>

            <div className="tab-content">
                <div className="leaderboard-grid">
                    {/* 카드 1: 리더보드 요약 정보 */}
                    <section className="leaderboard-column">
                        <Card title="데이터 요약" glow="blue" className="leaderboard-card">
                            <div className="leaderboard-summary">
                                <div className="summary-stat-row">
                                    <div className="stat-label"><Users size={18} /> 총 참가자</div>
                                    <div className="stat-value">{stats?.totalPlayers.toLocaleString()}명</div>
                                </div>
                                <div className="summary-stat-row">
                                    <div className="stat-label"><Coins size={18} /> 총 자산 규모</div>
                                    <div className="stat-value">{(stats?.totalMarketCap ? (stats.totalMarketCap / 100000000).toFixed(1) : '0')}억</div>
                                </div>
                                <div className="summary-stat-row">
                                    <div className="stat-label"><Trophy size={18} /> 나의 순위</div>
                                    <div className="stat-value">
                                        {rankings.find(r => r.displayName === nickname)?.rank || '-'}위
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </section>

                    {/* 카드 2: 수익률 랭킹 리스트 (순서 변경 및 스크롤 적용) */}
                    <section className="leaderboard-column">
                        <Card title="전체 수익률 랭킹" glow="blue" className="leaderboard-card fixed-height-card">
                            <div className="ranking-table-wrapper scrollable-content">
                                <table className="ranking-table">
                                    <thead>
                                        <tr>
                                            <th>순위</th>
                                            <th>투자자</th>
                                            <th className="text-right">총 자산</th>
                                            <th className="text-right">수익률</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankings.map((user) => (
                                            <tr key={user.uid} className={user.displayName === nickname ? 'highlight-row' : ''}>
                                                <td>
                                                    <div className={`rank-badge ${user.rank <= 3 ? `top-${user.rank}` : ''}`}>
                                                        {user.rank}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="user-cell">
                                                        {user.photoURL && <img src={user.photoURL} alt="" className="user-avatar-mini" />}
                                                        <span className="user-name">{user.displayName}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right font-mono">{(user.equity / 10000).toFixed(0)}만</td>
                                                <td className={`text-right font-mono ${user.yield >= 0 ? 'up' : 'down'}`}>
                                                    {user.yield >= 0 ? '+' : ''}{user.yield.toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </section>

                    {/* 카드 3: 종목 수익률 Top 10 (포트폴리오 비중에서 변경) */}
                    <section className="leaderboard-column">
                        <Card title="종목 수익률 Top 10" glow="none" className="leaderboard-card fixed-height-card">
                            <div className="top-holdings-list scrollable-content">
                                {stats?.topYieldingStocks?.map((h, idx) => (
                                    <div key={h.symbol} className="holding-rank-item">
                                        <div className="holding-info">
                                            <span className="holding-rank">{idx + 1}</span>
                                            <span className="holding-name">{h.name}</span>
                                        </div>
                                        <span className={`holding-value font-bold ${h.yield >= 0 ? 'up' : 'down'}`}>
                                            {h.yield >= 0 ? '+' : ''}{h.yield.toFixed(2)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </section>

                    {/* 카드 4: 통합 수익률 (순서 변경) */}
                    <section className="leaderboard-column">
                        <Card title="통합 수익률" glow="emerald" className="leaderboard-card">
                            <div className="yield-display-box">
                                <div className={`avg-yield-value ${(stats?.averageYield || 0) >= 0 ? 'up' : 'down'}`}>
                                    {(stats?.averageYield || 0) >= 0 ? '+' : ''}{stats?.averageYield.toFixed(2)}%
                                </div>
                                <div className="yield-label">시장 투자자 평균 수익률</div>
                                <div className={`asset-pnl-chip ${(stats?.averageYield || 0) >= 0 ? 'up' : 'down'}`}>
                                    <TrendingUp size={14} className={(stats?.averageYield || 0) < 0 ? 'flip-v' : ''} />
                                    <span>시장 심리: {(stats?.averageYield || 0) >= 0 ? '낙관적' : '침체'}</span>
                                </div>
                            </div>
                        </Card>
                    </section>
                </div>
            </div>
        </main>
    );
};

export default LeaderboardPage;
