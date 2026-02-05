import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Plus, Loader2 } from 'lucide-react';
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

    const totalAmount = stock.price * quantity;
    const isAffordable = tradeType === 'SELL' || userBalance >= totalAmount;

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

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <Card className="trade-card" glow={tradeType === 'BUY' ? 'emerald' : 'rose'}>
                    <header className="trade-header">
                        <div className="stock-info">
                            <h3>{stock.name}</h3>
                            <span className="symbol">{stock.symbol}</span>
                        </div>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </header>

                    <StockChart symbol={stock.symbol} name={stock.name} />

                    <div className="price-section">
                        <div className="current-price">
                            <span className="label">현재가</span>
                            <span className="value">{stock.price.toLocaleString()}원</span>
                        </div>
                        <div className={`change ${stock.change >= 0 ? 'positive' : 'negative'}`}>
                            {stock.change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {stock.changePercent.toFixed(2)}%
                        </div>
                    </div>

                    <div className="trade-tabs">
                        <button
                            className={`tab buy ${tradeType === 'BUY' ? 'active' : ''}`}
                            onClick={() => setTradeType('BUY')}
                        >
                            매수
                        </button>
                        <button
                            className={`tab sell ${tradeType === 'SELL' ? 'active' : ''}`}
                            onClick={() => setTradeType('SELL')}
                        >
                            매도
                        </button>
                    </div>

                    <div className="input-section">
                        <div className="input-group">
                            <label>주문 수량</label>
                            <div className="quantity-control">
                                <button onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={16} /></button>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                />
                                <button onClick={() => setQuantity(q => q + 1)}><Plus size={16} /></button>
                            </div>
                        </div>

                        <div className="summary-group">
                            <div className="summary-item">
                                <span>주문 금액</span>
                                <strong>{totalAmount.toLocaleString()}원</strong>
                            </div>
                            <div className="summary-item">
                                <span>주문 후 잔액</span>
                                <span className={!isAffordable ? 'insufficient' : ''}>
                                    {(tradeType === 'BUY' ? userBalance - totalAmount : userBalance + totalAmount).toLocaleString()}원
                                </span>
                            </div>
                        </div>
                    </div>

                    {error && <div className="trade-error">{error}</div>}

                    <button
                        className={`execute-btn ${tradeType.toLowerCase()}`}
                        disabled={loading || !isAffordable}
                        onClick={handleTrade}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : `${tradeType === 'BUY' ? '매수' : '매도'} 주문`}
                    </button>
                </Card>
            </div>
        </div>
    );
};

export default TradeModal;
