from dataclasses import dataclass
from datetime import datetime

@dataclass
class Stock:
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    updated_at: datetime
    volume: float = 0
    currency: str = 'KRW'
    market: str = 'KRX'

    def to_dict(self):
        return {
            'symbol': self.symbol,
            'name': self.name,
            'price': self.price,
            'change': self.change,
            'change_percent': self.change_percent,
            'volume': self.volume,
            'currency': self.currency,
            'market': self.market,
            'updatedAt': self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else self.updated_at
        }
