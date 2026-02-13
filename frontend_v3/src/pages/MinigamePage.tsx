import React, { useEffect, useState, useRef } from 'react';
import Chart from 'react-apexcharts';
import { Gamepad2, Loader2, Trophy, Coins, RotateCcw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { ref, onValue, set, get, push } from 'firebase/database';
import { doc, onSnapshot } from 'firebase/firestore';
import { rtdb, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import './MinigamePage.css';

interface MinigameSession {
    sessionId: string;
    window: any[];
    status: 'ACTIVE' | 'ROUND_COMPLETED' | 'DECIDING' | 'FINISHED';
    wins: number;
    finalWins?: number;
    securedReward: number;
    lastRoundResult?: {
        isCorrect: boolean;
        userGuess: number;
        answerDirection: number;
        stockName: string;
        date: string;
        ohlc: {
            open: number;
            high: number;
            low: number;
            close: number;
        }
    };
    answer?: {
        name: string;
        date: string;
    };
    lastAnswer?: {
        direction: number;
        name: string;
        date: string;
    };
    reward?: number;
    isSuccess?: boolean;
}

const MinigamePage: React.FC = () => {
    const { user } = useAuth();
    const [session, setSession] = useState<MinigameSession | null>(null);
    const [dailyStats, setDailyStats] = useState({ attempts: 0, lastDate: '' });
    const [taxPoints, setTaxPoints] = useState(0);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [showResultModal, setShowResultModal] = useState(false);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (!user) return;

        // 1. Listen for User Document (Tax Points & Daily Stats)
        const userUnsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setTaxPoints(data.taxPoints || 0);
                setDailyStats(data.minigameStats || { attempts: 0, lastDate: '' });
            }
            setLoading(false);
        }, (err) => {
            console.error('Firestore Read Error:', err);
            setError('데이터를 불러오는데 실패했습니다 (권한 오류).');
            setLoading(false);
        });

        // 2. Listen for Game Session
        const sessionRef = ref(rtdb, `user_activities/${user.uid}/minigameData`);
        const sessionUnsub = onValue(sessionRef, (snapshot) => {
            const data = snapshot.val();
            setSession(data);

            if (data?.lastRoundResult) {
                if (isInitialLoad.current) {
                    if (data.status === 'ROUND_COMPLETED' || data.status === 'DECIDING') {
                        setShowResultModal(true);
                    }
                } else {
                    setShowResultModal(true);
                }
            }
            isInitialLoad.current = false;
        });

        // 3. Listen for Request Status (Errors)
        const requestRef = ref(rtdb, `user_activities/${user.uid}/minigameRequest`);
        const requestUnsub = onValue(requestRef, (snapshot) => {
            const data = snapshot.val();
            if (data?.status === 'FAILED') {
                setError(data.errorMessage || '요청 처리에 실패했습니다.');
            }
        });

        return () => {
            userUnsub();
            sessionUnsub();
            requestUnsub();
        };
    }, [user]);

    const startNewGame = async () => {
        if (!user || actionLoading) return;
        setActionLoading(true);
        setError('');

        try {
            const requestRef = ref(rtdb, `user_activities/${user.uid}/minigameRequest`);
            await set(requestRef, {
                status: 'PENDING',
                requestedAt: new Date().toISOString()
            });
        } catch (err) {
            setError('게임 시작 요청에 실패했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const submitGuess = async (direction: number) => {
        if (!user || !session || actionLoading) return;
        setActionLoading(true);

        try {
            const requestRef = ref(rtdb, `user_activities/${user.uid}/minigameRequest`);
            await set(requestRef, {
                status: 'GUESS_SUBMITTED',
                guess: direction,
                submittedAt: new Date().toISOString()
            });
        } catch (err) {
            setError('추측 제출에 실패했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const requestNextRound = async () => {
        if (!user || !session || actionLoading) return;
        setActionLoading(true);
        setShowResultModal(false);

        try {
            const requestRef = ref(rtdb, `user_activities/${user.uid}/minigameRequest`);
            await set(requestRef, {
                status: 'NEXT_ROUND_PENDING',
                requestedAt: new Date().toISOString()
            });
        } catch (err) {
            setError('다음 라운드 요청에 실패했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const submitDecision = async (decision: 'STOP' | 'CONTINUE') => {
        if (!user || !session || actionLoading) return;
        setActionLoading(true);

        try {
            const requestRef = ref(rtdb, `user_activities/${user.uid}/minigameRequest`);
            await set(requestRef, {
                status: 'DECISION_SUBMITTED',
                decision: decision,
                submittedAt: new Date().toISOString()
            });
        } catch (err) {
            setError('결정 제출에 실패했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const getNextReward = (currentWins: number) => {
        if (currentWins === 0) return 100000;
        if (currentWins === 1) return 300000;
        if (currentWins === 2) return 500000;
        return 500000 + (currentWins - 2) * 100000;
    };

    const calculateMA = (windowData: any[], period: number) => {
        return windowData.map((_, index) => {
            if (index < period - 1) return { x: new Date(windowData[index][0]), y: null };
            let sum = 0;
            for (let i = 0; i < period; i++) {
                sum += windowData[index - i][4]; // Close price
            }
            return { x: new Date(windowData[index][0]), y: Math.round(sum / period) };
        });
    };

    const renderChart = () => {
        if (!session?.window) return null;

        const candlestickData = session.window.map((item: any) => ({
            x: new Date(item[0]),
            y: [item[1], item[2], item[3], item[4]]
        }));

        const ma5Data = calculateMA(session.window, 5);
        const ma20Data = calculateMA(session.window, 20);

        const series = [
            {
                name: '시세',
                type: 'candlestick',
                data: candlestickData
            },
            {
                name: '5일 이평선',
                type: 'line',
                data: ma5Data
            },
            {
                name: '20일 이평선',
                type: 'line',
                data: ma20Data
            }
        ];

        const options: ApexCharts.ApexOptions = {
            chart: {
                type: 'line',
                toolbar: { show: false },
                background: 'transparent',
                animations: { enabled: false },
                sparkline: { enabled: false }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    style: { colors: 'rgba(255,255,255,0.5)', fontSize: '10px' },
                    datetimeFormatter: { month: 'MMM', day: 'dd' }
                }
            },
            yaxis: {
                tooltip: { enabled: true },
                labels: {
                    style: { colors: 'rgba(255,255,255,0.5)', fontSize: '10px' },
                    formatter: (val) => val?.toLocaleString()
                },
                opposite: true
            },
            grid: {
                borderColor: 'rgba(255,255,255,0.05)',
                xaxis: { lines: { show: true } }
            },
            theme: { mode: 'dark' },
            stroke: {
                width: [1, 2, 2],
                curve: ['straight', 'smooth', 'smooth'],
                colors: ['#f43f5e', '#facc15', '#a855f7']
            },
            colors: ['#f43f5e', '#facc15', '#a855f7'],
            plotOptions: {
                candlestick: {
                    colors: { upward: '#f43f5e', downward: '#3b82f6' },
                    wick: { useFillColor: true }
                }
            },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                labels: { colors: 'rgba(255,255,255,0.7)' }
            },
            tooltip: {
                shared: true,
                intersect: false,
                theme: 'dark',
                custom: function ({ seriesIndex, dataPointIndex, w }) {
                    const o = w.globals.seriesCandleO[0][dataPointIndex];
                    const h = w.globals.seriesCandleH[0][dataPointIndex];
                    const l = w.globals.seriesCandleL[0][dataPointIndex];
                    const c = w.globals.seriesCandleC[0][dataPointIndex];

                    const ma5 = w.globals.series[1][dataPointIndex];
                    const ma20 = w.globals.series[2][dataPointIndex];

                    return `
                        <div class="chart-tooltip-mini">
                            <div style="margin-bottom: 5px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 3px;">
                                ${new Date(w.globals.labels[dataPointIndex]).toLocaleDateString()}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <div>시가: ${o?.toLocaleString()}</div>
                                <div style="color: #f43f5e">고가: ${h?.toLocaleString()}</div>
                                <div style="color: #3b82f6">저가: ${l?.toLocaleString()}</div>
                                <div>종가: ${c?.toLocaleString()}</div>
                                ${ma5 ? `<div style="color: #facc15; margin-top: 3px;">MA5: ${ma5.toLocaleString()}</div>` : ''}
                                ${ma20 ? `<div style="color: #a855f7;">MA20: ${ma20.toLocaleString()}</div>` : ''}
                            </div>
                        </div>
                    `;
                }
            }
        };

        return <Chart options={options} series={series} type="line" height={360} />;
    };

    const ResultModal = () => {
        if (!session?.lastRoundResult || !showResultModal) return null;
        const result = session.lastRoundResult;

        return (
            <div className="result-detail-overlay">
                <div className={`result-detail-content ${result.isCorrect ? 'correct' : 'incorrect'}`}>
                    <div className="status-icon">
                        {result.isCorrect ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
                    </div>
                    <h2>{result.isCorrect ? '정답입니다!' : '아쉽게도 틀렸습니다.'}</h2>
                    <p className="round-status-text">
                        {result.isCorrect ? `${session.wins}연승으로 다음 단계에 도전할 수 있습니다.` : '이번 도전은 여기서 종료됩니다.'}
                    </p>

                    <div className="answer-card">
                        <div className="stock-info">
                            <span className="brand">{result.stockName}</span>
                            <span className="date">{result.date}</span>
                            <div className={`direction-badge ${result.answerDirection === 1 ? 'up' : 'down'}`}>
                                {result.answerDirection === 1 ? '상승 마감' : '하락 마감'}
                            </div>
                        </div>
                        <div className="ohlc-grid">
                            <div className="ohlc-item"><span className="label">시가</span><span className="val">{result.ohlc.open.toLocaleString()}</span></div>
                            <div className="ohlc-item"><span className="label">고가</span><span className="val">{result.ohlc.high.toLocaleString()}</span></div>
                            <div className="ohlc-item"><span className="label">저가</span><span className="val">{result.ohlc.low.toLocaleString()}</span></div>
                            <div className="ohlc-item"><span className="label">종가</span><span className="val">{result.ohlc.close.toLocaleString()}</span></div>
                        </div>
                    </div>

                    <div className="modal-actions">
                        {result.isCorrect ? (
                            <button className="next-step-btn" onClick={requestNextRound} disabled={actionLoading}>
                                {actionLoading ? <Loader2 className="animate-spin" /> : '다음 라운드 진행하기'}
                            </button>
                        ) : (
                            <button className="close-result-btn" onClick={() => setShowResultModal(false)} disabled={actionLoading}>
                                결과 확인 및 종료
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="minigame-loading"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="minigame-page">
            <header className="minigame-header">
                <div className="title-area">
                    <h1>캔들 예측 퀴즈</h1>
                    <p>차트를 보고 다음 날 캔들의 방향을 맞춰보세요!</p>
                </div>
                <div className="stats-cards">
                    <div className="stat-card">
                        <span className="label">상태</span>
                        <span className="value" style={{ fontSize: '0.8rem' }}>{session?.status || 'N/A'}</span>
                    </div>
                    <div className="stat-card">
                        <span className="label">보유 포인트</span>
                        <span className="value">{taxPoints.toLocaleString()} P</span>
                    </div>
                    <div className="stat-card">
                        <span className="label">오늘의 도전</span>
                        <span className="value">{dailyStats.attempts} / 2</span>
                    </div>
                </div>
            </header>

            {!session || session.status === 'FINISHED' ? (
                <div className="game-init-area">
                    <div className="minigame-placeholder-card">
                        <div className="icon-badge">
                            <Gamepad2 size={40} />
                        </div>
                        <h2>{session?.status === 'FINISHED' ? '게임 종료!' : '새로운 도전을 시작하세요'}</h2>

                        {session?.status === 'FINISHED' && (
                            <div className="result-summary">
                                <div className={`result-win-badge ${session.isSuccess ? 'win' : 'fail'}`}>
                                    {session.isSuccess ? <CheckCircle2 /> : <RotateCcw />}
                                    <span>{session.finalWins}연승 달성</span>
                                </div>
                                <div className="reward-points">+{session.reward?.toLocaleString()} P</div>
                                {session.lastAnswer && (
                                    <div className="answer-reveal">
                                        마지막 종목: <strong>{session.lastAnswer.name}</strong> ({session.lastAnswer.date})
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="rules-text">
                            3연승 시 50만 포인트를 획득합니다.<br />
                            3연승 이후에는 도전을 계속할지(성공 시 +10만, 실패 시 -5만) 선택할 수 있습니다.
                        </p>

                        <button
                            className="start-btn"
                            onClick={startNewGame}
                            disabled={actionLoading || dailyStats.attempts >= 2}
                        >
                            {actionLoading ? <Loader2 className="animate-spin" /> : '도전하기 (100% 무료)'}
                        </button>
                        {dailyStats.attempts >= 2 && <p className="limit-text">오늘의 도전 횟수를 모두 사용했습니다.</p>}
                    </div>
                </div>
            ) : (
                <div className="game-active-area">
                    <div className="game-main-layout">
                        <div className="game-dashboard-vertical">
                            <div className="board-item secured">
                                <span className="label">확보된 보상</span>
                                <span className="value">{session.securedReward.toLocaleString()} P</span>
                            </div>
                            <div className="board-item wins">
                                <span className="label">현재 연승</span>
                                <span className="value">{session.wins} 연승</span>
                            </div>
                            <div className="board-item next">
                                <span className="label">다음 보상</span>
                                <span className="value">{getNextReward(session.wins).toLocaleString()} P</span>
                            </div>
                        </div>

                        <div className="chart-and-controls">
                            <div className="chart-column">
                                <div className="chart-container-mini">
                                    {renderChart()}
                                    <div className="chart-overlay-text">다음 캔들의 방향은?</div>
                                </div>
                            </div>

                            {session.status === 'ACTIVE' && (
                                <div className="guess-controls-vertical">
                                    <button className="guess-btn up" onClick={() => submitGuess(1)} disabled={actionLoading}>
                                        <div className="btn-icon"><Trophy size={20} /></div>
                                        <div className="btn-text">
                                            <span className="dir">상승 (UP)</span>
                                            <span className="sub">위로 갈 것 같아요</span>
                                        </div>
                                    </button>
                                    <button className="guess-btn down" onClick={() => submitGuess(-1)} disabled={actionLoading}>
                                        <div className="btn-icon"><RotateCcw size={20} /></div>
                                        <div className="btn-text">
                                            <span className="dir">하락 (DOWN)</span>
                                            <span className="sub">아래로 갈 것 같아요</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {session.status === 'DECIDING' && (
                        <div className="decision-overlay">
                            <div className="decision-content">
                                <CheckCircle2 size={48} className="success-icon" />
                                <h3>축하합니다! {session.wins}연승 달성!</h3>
                                <p>여기서 그만두고 {session.securedReward.toLocaleString()}P를 받으시겠습니까,<br />아니면 리스크를 안고 더 큰 보상에 도전하시겠습니까?</p>
                                <div className="decision-btns">
                                    <button className="stop-btn" onClick={() => submitDecision('STOP')} disabled={actionLoading}>
                                        그만하기 (안전하게 적립)
                                    </button>
                                    <button className="continue-btn" onClick={() => submitDecision('CONTINUE')} disabled={actionLoading}>
                                        계속하기 (+10만P 도전)
                                    </button>
                                </div>
                                <p className="risk-warning">※ 계속하기 선택 후 실패 시 50,000 P가 차감됩니다.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {session?.status === 'ROUND_COMPLETED' && <ResultModal />}
            {session?.lastRoundResult && session.status === 'FINISHED' && <ResultModal />}

            {error && <div className="game-error"><AlertCircle size={20} /> {error}</div>}
        </div>
    );
};

export default MinigamePage;
