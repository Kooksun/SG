import React, { useEffect, useState, useRef } from 'react';
import Chart from 'react-apexcharts';
import { Gamepad2, Loader2, Trophy, Coins, RotateCcw, AlertCircle, CheckCircle2, XCircle, Gift } from 'lucide-react';
import { ref, onValue, set, get, push } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useUserStore } from '../hooks/useUserStore';
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
    const { taxPoints, minigameStats: dailyStats } = useUserStore();
    const [session, setSession] = useState<MinigameSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [showResultModal, setShowResultModal] = useState(false);

    // Lucky Box States
    const [showLuckyBoxModal, setShowLuckyBoxModal] = useState(false);
    const [luckyBoxStatus, setLuckyBoxStatus] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'FAILED'>('IDLE');
    const [luckyBoxResult, setLuckyBoxResult] = useState<{ name: string, symbol: string } | null>(null);

    const isInitialLoad = useRef(true);

    // Filter attempts by current date (Seoul time) to allow reset appearance
    // Robust date generation for Asia/Seoul
    const seoulDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const y = seoulDate.getFullYear();
    const m = String(seoulDate.getMonth() + 1).padStart(2, '0');
    const d = String(seoulDate.getDate()).padStart(2, '0');
    const todaySeoul = `${y}-${m}-${d}`;

    const currentAttempts = dailyStats.lastDate === todaySeoul ? dailyStats.attempts : 0;

    useEffect(() => {
        if (!user) return;

        // 1. Unified User Document is handled in useUserAsset/App.tsx
        setLoading(false);

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

        // 4. Listen for Lucky Box Status
        const luckyBoxRef = ref(rtdb, `user_activities/${user.uid}/luckyBoxRequest`);
        const luckyBoxUnsub = onValue(luckyBoxRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                if (data.status === 'SUCCESS') {
                    setLuckyBoxStatus('SUCCESS');
                    setLuckyBoxResult({ name: data.rewardName, symbol: data.rewardSymbol });
                } else if (data.status === 'FAILED') {
                    setLuckyBoxStatus('FAILED');
                    setError(data.errorMessage || '럭키박스 구매 처리에 실패했습니다.');
                }
            }
        });

        return () => {
            sessionUnsub();
            requestUnsub();
            luckyBoxUnsub();
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

    const openLuckyBox = async () => {
        if (!user || actionLoading) return;
        setLuckyBoxStatus('PENDING');
        setShowLuckyBoxModal(true);
        setLuckyBoxResult(null);

        try {
            const reqRef = ref(rtdb, `user_activities/${user.uid}/luckyBoxRequest`);
            await set(reqRef, {
                status: 'PENDING',
                requestedAt: new Date().toISOString()
            });
        } catch (err) {
            setLuckyBoxStatus('FAILED');
            setError('럭키박스 요청에 실패했습니다.');
        }
    };

    const closeLuckyBoxModal = () => {
        setShowLuckyBoxModal(false);
        setLuckyBoxStatus('IDLE');
        setLuckyBoxResult(null);
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

                    // Safely parse the date. ApexCharts stores labels as timestamps.
                    const timestamp = w.globals.labels[dataPointIndex];
                    const dateStr = timestamp ? new Date(timestamp).toLocaleDateString() : '날짜 정보 없음';

                    return `
                        <div class="chart-tooltip-mini">
                            <div style="margin-bottom: 5px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 3px;">
                                ${dateStr}
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
                        <div className="mg-stock-info">
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
                    <div className="mg-stat-card">
                        <span className="mg-label">상태</span>
                        <span className="mg-value" style={{ fontSize: '0.8rem' }}>{session?.status || 'N/A'}</span>
                    </div>
                    <div className="mg-stat-card">
                        <span className="mg-label">보유 포인트</span>
                        <span className="mg-value">{taxPoints.toLocaleString()} P</span>
                    </div>
                    <div className="mg-stat-card">
                        <span className="mg-label">오늘의 도전</span>
                        <span className="mg-value">{currentAttempts} / 2</span>
                    </div>
                </div>
            </header>

            {!session || session.status === 'FINISHED' ? (
                <div className="game-init-area">
                    <div className="game-init-grid">
                        {/* 1. Minigame Card */}
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
                                disabled={actionLoading || currentAttempts >= 2}
                            >
                                {actionLoading ? <Loader2 className="animate-spin" /> : '도전하기 (100% 무료)'}
                            </button>
                            {currentAttempts >= 2 && <p className="limit-text">오늘의 도전 횟수를 모두 사용했습니다.</p>}
                        </div>

                        {/* 2. Lucky Box Card */}
                        <div className="luckybox-placeholder-card">
                            <div className="luckybox-icon-badge">
                                <Gift size={40} />
                            </div>
                            <h2>주식 럭키박스</h2>

                            <p className="rules-text" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                <strong>150,000 P</strong>를 사용하여 행운의 주식을 뽑아보세요!<br /><br />
                                <span style={{ fontSize: '0.85rem' }}>KOSPI / KOSDAQ의 무작위 우량주 <strong>1주</strong>가 즉시 포트폴리오(내 잔고)에 지급됩니다.</span>
                            </p>

                            <div style={{ marginTop: 'auto', width: '100%' }}>
                                <button
                                    className="luckybox-btn"
                                    onClick={() => setShowLuckyBoxModal(true)}
                                    // onClick={() => openLuckyBox()} // Will do this from modal
                                    disabled={actionLoading || taxPoints < 150000}
                                >
                                    {taxPoints < 150000 ? '포인트 부족' : '150,000 P로 뽑기'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="game-active-area">
                    <div className="game-main-layout">
                        <div className="game-dashboard-vertical">
                            <div className="mg-board-item secured">
                                <span className="mg-label">확보된 보상</span>
                                <span className="mg-value">{session.securedReward.toLocaleString()} P</span>
                            </div>
                            <div className="mg-board-item wins">
                                <span className="mg-label">현재 연승</span>
                                <span className="mg-value">{session.wins} 연승</span>
                            </div>
                            <div className="mg-board-item next">
                                <span className="mg-label">다음 보상</span>
                                <span className="mg-value">{getNextReward(session.wins).toLocaleString()} P</span>
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

            {showLuckyBoxModal && (
                <div className="portfolio-modal-overlay">
                    <div className="portfolio-modal-content">
                        {luckyBoxStatus === 'SUCCESS' && luckyBoxResult ? (
                            <>
                                <Gift size={56} className="luckybox-success-icon" />
                                <h3>축하합니다!</h3>
                                <p>럭키박스에서 다음 주식을 획득했습니다.</p>

                                <div className="luckybox-result-symbol">{luckyBoxResult.symbol}</div>
                                <div className="luckybox-result-name">{luckyBoxResult.name} 1주</div>

                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                    해당 주식이 포트폴리오에 성공적으로 추가되었습니다.
                                </p>

                                <div className="portfolio-modal-actions">
                                    <button className="btn-confirm" onClick={closeLuckyBoxModal}>수령 확인</button>
                                </div>
                            </>
                        ) : luckyBoxStatus === 'FAILED' ? (
                            <>
                                <AlertCircle size={48} className="portfolio-error-icon" />
                                <h3>뽑기 실패</h3>
                                <p>{error || '서버 오류가 발생했습니다.'}</p>
                                <div className="portfolio-modal-actions">
                                    <button className="btn-cancel" onClick={closeLuckyBoxModal}>닫기</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Gift size={48} className="portfolio-modal-icon" style={{ color: '#facc15', background: 'rgba(250,204,21,0.1)' }} />
                                <h3>주식 럭키박스 열기</h3>
                                <p>
                                    <strong>100,000 P</strong>를 사용하여 럭키박스를 엽니다.<br />
                                    지급되는 주식은 무작위이며 반품은 불가능합니다!
                                </p>

                                <div className={`portfolio-modal-points ${taxPoints < 150000 ? 'insufficient' : ''}`}>
                                    <span>현재 보유 포인트</span>
                                    <span>{taxPoints.toLocaleString()} P</span>
                                </div>
                                {taxPoints < 150000 && <p style={{ color: '#f43f5e', fontSize: '0.8rem' }}>포인트가 부족합니다.</p>}

                                <div className="portfolio-modal-actions">
                                    <button
                                        className="btn-cancel"
                                        onClick={closeLuckyBoxModal}
                                        disabled={luckyBoxStatus === 'PENDING'}
                                    >
                                        취소
                                    </button>
                                    <button
                                        className="btn-confirm"
                                        style={{ background: '#f59e0b' }}
                                        onClick={openLuckyBox}
                                        disabled={luckyBoxStatus === 'PENDING' || taxPoints < 150000}
                                    >
                                        {luckyBoxStatus === 'PENDING' ? <><Loader2 size={16} className="animate-spin" /> 개봉 중...</> : '열기 (15만 P)'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {error && !showLuckyBoxModal && <div className="game-error"><AlertCircle size={20} /> {error}</div>}
        </div>
    );
};

export default MinigamePage;
