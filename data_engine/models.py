from dataclasses import dataclass, asdict
from datetime import datetime

@dataclass
class Stock:
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    updated_at: datetime
    currency: str = 'KRW'
    market: str = 'KRX'

    def to_dict(self):
        return {
            'symbol': self.symbol,
            'name': self.name,
            'price': self.price,
            'change': self.change,
            'change_percent': self.change_percent,
            'currency': self.currency,
            'market': self.market,
            'updatedAt': self.updated_at
        }

@dataclass
class Transaction:
    uid: str
    symbol: str
    type: str  # 'BUY' or 'SELL'
    price: int
    quantity: int
    amount: int
    fee: int
    timestamp: datetime

    def to_dict(self):
        return {
            'uid': self.uid,
            'symbol': self.symbol,
            'type': self.type,
            'price': self.price,
            'quantity': self.quantity,
            'amount': self.amount,
            'fee': self.fee,
            'timestamp': self.timestamp
        }
