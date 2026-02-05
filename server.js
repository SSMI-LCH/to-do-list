/**
 * To-Do List 백엔드 서버
 * Express + sql.js (SQLite)
 */

const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB 파일 경로
const dbPath = path.join(__dirname, 'todos.db');
let db = null;

// ===================================
// SQLite 데이터베이스 초기화
// ===================================

async function initDatabase() {
    const SQL = await initSqlJs();

    // 기존 DB 파일이 있으면 로드
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('📦 기존 데이터베이스 로드:', dbPath);
    } else {
        db = new SQL.Database();
        console.log('📦 새 데이터베이스 생성:', dbPath);
    }

    // 테이블 생성
    db.run(`
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY,
            text TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL
        )
    `);

    saveDatabase();
}

/**
 * 데이터베이스를 파일로 저장
 */
function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

// ===================================
// REST API 엔드포인트
// ===================================

/**
 * GET /api/todos - 전체 할 일 조회
 */
app.get('/api/todos', (req, res) => {
    try {
        const result = db.exec(`
            SELECT id, text, completed, createdAt 
            FROM todos 
            ORDER BY createdAt DESC
        `);

        if (result.length === 0) {
            return res.json([]);
        }

        const columns = result[0].columns;
        const todos = result[0].values.map(row => {
            const todo = {};
            columns.forEach((col, i) => {
                todo[col] = col === 'completed' ? Boolean(row[i]) : row[i];
            });
            return todo;
        });

        res.json(todos);
    } catch (error) {
        console.error('조회 오류:', error);
        res.status(500).json({ error: '할 일 목록 조회 실패' });
    }
});

/**
 * GET /api/todos/range - 기간별 할 일 조회
 */
app.get('/api/todos/range', (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: '시작일과 종료일이 필요합니다.' });
        }

        const start = `${startDate}T00:00:00.000Z`;
        const end = `${endDate}T23:59:59.999Z`;

        const result = db.exec(`
            SELECT id, text, completed, createdAt 
            FROM todos 
            WHERE createdAt >= '${start}' AND createdAt <= '${end}'
            ORDER BY createdAt DESC
        `);

        if (result.length === 0) {
            return res.json([]);
        }

        const columns = result[0].columns;
        const todos = result[0].values.map(row => {
            const todo = {};
            columns.forEach((col, i) => {
                todo[col] = col === 'completed' ? Boolean(row[i]) : row[i];
            });
            return todo;
        });

        res.json(todos);
    } catch (error) {
        console.error('기간 조회 오류:', error);
        res.status(500).json({ error: '기간별 조회 실패' });
    }
});

/**
 * POST /api/todos - 새 할 일 추가
 */
app.post('/api/todos', (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: '할 일 내용이 필요합니다.' });
        }

        const id = Date.now();
        const createdAt = new Date().toISOString();

        db.run(`
            INSERT INTO todos (id, text, completed, createdAt) 
            VALUES (?, ?, 0, ?)
        `, [id, text.trim(), createdAt]);

        saveDatabase();

        const newTodo = {
            id,
            text: text.trim(),
            completed: false,
            createdAt
        };

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
app.patch('/api/todos/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { completed } = req.body;

        db.run(`
            UPDATE todos 
            SET completed = ? 
            WHERE id = ?
        `, [completed ? 1 : 0, id]);

        saveDatabase();
        res.json({ success: true });
    } catch (error) {
        console.error('수정 오류:', error);
        res.status(500).json({ error: '할 일 수정 실패' });
    }
});

/**
 * DELETE /api/todos/:id - 할 일 삭제
 */
app.delete('/api/todos/:id', (req, res) => {
    try {
        const { id } = req.params;

        db.run(`DELETE FROM todos WHERE id = ?`, [id]);
        saveDatabase();

        console.log('🗑️ 할 일 삭제:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('삭제 오류:', error);
        res.status(500).json({ error: '할 일 삭제 실패' });
    }
});

// ===================================
// 서버 시작
// ===================================

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('✨ ===================================');
        console.log(`🚀 To-Do List 서버가 시작되었습니다!`);
        console.log(`📍 주소: http://localhost:${PORT}`);
        console.log(`💾 DB 파일: ${dbPath}`);
        console.log('✨ ===================================');
        console.log('');
    });
}).catch(err => {
    console.error('데이터베이스 초기화 실패:', err);
    process.exit(1);
});

// 프로세스 종료 시 DB 저장
process.on('SIGINT', () => {
    if (db) {
        saveDatabase();
        db.close();
    }
    console.log('\n👋 서버가 종료되었습니다.');
    process.exit(0);
});
