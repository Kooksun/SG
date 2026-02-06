import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Plus, Loader2, Wallet, PieChart } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Card from './Card';
import './TradeModal.css';
import { tradeService } from '../lib/tradeService';
import { StockItem } from './StockList';
import StockChart from './StockChart';

interface TradeModalProps {
    stock: StockItem;
    onClose: () => void;
    userBalance: number;
    uid: string;
}

const TradeModal: React.FC<TradeModalProps> = ({ stock, onClose, userBalance, uid }) => {
    const [quantity, setQuantity] = useState<number>(1);
    const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [holdingQty, setHoldingQty] = useState<number>(0);
    const [avgPrice, setAvgPrice] = useState<number>(0);

    // 실시간 보유 수량 감시
    useEffect(() => {
        if (!uid || !stock.symbol) return;
        const portfolioRef = doc(db, 'users', uid, 'portfolio', stock.symbol);
        const unsub = onSnapshot(portfolioRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setHoldingQty(data.quantity || 0);
                setAvgPrice(data.averagePrice || 0);
            } else {
                setHoldingQty(0);
                setAvgPrice(0);
            }
        });
        return () => unsub();
    }, [uid, stock.symbol]);

    const totalAmount = stock.price * quantity;
    const isAffordable = tradeType === 'SELL' ? (holdingQty >= quantity) : (userBalance >= totalAmount);

    // 수익률 계산
    const profitRate = avgPrice > 0 ? ((stock.price - avgPrice) / avgPrice) * 100 : 0;

    const handleTrade = async () => {
        if (quantity <= 0) return;
        setLoading(true);
        setError('');

        try {
            await tradeService.executeTrade({
                uid,
                symbol: stock.symbol,
                name: stock.name,
                type: tradeType,
                price: stock.price,
                quantity: quantity
            });
            onClose();
        } catch (err: any) {
            setError(err.message || '거래 처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handlePercentage = (pct: number) => {
        if (tradeType === 'BUY') {
            const maxBuy = Math.floor(userBalance / stock.price);
            setQuantity(Math.max(1, Math.floor(maxBuy * pct)));
        } else {
            setQuantity(Math.max(0, Math.floor(holdingQty * pct)));
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content wide" onClick={e => e.stopPropagation()}>
                <Card className="trade-card-wide" glow={tradeType === 'BUY' ? 'emerald' : 'rose'}>
                    <div className="wide-layout">
                        {/* 좌측: 차트 섹션 */}
                        <div className="chart-section">
                            <header className="trade-header mobile-only">
                                <div className="stock-info">
                                    <h3>{stock.name}</h3>
                                    <span className="symbol">{stock.symbol}</span>
                                </div>
                                <button className="close-btn" onClick={onClose}><X size={20} /></button>
                            </header>
                            <StockChart symbol={stock.symbol} name={stock.name} />
                            <div className="chart-footer-info">
                                <div className="info-item">
                                    <span className="label">52주 최고</span>
                                    <span className="value">데이터 준비중</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">52주 최저</span>
                                    <span className="value">데이터 준비중</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">거래량</span>
                                    <span className="value">{stock.volume?.toLocaleString() || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* 우측: 매매 섹션 */}
                        <div className="control-section">
                            <header className="trade-header desktop-only">
                                <div className="stock-info">
                                    <div className="title-row">
                                        <h3>{stock.name}</h3>
                                        <span className={`market-badge ${stock.market.toLowerCase()}`}>{stock.market}</span>
                                    </div>
                                    <span className="symbol">{stock.symbol}</span>
                                </div>
                                <button className="close-btn" onClick={onClose}><X size={20} /></button>
                            </header>

                            <div className="price-display-box">
                                <div className="price-main">
                                    <span className="current-price">{stock.price.toLocaleString()}</span>
                                    <span className="unit">원</span>
                                </div>
                                <div className={`price-change ${stock.change >= 0 ? 'up' : 'down'}`}>
                                    {stock.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    <span className="change-val">{Math.abs(stock.change).toLocaleString()}</span>
                                    <span className="change-pct">({stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)</span>
                                </div>
                            </div>

                            <div className="trade-tabs-v2">
                                <button
                                    className={`tab-btn buy ${tradeType === 'BUY' ? 'active' : ''}`}
                                    onClick={() => setTradeType('BUY')}
                                >매수</button>
                                <button
                                    className={`tab-btn sell ${tradeType === 'SELL' ? 'active' : ''}`}
                                    onClick={() => setTradeType('SELL')}
                                >매도</button>
                            </div>

                            <div className="user-asset-info">
                                <div className="info-row">
                                    <span className="label"><Wallet size={14} /> 가용 잔고</span>
                                    <span className="value">{userBalance.toLocaleString()}원</span>
                                </div>
                                <div className="info-row">
                                    <span className="label"><PieChart size={14} /> 보유 수량</span>
                                    <span className="value">{holdingQty.toLocaleString()}주</span>
                                </div>
                                {holdingQty > 0 && (
                                    <div className="info-row highlight">
                                        <span className="label">평균단가 / 수익률</span>
                                        <span className={`value ${profitRate >= 0 ? 'up' : 'down'}`}>
                                            {avgPrice.toLocaleString()}원 ({profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%)
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="order-input-area">
                                <div className="input-label">주문 수량</div>
                                <div className="qty-picker">
                                    <button className="qty-step" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={16} /></button>
                                    <input
                                        type="number"
                                        className="qty-input"
                                        value={quantity}
                                        onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                                    />
                                    <button className="qty-step" onClick={() => setQuantity(q => q + 1)}><Plus size={16} /></button>
                                </div>
                                <div className="preset-buttons">
                                    <button onClick={() => handlePercentage(0.25)}>25%</button>
                                    <button onClick={() => handlePercentage(0.5)}>50%</button>
                                    <button onClick={() => handlePercentage(0.75)}>75%</button>
                                    <button onClick={() => handlePercentage(1)}>MAX</button>
                                </div>
                            </div>

                            <div className="order-summary">
                                <div className="summary-row">
                                    <span>주문 금액</span>
                                    <span className="amount">{totalAmount.toLocaleString()}원</span>
                                </div>
                                <div className="summary-row divider">
                                    <span>주문 후 잔액</span>
                                    <span className={`balance-after ${!isAffordable ? 'error' : ''}`}>
                                        {(tradeType === 'BUY' ? userBalance - totalAmount : userBalance + totalAmount).toLocaleString()}원
                                    </span>
                                </div>
                            </div>

                            {error && <div className="trade-error-msg">{error}</div>}

                            <button
                                className={`trade-submit-btn ${tradeType.toLowerCase()}`}
                                disabled={loading || !isAffordable || quantity <= 0}
                                onClick={handleTrade}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : `${tradeType === 'BUY' ? '매수' : '매도'} 주문하기`}
                            </button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default TradeModal;
