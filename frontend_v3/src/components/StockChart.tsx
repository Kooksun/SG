import React, { useEffect, useState } from 'react';
import Chart from 'react-apexcharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { ref, onValue, set, get } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import './StockChart.css';

interface ChartDataPoint {
    x: Date;
    y: [number, number, number, number]; // OHLC
    v: number; // Volume
}

interface StockChartProps {
    symbol: string;
    name: string;
    liveVolume?: number;
}

const StockChart: React.FC<StockChartProps> = ({ symbol, name, liveVolume }) => {
    const [data, setData] = useState<ChartDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);

    useEffect(() => {
        if (!symbol) return;

        let unsubData: () => void;
        let unsubRequest: () => void;

        const startRelayFlow = async () => {
            setLoading(true);
            setError('');

            const requestRef = ref(rtdb, `system/requests/chart/${symbol}`);
            const dataRef = ref(rtdb, `system/data/chart/${symbol}`);

            try {
                // 1. Check if data already exists in RTDB
                const dataSnap = await get(dataRef);
                if (dataSnap.exists()) {
                    const relayData = dataSnap.val();
                    const updatedAt = relayData.updatedAt ? new Date(relayData.updatedAt) : new Date(0);
                    const isToday = updatedAt.toDateString() === new Date().toDateString();

                    // If data exists and is from today, use it immediately
                    if (isToday) {
                        renderChart(relayData.data);
                        return;
                    }
                    // Else, data is stale. Fall through to request fresh data.
                    console.log(`Stale chart data for ${symbol} found (last updated: ${updatedAt.toLocaleString()}), requesting fresh data...`);
                }

                // 2. Data doesn't exist or is stale, request it
                const reqSnap = await get(requestRef);
                if (!reqSnap.exists() || reqSnap.val().status === 'FAILED') {
                    await set(requestRef, {
                        status: 'PENDING',
                        requestedAt: new Date().toISOString()
                    });
                }

                // 3. Listen for data arrival
                unsubData = onValue(dataRef, (snapshot) => {
                    const val = snapshot.val();
                    if (val && val.data) {
                        renderChart(val.data);
                    }
                });

                // 4. Listen for request status (to handle errors)
                unsubRequest = onValue(requestRef, (snapshot) => {
                    const val = snapshot.val();
                    if (val && val.status === 'FAILED') {
                        setError(val.errorMessage || '데이터 수집에 실패했습니다.');
                        setLoading(false);
                    }
                });

            } catch (err: any) {
                console.error('Relay Flow Error:', err);
                setError('서버 연결 중 오류가 발생했습니다.');
                setLoading(false);
            }
        };

        const renderChart = (compressed: any[]) => {
            // Compressed format: [Date, Open, High, Low, Close, Volume]
            const formattedData: ChartDataPoint[] = compressed.map((item: any) => ({
                x: new Date(item[0]),
                y: [item[1], item[2], item[3], item[4]] as [number, number, number, number],
                v: item[5] || 0
            })).reverse(); // Naver is latest first, reverse for ApexCharts

            setData(formattedData);
            setHoveredPoint(formattedData[formattedData.length - 1]); // Set latest as default
            setLoading(false);
        };

        startRelayFlow();

        return () => {
            if (unsubData) unsubData();
            if (unsubRequest) unsubRequest();
        };
    }, [symbol]);

    // Calculate high/low for the period
    const periodHigh = data.length > 0 ? Math.max(...data.map(d => d.y[1])) : 0;
    const periodLow = data.length > 0 ? Math.min(...data.map(d => d.y[2])) : 0;

    // Calculate Moving Averages (SMA)
    const calculateSMA = (period: number) => {
        return data.map((point, index) => {
            if (index < period - 1) return { x: point.x, y: null };
            const sum = data.slice(index - period + 1, index + 1).reduce((acc, p) => acc + p.y[3], 0);
            return { x: point.x, y: Math.round(sum / period) };
        });
    };

    const ma5Data = calculateSMA(5);
    const ma20Data = calculateSMA(20);

    const chartSeries = [
        {
            name: 'candle',
            type: 'candlestick',
            data: data
        },
        {
            name: 'MA 5',
            type: 'line',
            data: ma5Data
        },
        {
            name: 'MA 20',
            type: 'line',
            data: ma20Data
        }
    ];

    const chartOptions: ApexCharts.ApexOptions = {
        chart: {
            type: 'candlestick',
            height: 350,
            toolbar: { show: false },
            background: 'transparent',
            animations: { enabled: false },
            events: {
                mouseMove: (event, chartContext, config) => {
                    if (config.dataPointIndex >= 0) {
                        setHoveredPoint(data[config.dataPointIndex]);
                    }
                },
                mouseLeave: () => {
                    // Optionally reset to latest point
                    if (data.length > 0) setHoveredPoint(data[data.length - 1]);
                }
            }
        },
        theme: { mode: 'dark' },
        stroke: {
            width: [1, 1.2, 1.2],
            curve: 'smooth'
        },
        colors: ['#f43f5e', '#ffca3a', '#a5a5ff'], // Slightly softer colors for MA lines
        xaxis: {
            type: 'datetime',
            labels: {
                style: { colors: 'rgba(255,255,255,0.5)', fontSize: '11px' },
                datetimeFormatter: { month: 'MMM', day: 'dd' }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            tooltip: { enabled: true },
            labels: {
                style: { colors: 'rgba(255,255,255,0.5)', fontSize: '11px' },
                formatter: (val) => val.toLocaleString()
            }
        },
        grid: {
            borderColor: 'rgba(255,255,255,0.05)',
            strokeDashArray: 4
        },
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -10,
            labels: { colors: 'rgba(255,255,255,0.7)' }
        },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#f43f5e', // Red (Korean Market Style)
                    downward: '#3b82f6' // Blue (Korean Market Style)
                },
                wick: { useFillColor: true }
            }
        },
        tooltip: {
            enabled: false // Using external display instead
        }
    };

    if (loading) {
        return (
            <div className="chart-loading">
                <Loader2 className="animate-spin" size={32} />
                <span>서버에서 차트 데이터를 수집 중입니다...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="chart-error">
                <AlertCircle size={32} />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="stock-chart-container">
            <div className="chart-header">
                <div>
                    <span className="chart-title">{name} 히스토리</span>
                    <span className="chart-period">(최근 60회기)</span>
                </div>
            </div>
            <Chart
                options={chartOptions}
                series={chartSeries}
                type="candlestick"
                height={300}
            />
            <div className="chart-footer-v3">
                {/* 1줄: 상시 노출 정보 */}
                <div className="footer-row-v3 primary">
                    <div className="info-group">
                        <span className="label">차트 최고</span>
                        <span className="value up">{periodHigh.toLocaleString()}</span>
                    </div>
                    <div className="info-group">
                        <span className="label">차트 최저</span>
                        <span className="value down">{periodLow.toLocaleString()}</span>
                    </div>
                    <div className="info-group">
                        <span className="label">현재 거래량</span>
                        <span className="value">{(liveVolume || (data.length > 0 ? data[data.length - 1].v : 0)).toLocaleString()}</span>
                    </div>
                </div>
                <br></br>
                {/* 2줄: 호버 시 일자 및 해당 지점 거래량 */}
                <div className="footer-row-v3 detail">
                    <div className="info-group">
                        <span className="label">데이터 일자</span>
                        <span className="value date">{hoveredPoint ? hoveredPoint.x.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '--/--'}</span>
                    </div>
                    <div className="info-group">
                        <span className="label">지점 거래량</span>
                        <span className="value">{hoveredPoint ? hoveredPoint.v.toLocaleString() : '0'}</span>
                    </div>
                </div>

                {/* 3줄: 호버 시 OHLC 상세 */}
                <div className="footer-row-v3 ohlc">
                    {hoveredPoint ? (
                        <div className="ohlc-compact">
                            <span className="label">시</span><span className="value">{hoveredPoint.y[0].toLocaleString()}</span>
                            <span className="divider">|</span>
                            <span className="label">고</span><span className="value up">{hoveredPoint.y[1].toLocaleString()}</span>
                            <span className="divider">|</span>
                            <span className="label">저</span><span className="value down">{hoveredPoint.y[2].toLocaleString()}</span>
                            <span className="divider">|</span>
                            <span className="label">종</span><span className="value">{hoveredPoint.y[3].toLocaleString()}</span>
                        </div>
                    ) : (
                        <div className="ohlc-placeholder">데이터 지점에 커서를 올려 상세 값을 확인하세요.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockChart;
