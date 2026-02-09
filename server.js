/**
 * To-Do List 백엔드 서버
 * Express + Firebase Admin SDK (Realtime Database)
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // .env 파일 로드

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// 미들웨어
app.use(cors());
app.use(express.json());

// 환경 변수 설정 스크립트 제공 (프론트엔드용)
app.get('/env.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
        window.ENV = {
            KAKAO_REST_API_KEY: '${process.env.KAKAO_REST_API_KEY}',
            GOOGLE_CLIENT_ID: '${process.env.GOOGLE_CLIENT_ID}'
        };
    `);
});

app.use(express.static(path.join(__dirname)));

// ===================================
// Firebase 초기화
// ===================================
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');

// 서비스 계정 키 파일 존재 확인
if (!fs.existsSync(serviceAccountPath)) {
    console.error('\n❌ [Critical Error] serviceAccountKey.json 파일이 없습니다.');
    console.error('   Firebase 연동을 위해 프로젝트 루트에 서비스 계정 키 파일을 배치해주세요.');
    console.error('   다운로드 방법: Firebase Console > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성\n');
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // databaseURL은 프로젝트 ID에 따라 자동 설정되거나 명시적으로 설정 필요
    databaseURL: "https://to-do-list-v1-7d6fe-default-rtdb.firebaseio.com"
});

const db = admin.database();
console.log('🔥 Firebase Admin SDK 초기화 완료');

// ===================================
// 카카오 OAuth 설정
// ===================================
const KAKAO_JS_KEY = process.env.KAKAO_JS_KEY; // 서버에서 사용하는 Key (User named it JS_KEY but used as Client Secret/REST Key)

/**
 * POST /api/auth/kakao - 카카오 로그인 (인가 코드로 토큰 교환)
 */
app.post('/api/auth/kakao', async (req, res) => {
    try {
        const { code, redirectUri } = req.body;

        if (!code) {
            return res.status(400).json({ error: '인가 코드가 없습니다.' });
        }

        // 1. 카카오에 토큰 요청
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', KAKAO_JS_KEY);
        params.append('redirect_uri', redirectUri);
        params.append('code', code);

        const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: params
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('❌ 카카오 토큰 오류:', tokenData);
            return res.status(400).json({
                error: tokenData.error_description || '토큰 요청 실패',
                details: tokenData
            });
        }

        console.log('✅ 카카오 토큰 발급 성공');

        // 2. 카카오에서 사용자 정보 가져오기
        const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const kakaoUser = await userResponse.json();

        const userId = kakaoUser.id.toString();
        const name = kakaoUser.properties?.nickname || '카카오 사용자';
        const email = kakaoUser.kakao_account?.email || '';
        const picture = ''; // 프로필 사진 미사용

        // 3. Firebase에 사용자 등록 또는 조회
        const userRef = db.ref('users/' + userId);
        const snapshot = await userRef.once('value');

        if (snapshot.exists()) {
            // 기존 회원
            const user = snapshot.val();
            console.log('🔑 카카오 기존 회원 로그인:', name);
            return res.json({ isNew: false, user });
        }

        // 신규 회원 등록
        const createdAt = new Date().toISOString();
        const newUser = { id: userId, provider: 'kakao', name, email, picture, createdAt };

        await userRef.set(newUser);

        console.log('🎉 카카오 신규 회원가입:', name);
        res.status(201).json({ isNew: true, user: newUser });
    } catch (error) {
        console.error('카카오 로그인 오류:', error);
        res.status(500).json({ error: '카카오 로그인 처리 실패' });
    }
});

// ===================================
// REST API 엔드포인트
// ===================================

/**
 * GET /api/todos - 전체 할 일 조회
 */
app.get('/api/todos', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.json([]); // 비로그인 시 빈 배열 반환
        }

        const snapshot = await db.ref(`todos/${userId}`).orderByChild('createdAt').once('value');
        const todosObj = snapshot.val() || {};
        const todos = Object.values(todosObj).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json(todos);
    } catch (error) {
        console.error('조회 오류:', error);
        fs.writeFileSync('server_error.log', `[${new Date().toISOString()}] 조회 오류: ${error.stack || error}\n`, { flag: 'a' });
        res.status(500).json({ error: '할 일 목록 조회 실패' });
    }
});

/**
 * GET /api/todos/range - 기간별 할 일 조회
 */
