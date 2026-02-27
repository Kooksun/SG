import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import { Trophy, Users, BarChart3, PieChart, Coins, Clock, ArrowUpRight, TrendingUp, Mail, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useUserStore } from '../hooks/useUserStore';
import { useAuth } from '../hooks/useAuth';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, set, onValue } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import './LeaderboardPage.css';

const LeaderboardPage: React.FC = () => {
    const { data, loading } = useLeaderboard();
    const { nickname } = useUserStore();
    const { user } = useAuth();

    const [taxPoints, setTaxPoints] = useState(0);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [actionStatus, setActionStatus] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'FAILED'>('IDLE');
    const [actionMessage, setActionMessage] = useState('');

    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setTaxPoints(docSnap.data().taxPoints || 0);
            }
        });
        return () => unsub();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const reqRef = ref(rtdb, `user_activities/${user.uid}/portfolioRequest`);
        const unsub = onValue(reqRef, (snap) => {
            const val = snap.val();
            if (val) {
                if (val.status === 'SUCCESS') {
                    setActionStatus('SUCCESS');
                    setActionMessage('포트폴리오 리포트가 이메일로 전송되었습니다.');
                } else if (val.status === 'FAILED') {
                    setActionStatus('FAILED');
                    setActionMessage(val.errorMessage || '요청 처리에 실패했습니다.');
                }
            }
        });
        return () => unsub();
    }, [user]);

    const handleRowClick = (clickedUser: any) => {
        if (clickedUser.displayName === nickname) return;
        setSelectedUser(clickedUser);
        setShowModal(true);
        setActionStatus('IDLE');
        setActionMessage('');
    };

    const requestPortfolio = async () => {
        if (!user || !selectedUser) return;
        setActionStatus('PENDING');
        try {
            const reqRef = ref(rtdb, `user_activities/${user.uid}/portfolioRequest`);
            await set(reqRef, {
                status: 'PENDING',
                targetUid: selectedUser.uid,
                targetName: selectedUser.displayName,
                requestedAt: new Date().toISOString()
            });
        } catch (error) {
            setActionStatus('FAILED');
            setActionMessage('요청 서버에 접속할 수 없습니다.');
        }
    };

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
    const seasonEnd = data?.seasonEnd ? new Date(data.seasonEnd) : null;

    // Calculate D-Day
    let dDay = null;
    if (seasonEnd) {
        const now = new Date();
        const diffTime = seasonEnd.getTime() - now.getTime();
        dDay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <div className="header-with-badge">
                    <h1 className="welcome-text">리더보드 & <span className="highlight">통합 분석</span></h1>
                    <div className="live-badge">
                        <Clock size={14} className="icon-pulse" />
                        <span>시즌 3</span>
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
                                {dDay !== null && (
                                    <div className="summary-stat-row highlight-stat">
                                        <div className="stat-label"><Clock size={18} /> 시즌 종료까지</div>
                                        <div className="stat-value d-day-value">D-{dDay > 0 ? dDay : 'Day'}</div>
                                    </div>
                                )}
                                <div className="summary-stat-row">
                                    <div className="stat-label"><Users size={18} /> 총 참가자</div>
                                    <div className="stat-value">{stats?.totalPlayers.toLocaleString()}명</div>
                                </div>
                                <div className="summary-stat-row">
                                    <div className="stat-label"><Coins size={18} /> 총 자산 규모</div>
                                    <div className="stat-value">{(stats?.totalMarketCap ? (stats.totalMarketCap / 100000000).toFixed(1) : '0')}억</div>
                                </div>
                                <div className="summary-stat-row">
                                    <div className="stat-label"><BarChart3 size={18} /> 시장 평균 수익률</div>
                                    <div className={`stat-value ${(stats?.averageYield || 0) >= 0 ? 'up' : 'down'}`}>
                                        {(stats?.averageYield || 0) >= 0 ? '+' : ''}{stats?.averageYield.toFixed(2)}%
                                    </div>
                                </div>
                                <div className="summary-stat-row">
                                    <div className="stat-label"><TrendingUp size={18} /> 시장 심리</div>
                                    <div className={`stat-value ${(stats?.averageYield || 0) >= 0 ? 'up' : 'down'}`}>
                                        {(stats?.averageYield || 0) >= 0 ? '낙관적' : '침체'}
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
                                        {rankings.map((u) => (
                                            <tr
                                                key={u.uid}
                                                className={u.displayName === nickname ? 'highlight-row' : 'clickable-row'}
                                                onClick={() => handleRowClick(u)}
                                            >
                                                <td>
                                                    <div className={`rank-badge ${u.rank <= 3 ? `top-${u.rank}` : ''}`}>
                                                        {u.rank}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="user-cell">
                                                        {u.photoURL && <img src={u.photoURL} alt="" className="user-avatar-mini" />}
                                                        <span className="user-name">{u.displayName}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right font-mono">
                                                    {u.equity >= 100000000
                                                        ? `${(u.equity / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`
                                                        : `${(u.equity / 10000).toLocaleString('ko-KR')}만`
                                                    }
                                                </td>
                                                <td className={`text-right font-mono ${u.yield >= 0 ? 'up' : 'down'}`}>
                                                    {u.yield >= 0 ? '+' : ''}{u.yield.toFixed(1)}%
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
                                {stats?.topYieldingStocks?.map((h: { symbol: string; name: string; yield: number }, idx: number) => (
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

                    {/* 카드 4: 종목 수익률 Worst 10 */}
                    <section className="leaderboard-column">
                        <Card title="종목 수익률 Worst 10" glow="none" className="leaderboard-card fixed-height-card">
                            <div className="top-holdings-list scrollable-content">
                                {stats?.worstYieldingStocks?.map((h: { symbol: string; name: string; yield: number }, idx: number) => (
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
                </div>
            </div>

            {showModal && selectedUser && (
                <div className="portfolio-modal-overlay">
                    <div className="portfolio-modal-content">
                        {actionStatus === 'SUCCESS' ? (
                            <>
                                <CheckCircle2 size={48} className="portfolio-success-icon" />
                                <h3>전송 완료!</h3>
                                <p>{actionMessage}</p>
                                <div className="portfolio-modal-actions">
                                    <button className="btn-confirm" onClick={() => setShowModal(false)}>확인</button>
                                </div>
                            </>
                        ) : actionStatus === 'FAILED' ? (
                            <>
                                <AlertCircle size={48} className="portfolio-error-icon" />
                                <h3>요청 실패</h3>
                                <p>{actionMessage}</p>
                                <div className="portfolio-modal-actions">
                                    <button className="btn-cancel" onClick={() => setShowModal(false)}>닫기</button>
                                    <button className="btn-confirm" onClick={requestPortfolio}>다시 시도</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Mail size={48} className="portfolio-modal-icon" />
                                <h3>포트폴리오 열람 요청</h3>
                                <p>
                                    <strong>{selectedUser.displayName}</strong>님의 포트폴리오를 열람하시겠습니까? <br /><br />
                                    요청 시 <strong>10,000 P</strong>가 소모되며, 상세 포트폴리오 리포트가 이메일로 전송됩니다.
                                </p>

                                <div className={`portfolio-modal-points ${taxPoints < 10000 ? 'insufficient' : ''}`}>
                                    <span>내 포인트</span>
                                    <span>{taxPoints.toLocaleString()} P</span>
                                </div>
                                {taxPoints < 10000 && <p style={{ color: '#f43f5e', fontSize: '0.8rem' }}>포인트가 부족합니다.</p>}

                                <div className="portfolio-modal-actions">
                                    <button
                                        className="btn-cancel"
                                        onClick={() => setShowModal(false)}
                                        disabled={actionStatus === 'PENDING'}
                                    >
                                        취소
                                    </button>
                                    <button
                                        className="btn-confirm"
                                        onClick={requestPortfolio}
                                        disabled={actionStatus === 'PENDING' || taxPoints < 10000}
                                    >
                                        {actionStatus === 'PENDING' ? <><Loader2 size={16} className="animate-spin" /> 요청 중...</> : '10,000 P 사용하기'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
};

export default LeaderboardPage;
