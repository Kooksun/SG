import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    User
} from "firebase/auth";
import { doc, setDoc, serverTimestamp as firestoreTimestamp } from "firebase/firestore";
import { ref, get, set, serverTimestamp as rtdbTimestamp } from "firebase/database";
import { auth, db, rtdb, kospiRtdb, kosdaqRtdb } from "./firebase";
import { tradeService } from "./tradeService";

// 초기 자산 설정 상수
const INITIAL_BALANCE = 300_000_000; // 3억 원

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

    // 사용자 초기 데이터 세팅 (자산 + ETF 매수 요청 + 프롤로그)
    async initializeUserData(user: User, nickname: string) {
        const userRef = doc(db, "users", user.uid);

        let selectedEtfs: any[] = [];
        try {
            // 1. RTDB에서 시세 데이터 가져오기 (KOSPI & KOSDAQ)
            const [kospiSnap, kosdaqSnap] = await Promise.all([
                get(ref(kospiRtdb, 'stocks')),
                get(ref(kosdaqRtdb, 'stocks'))
            ]);

            const allStocks: any[] = [];
            const processSnap = (snap: any) => {
                if (snap.exists()) {
                    const data = snap.val();
                    Object.values(data).forEach((marketData: any) => {
                        if (typeof marketData === 'object' && marketData !== null) {
                            Object.entries(marketData).forEach(([symbol, stockInfo]: [string, any]) => {
                                allStocks.push({
                                    symbol,
                                    name: stockInfo.name,
                                    price: stockInfo.price,
                                    volume: stockInfo.volume || 0,
                                });
                            });
                        }
                    });
                }
            };

            processSnap(kospiSnap);
            processSnap(kosdaqSnap);

            // 2. ETF 종목 필터링
            const etfs = allStocks.filter(s =>
                s.name.includes('KODEX') ||
                s.name.includes('TIGER') ||
                s.name.includes('RISE') ||
                s.name.includes('ACE')
            );

            // 3. 거래량 상위 20개 중 랜덤 3종목 선정
            const topVolumeEtfs = etfs.sort((a, b) => b.volume - a.volume).slice(0, 20);
            const shuffled = [...topVolumeEtfs].sort(() => 0.5 - Math.random());
            selectedEtfs = shuffled.slice(0, 3);
        } catch (error) {
            console.error("Failed to fetch ETF data:", error);
        }

        // 4. 프롤로그 생성 및 사용자 기본 문서 저장 (매수 요청 전에 완료되어야 함)
        const etfNames = selectedEtfs.length > 0
            ? selectedEtfs.map(e => e.name).join(', ')
            : "유망한 종목들";

        const prologueText = `
서기 2026년, 서초동의 어느 활기찬 IT 회사.

특별한 동료인 [[${nickname}]]님, 당신에게 3억 원의 시드머니와 함께 특별한 미션이 부여되었습니다.

전설적인 투자자의 길을 걷게 될 당신을 위해, 시스템은 이미 거래량이 활발한 ETF들({{${etfNames}}})에 투자를 시작했습니다.

이제 당신의 실력을 보여줄 차례입니다.
사내 최고의 자산가가 되어 동료들을 깜짝 놀라게 해주세요!
        `.trim();

        // Firestore에 사용자 먼저 생성
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: nickname,
            balance: INITIAL_BALANCE,
            startingBalance: INITIAL_BALANCE,
            totalStockValue: 0,
            stockCount: 0,
            prologue: prologueText,
            createdAt: firestoreTimestamp(),
            lastLoginAt: firestoreTimestamp(),
            season: 3
        });

        // 5. 매수 요청 생성 (사용자 문서 생성 후 실행)
        if (selectedEtfs.length > 0) {
            const targetAmounts = [80_000_000, 50_000_000, 30_000_000];

            for (let i = 0; i < selectedEtfs.length; i++) {
                const etf = selectedEtfs[i];
                const amount = targetAmounts[i];
                const quantity = Math.floor(amount / etf.price);

                if (quantity > 0) {
                    try {
                        await tradeService.executeTrade({
                            uid: user.uid,
                            symbol: etf.symbol,
                            name: etf.name,
                            type: 'BUY',
                            price: etf.price,
                            quantity: quantity,
                            isWelcomeOrder: true
                        });
                    } catch (err) {
                        console.error(`Auto-buy failed for ${etf.name}:`, err);
                    }
                }
            }
        }

        // 6. 리더보드 즉시 갱신 트리거 (신규 가입 즉시 반영)
        try {
            await set(ref(rtdb, 'commands/updateLeaderboard'), rtdbTimestamp());
        } catch (err) {
            console.error("Failed to trigger leaderboard update:", err);
        }
    }
};
