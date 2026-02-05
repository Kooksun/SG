import React, { useEffect, useState } from 'react';
import Chart from 'react-apexcharts';
import { Loader2, AlertCircle } from 'lucide-react';
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
        const fetchChartData = async () => {
            setLoading(true);
            setError('');
            try {
                // allorigins 프록시 사용 (CORS 우회)
                // 최근 60일 데이터 (pageSize=60)
                const targetUrl = `https://m.stock.naver.com/api/stock/${symbol}/price?pageSize=60&page=1`;
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

                const response = await fetch(proxyUrl);
                const rawData = await response.json();
                const jsonContent = JSON.parse(rawData.contents);

                if (!Array.isArray(jsonContent) || jsonContent.length === 0) {
                    throw new Error('차트 데이터를 불러올 수 없습니다.');
                }

                const formattedData: ChartDataPoint[] = jsonContent.map((item: any) => ({
                    x: new Date(item.localTradedAt.substring(0, 10)),
                    y: [
                        parseInt(item.openPrice.replace(/,/g, '')),
                        parseInt(item.highPrice.replace(/,/g, '')),
                        parseInt(item.lowPrice.replace(/,/g, '')),
                        parseInt(item.closePrice.replace(/,/g, ''))
                    ]
                })).reverse(); // 네이버는 최신순이므로 역순 정렬

                setData(formattedData);
            } catch (err: any) {
                console.error('Chart Fetch Error:', err);
                setError('차트 정보를 불러오는 데 실패했습니다.');
            } finally {
                setLoading(false);
            }
        };

        if (symbol) {
            fetchChartData();
        }
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
                <span>데이터를 불러오는 중...</span>
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
