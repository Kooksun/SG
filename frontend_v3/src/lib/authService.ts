import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    User
} from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";

// 초기 자산 설정 상수
const INITIAL_BALANCE = 300_000_000; // 3억 원
const TARGET_INVESTMENT = 200_000_000; // 2억 원 투자 목표

// 추천 ETF 리스트 (시즌 3의 국내 주식/ETF 위주)
const ETF_LIST = [
    { symbol: "069500", name: "KODEX 200" },
    { symbol: "133690", name: "TIGER 미국나스닥100" },
    { symbol: "453810", name: "ACE 미국S&P500" },
    { symbol: "379800", name: "KODEX 미국S&P500TR" },
    { symbol: "229200", name: "KODEX 코스닥150" },
    { symbol: "305720", name: "TIGER 2차전지테마" },
    { symbol: "329200", name: "TIGER 부동산인프라고배당" },
];

export const authService = {
    // 회원가입
    async signUp(email: string, pass: string, nickname: string) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 프로필 업데이트
        await updateProfile(user, { displayName: nickname });

        // 초기 자산 및 프롤로그 설정
        await this.initializeUserData(user, nickname);

        return user;
    },

    // 로그인
    async signIn(email: string, pass: string) {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        return userCredential.user;
    },

    // 로그아웃
    async signOut() {
        await firebaseSignOut(auth);
    },

    // 사용자 초기 데이터 세팅 (자산 + ETF 매수 + 프롤로그)
    async initializeUserData(user: User, nickname: string) {
        const userRef = doc(db, "users", user.uid);

        // 1. 랜덤 ETF 3종 선정
        const shuffled = [...ETF_LIST].sort(() => 0.5 - Math.random());
        const selectedEtfs = shuffled.slice(0, 3);

        // 2. 투자금 배분 (약 2억 원을 3종목에 대략적으로 나눔)
        // 실제 가격을 실시간으로 가져오기 어렵기 때문에, 
        // 여기서는 '평균 매수가'를 가상의 현재가로 설정하여 매수 처리함
        // 실제 가격은 백엔드 엔진이 업데이트해줄 것임
        const investmentPerStock = Math.floor(TARGET_INVESTMENT / selectedEtfs.length);

        // 가상의 현재가 (실제로는 rtdb에서 가져와야 하지만, 초기화 시점에는 가상의 값을 넣고 나중에 엔진이 보정하도록 함)
        // 혹은 간단하게 10,000원~50,000원 사이의 값을 임시로 사용
        const mockPrices: Record<string, number> = {
            "069500": 35000,
            "133690": 110000,
            "453810": 15000,
            "379800": 18000,
            "229200": 12000,
            "305720": 25000,
            "329200": 5500,
        };

        const portfolioItems = selectedEtfs.map(etf => {
            const price = mockPrices[etf.symbol] || 10000;
            const quantity = Math.floor(investmentPerStock / price);
            const actualInvestment = quantity * price;

            return {
                symbol: etf.symbol,
                name: etf.name,
                quantity: quantity,
                averagePrice: price,
                currentPrice: price,
                valuation: actualInvestment,
                updatedAt: serverTimestamp()
            };
        });

        const totalActualInvestment = portfolioItems.reduce((sum, item) => sum + item.valuation, 0);
        const remainingBalance = INITIAL_BALANCE - totalActualInvestment;

        // 3. 프롤로그 생성 (소설 같은 설정)
        const prologueText = `
서기 2026년, 대한민국 금융의 중심 여의도.
당신, ${nickname}은(는) 의문의 초대장과 함께 3억 원의 시드머니를 부여받았습니다.
전설적인 투자자의 길을 걷게 될 당신을 위해, 시스템은 이미 유망한 ETF 3종(${selectedEtfs.map(e => e.name).join(', ')})에 투자를 시작했습니다.
이제 당신의 차례입니다. 시장의 파도를 타고 최고의 자산가가 되어보세요.
        `.trim();

        // 4. Firestore 일괄 작업
        const batch = writeBatch(db);

        // 사용자 기본 문서
        batch.set(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: nickname,
            balance: remainingBalance,
            startingBalance: INITIAL_BALANCE,
            totalStockValue: totalActualInvestment,
            stockCount: portfolioItems.length,
            prologue: prologueText,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            season: 3
        });

        // 포트폴리오 서브 컬렉션
        portfolioItems.forEach(item => {
            const itemRef = doc(collection(db, "users", user.uid, "portfolio"), item.symbol);
            batch.set(itemRef, item);
        });

        await batch.commit();
    }
};
