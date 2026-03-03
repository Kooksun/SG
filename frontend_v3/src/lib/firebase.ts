import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// 메인 프로젝트 (Auth, Firestore, 메인 RTDB)
const mainConfig = {
    apiKey: "AIzaSyBEwZPwQ4HKpt7LMr3Hk2DLokAbWSc8xT0",
    authDomain: "kooksun-stock-main.firebaseapp.com",
    projectId: "kooksun-stock-main",
    storageBucket: "kooksun-stock-main.firebasestorage.app",
    messagingSenderId: "396650374766",
    appId: "1:396650374766:web:d999ffc0d54dbf8683e87f",
    measurementId: "G-34Q4FR4FYG",
    databaseURL: "https://kooksun-stock-main-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// 코스피 프로젝트 (시세)
const kospiConfig = {
    apiKey: "AIzaSyBV2hrh609cuy3u7hQ4T38oiMgKpx6yuuk",
    authDomain: "kooksun-stock-kospi.firebaseapp.com",
    projectId: "kooksun-stock-kospi",
    storageBucket: "kooksun-stock-kospi.firebasestorage.app",
    messagingSenderId: "708766790662",
    appId: "1:708766790662:web:2976d02a6f5fac48e2ff87",
    databaseURL: "https://kooksun-stock-kospi-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// 코스닥 프로젝트 (시세) - URL만 유추, API Key 등은 추후 업데이트 필요
const kosdaqConfig = {
    apiKey: "AIzaSyAXj1btDcU1FIJC7NDMZdLEQnBu26Q3OGI",
    authDomain: "kooksun-stock-kosdaq.firebaseapp.com",
    projectId: "kooksun-stock-kosdaq",
    storageBucket: "kooksun-stock-kosdaq.firebasestorage.app",
    messagingSenderId: "3343498877",
    appId: "1:3343498877:web:12b2f240756dcc0499fb14",
    databaseURL: "https://kooksun-stock-kosdaq-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const mainApp = !getApps().some(app => app.name === '[DEFAULT]')
    ? initializeApp(mainConfig)
    : getApps().find(app => app.name === '[DEFAULT]')!;

const kospiApp = !getApps().some(app => app.name === 'kospi')
    ? initializeApp(kospiConfig, 'kospi')
    : getApps().find(app => app.name === 'kospi')!;

const kosdaqApp = !getApps().some(app => app.name === 'kosdaq')
    ? initializeApp(kosdaqConfig, 'kosdaq')
    : getApps().find(app => app.name === 'kosdaq')!;

const auth = getAuth(mainApp);
// Firestore 네트워크 오류 해결을 위해 Long Polling 및 Fetch Streams 비활성화 설정 추가
const db = initializeFirestore(mainApp, {
    experimentalForceLongPolling: true,
});
const rtdb = getDatabase(mainApp);
const kospiRtdb = getDatabase(kospiApp);
const kosdaqRtdb = getDatabase(kosdaqApp);

export { mainApp, auth, db, rtdb, kospiRtdb, kosdaqRtdb };