app.get('/api/todos/range', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: '시작일과 종료일이 필요합니다.' });
        }

        const start = `${startDate}T00:00:00.000Z`;
        const end = `${endDate}T23:59:59.999Z`;

        const snapshot = await db.ref(`todos/${userId}`)
            .orderByChild('createdAt')
            .startAt(start)
            .endAt(end)
            .once('value');

        const todosObj = snapshot.val() || {};
        const todos = Object.values(todosObj).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json(todos);
    } catch (error) {
        console.error('기간 조회 오류:', error);
        res.status(500).json({ error: '기간별 조회 실패' });
    }
});

/**
 * POST /api/todos - 새 할 일 추가
 */
app.post('/api/todos', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: '할 일 내용이 필요합니다.' });
        }

        const id = Date.now();
        const createdAt = new Date().toISOString();

        const newTodo = {
            id,
            text: text.trim(),
            completed: false,
            createdAt
        };

        await db.ref(`todos/${userId}/${id}`).set(newTodo);

        console.log('✅ 할 일 추가:', newTodo.text);
        res.status(201).json(newTodo);
    } catch (error) {
        console.error('추가 오류:', error);
        res.status(500).json({ error: '할 일 추가 실패' });
    }
});

/**
 * PATCH /api/todos/:id - 할 일 수정 (완료 상태 토글)
 */
app.patch('/api/todos/:id', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const { id } = req.params;
        const { completed } = req.body;

        await db.ref(`todos/${userId}/${id}`).update({ completed });

        res.json({ success: true });
    } catch (error) {
        console.error('수정 오류:', error);
        res.status(500).json({ error: '할 일 수정 실패' });
    }
});

/**
 * DELETE /api/todos/:id - 할 일 삭제
 */
app.delete('/api/todos/:id', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const { id } = req.params;

        await db.ref(`todos/${userId}/${id}`).remove();

        console.log('🗑️ 할 일 삭제:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('삭제 오류:', error);
        res.status(500).json({ error: '할 일 삭제 실패' });
    }
});

// ===================================
// User API 엔드포인트 (회원 관리)
// ===================================

/**
 * POST /api/users/register - 회원가입 또는 로그인 (기존 회원이면 정보 반환)
 */
app.post('/api/users/register', async (req, res) => {
    try {
        const { id, provider, name, email, picture } = req.body;

        if (!id || !provider || !name || !email) {
            return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
        }

        const userRef = db.ref('users/' + id);
        const snapshot = await userRef.once('value');

        if (snapshot.exists()) {
            const user = snapshot.val();
            console.log(`🔑 기존 회원 로그인 (${provider}):`, email);
            return res.json({ isNew: false, user });
        }

        const createdAt = new Date().toISOString();
        const newUser = { id, provider, name, email, picture, createdAt };

        await userRef.set(newUser);

        console.log(`🎉 신규 회원가입 (${provider}):`, email);
        res.status(201).json({ isNew: true, user: newUser });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ error: '회원가입 실패' });
    }
});

/**
 * GET /api/users/:id - 사용자 조회
 */
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const snapshot = await db.ref('users/' + id).once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        res.json(snapshot.val());
    } catch (error) {
        console.error('사용자 조회 오류:', error);
        res.status(500).json({ error: '사용자 조회 실패' });
    }
});

/**
 * PUT /api/users/:id - 프로필 수정
 */
app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: '이름은 필수입니다.' });
        }

        const updatedAt = new Date().toISOString();

        await db.ref('users/' + id).update({ name: name.trim(), updatedAt });

        console.log('✏️ 프로필 수정:', id);
        res.json({ success: true, name: name.trim(), updatedAt });
    } catch (error) {
        console.error('프로필 수정 오류:', error);
        res.status(500).json({ error: '프로필 수정 실패' });
    }
});

/**
 * DELETE /api/users/:id - 회원 탈퇴
 */
app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await db.ref('users/' + id).remove();

        console.log('👋 회원 탈퇴:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('회원 탈퇴 오류:', error);
        res.status(500).json({ error: '회원 탈퇴 실패' });
    }
});

// ===================================
// 서버 시작
// ===================================

app.listen(PORT, HOST, () => {
    // IP 주소 가져오기
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let ipAddress = 'localhost';
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ipAddress = net.address;
                break;
            }
        }
    }

    console.log('');
    console.log('✨ ===================================');
    console.log(`🚀 To-Do List 서버가 시작되었습니다! (Firebase Mode)`);
    console.log(`📍 로컬: http://localhost:${PORT}`);
    console.log(`🌐 네트워크: http://${ipAddress}:${PORT}`);
    console.log(`� DB: Firebase Realtime Database`);
    console.log('✨ ===================================');
    console.log('');
});
