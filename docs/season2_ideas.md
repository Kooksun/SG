# Season 2 Roadmap

## 1. Trading Core Updates (트레이딩 코어)
- [ ] **Short Selling (공매도)**
    - Implement borrowing logic (margin maintenance).
    - Add interest calculation for borrowed stocks.
    - Update `trade_executor.py` to handle selling not-owned stocks.
- [ ] **Limit Orders (지정가 주문)**
    - Create `active_orders` collection in Firestore.
    - Update `scheduler_rtdb.py` to check and execute limit orders every minute.
    - UI for placing limit buy/sell orders.

## 2. Gamification & Content (게임화 및 콘텐츠)
- [ ] **Daily Missions (일일 미션)**
    - System to generate daily random missions (e.g., "Buy 3 different stocks", "Achieve +5% profit").
    - Reward system (bonus seed money or EXP).
- [ ] **Achievements (업적)**
    - Track long-term stats (total trades, max profit, login streak).
    - Badge system on user profile.

## 3. Social Features (소셜)
- [ ] **Guild Management (길드 관리)**
    - Create Guilds (Clan) system.
    - Guild joint fund or average return battles.
    - Guild chat and ranking.

## 4. Maintenance
- [ ] **Season Reset Script** (Completed/Carried Over)
