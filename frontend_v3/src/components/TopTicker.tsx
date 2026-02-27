import React from 'react';
import './TopTicker.css';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useRealtimeData } from '../hooks/useRealtimeData';
import Marquee from 'react-fast-marquee';

const TopTicker: React.FC = () => {
    const { indices, exchangeRate, tickers } = useRealtimeData();

    // 지수 리스트 변환
    const indexList = Object.values(indices);

    // 환율 추가 (KOSPI, KOSDAQ 뒤에)
    const displayIndices = [
        ...indexList,
        { name: 'USD/KRW', price: exchangeRate, change: 0, change_percent: 0 } // 환율은 현재 변동률 미포함 시 0
    ];

    return (
        <div className="ticker-wrapper">
            {/* 시장 지수 바 */}
            <div className="market-indices-bar">
                <Marquee speed={40} autoFill direction="left" className="indices-marquee">
                    {displayIndices.map((idx, i) => (
                        <div key={`${idx.name}-${i}`} className="index-item">
                            <span className="index-name">{idx.name}</span>
                            <span className="index-value">
                                {idx.name === 'USD/KRW' ? idx.price?.toLocaleString() : idx.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {idx.change_percent !== 0 && (
                                <span className={`index-change ${idx.change_percent >= 0 ? 'up' : 'down'}`}>
                                    {idx.change_percent > 0 ? '▲' : (idx.change_percent < 0 ? '▼' : '')}
                                    {Math.abs(idx.change_percent).toFixed(2)}%
                                </span>
                            )}
                        </div>
                    ))}
                </Marquee>
            </div>

            {/* 대형 거래 티커 바 */}
            <div className="trade-ticker-bar">
                {tickers.length > 0 ? (
                    <Marquee speed={70} autoFill direction="left" className="trade-marquee">
                        {tickers.map((trade, index) => (
                            <div key={`${trade.timestamp}-${index}`} className="ticker-item">
                                <span className={`trade-type-badge ${trade.type.toLowerCase()}`}>
                                    {trade.type === 'BUY' ? '매수' : '매도'}
                                </span>
                                <span className="ticker-text">
                                    <strong className="user">{trade.displayName}</strong>님이
                                    <strong className="stock">{trade.name}</strong>
                                    <span className="amount">{(trade.amount / 100000000).toFixed(1)}억</span> 체결
                                    {trade.profitRatio !== undefined && (
                                        <span className={`profit-tag ${trade.profitRatio >= 0 ? 'up' : 'down'}`}>
                                            ({trade.profitRatio >= 0 ? '▲' : '▼'}{Math.abs(trade.profitRatio).toFixed(1)}%)
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </Marquee>
                ) : (
                    <div className="ticker-item placeholder-item">
                        <span className="ticker-text">실시간 대형 거래를 기다리는 중...</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TopTicker;
