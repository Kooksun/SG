import React, { useEffect, useState } from 'react';
import Chart from 'react-apexcharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { ref, onValue, set, get } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import './StockChart.css';

interface ChartDataPoint {
    x: Date;
    y: [number, number, number, number]; // OHLC
}

interface StockChartProps {
    symbol: string;
    name: string;
}

const StockChart: React.FC<StockChartProps> = ({ symbol, name }) => {
    const [data, setData] = useState<ChartDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
                    renderChart(relayData.data);
                    return;
                }

                // 2. Data doesn't exist, request it
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
                y: [item[1], item[2], item[3], item[4]] as [number, number, number, number]
            })).reverse(); // Naver is latest first, reverse for ApexCharts

            setData(formattedData);
            setLoading(false);
        };

        startRelayFlow();

        return () => {
            if (unsubData) unsubData();
            if (unsubRequest) unsubRequest();
        };
    }, [symbol]);

    const chartOptions: ApexCharts.ApexOptions = {
        chart: {
            type: 'candlestick',
            height: 350,
            toolbar: { show: false },
            background: 'transparent',
            animations: { enabled: true }
        },
        theme: { mode: 'dark' },
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
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#10b981', // Emerald
                    downward: '#f43f5e' // Rose
                },
                wick: { useFillColor: true }
            }
        },
        tooltip: {
            theme: 'dark',
            x: { format: 'MMM dd, yyyy' }
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
                <span className="chart-title">{name} 히스토리</span>
                <span className="chart-period">(최근 60회기)</span>
            </div>
            <Chart
                options={chartOptions}
                series={[{ data }]}
                type="candlestick"
                height={300}
            />
        </div>
    );
};

export default StockChart;
