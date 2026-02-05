/**
 * ✨ To-Do List Application
 * 할 일 관리 웹 애플리케이션 - JavaScript
 * Node.js 백엔드 API 연동
 */

// ===================================
// 전역 상태 및 상수
// ===================================

const API_BASE = '/api/todos';
let todos = [];
let isFiltered = false;

// DOM 요소 선택
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const totalCountEl = document.getElementById('totalCount');
const completedCountEl = document.getElementById('completedCount');

// 기간 조회 요소
const toggleFilterBtn = document.getElementById('toggleFilterBtn');
const dateFilterBody = document.getElementById('dateFilterBody');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');

// ===================================
// API 함수
// ===================================

/**
 * 모든 할 일 조회
 * @returns {Promise<Array>}
 */
async function fetchAllTodos() {
    const response = await fetch(API_BASE);
    if (!response.ok) throw new Error('조회 실패');
    return response.json();
}

/**
 * 기간별 할 일 조회
 * @param {string} startDate - 시작일 (YYYY-MM-DD)
 * @param {string} endDate - 종료일 (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
async function fetchTodosByDateRange(startDate, endDate) {
    const response = await fetch(`${API_BASE}/range?startDate=${startDate}&endDate=${endDate}`);
    if (!response.ok) throw new Error('기간 조회 실패');
    return response.json();
}

/**
 * 할 일 추가 API
 * @param {string} text - 할 일 내용
 * @returns {Promise<Object>}
 */
async function createTodo(text) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error('추가 실패');
    return response.json();
}

/**
 * 할 일 완료 상태 변경 API
 * @param {number} id - 할 일 ID
 * @param {boolean} completed - 완료 상태
 * @returns {Promise}
 */
async function updateTodoStatus(id, completed) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
    });
    if (!response.ok) throw new Error('수정 실패');
}

/**
 * 할 일 삭제 API
 * @param {number} id - 할 일 ID
 * @returns {Promise}
 */
async function removeTodo(id) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('삭제 실패');
}

// ===================================
// 할 일 CRUD 함수
// ===================================

/**
 * 새 할 일 추가
 * @param {string} text - 할 일 내용
 */
async function addTodo(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    try {
        const newTodo = await createTodo(trimmedText);
        todos.unshift(newTodo);
        renderTodos();
        updateStats();

        // 입력 필드 초기화
        todoInput.value = '';
        todoInput.focus();

        console.log('✅ 할 일 추가:', newTodo.text);
    } catch (error) {
        console.error('할 일 추가 실패:', error);
        alert('할 일을 추가하는 중 오류가 발생했습니다.\n서버가 실행 중인지 확인해주세요.');
    }
}

/**
 * 할 일 완료 상태 토글
 * @param {number} id - 할 일 ID
 */
async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newStatus = !todo.completed;

    try {
        await updateTodoStatus(id, newStatus);
        todo.completed = newStatus;
        renderTodos();
        updateStats();
    } catch (error) {
        console.error('상태 변경 실패:', error);
    }
}

/**
 * 할 일 삭제
 * @param {number} id - 할 일 ID
 */
async function deleteTodo(id) {
    const todoItem = document.querySelector(`[data-id="${id}"]`);

    if (todoItem) {
        todoItem.classList.add('removing');

        setTimeout(async () => {
            try {
                await removeTodo(id);
                todos = todos.filter(t => t.id !== id);
                renderTodos();
                updateStats();
                console.log('🗑️ 할 일 삭제 완료');
            } catch (error) {
                console.error('삭제 실패:', error);
                todoItem.classList.remove('removing');
            }
        }, 300);
    }
}

// ===================================
// 렌더링 함수
// ===================================

/**
 * 날짜/시간 포맷팅
 * @param {string} isoString - ISO 날짜 문자열
 * @returns {string} 포맷팅된 날짜/시간
 */
function formatDateTime(isoString) {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}.${month}.${day} ${hours}:${minutes}`;
}

/**
 * 할 일 목록 렌더링
 */
function renderTodos() {
    // 빈 상태 처리
    if (todos.length === 0) {
        emptyState.classList.add('show');
        todoList.innerHTML = '';

        if (isFiltered) {
            emptyState.querySelector('p').textContent = '해당 기간에 등록된 할 일이 없습니다.';
            emptyState.querySelector('.empty-icon').textContent = '📭';
        } else {
            emptyState.querySelector('p').textContent = '할 일을 추가해보세요!';
            emptyState.querySelector('.empty-icon').textContent = '🎯';
        }
        return;
    }

    emptyState.classList.remove('show');

    // 할 일 목록 HTML 생성
    todoList.innerHTML = todos.map(todo => `
        <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
            <label class="todo-checkbox">
                <input 
                    type="checkbox" 
                    ${todo.completed ? 'checked' : ''}
                    onchange="toggleTodo(${todo.id})"
                >
                <span class="checkmark"></span>
            </label>
            <div class="todo-content">
                <span class="todo-text">${escapeHtml(todo.text)}</span>
                <span class="todo-date">${formatDateTime(todo.createdAt)}</span>
            </div>
            <button 
                class="delete-btn" 
                onclick="deleteTodo(${todo.id})"
                title="삭제"
                aria-label="할 일 삭제"
            >
                🗑️
            </button>
        </li>
    `).join('');
}

/**
 * 통계 업데이트
 */
function updateStats() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;

    totalCountEl.textContent = `전체: ${total}`;
    completedCountEl.textContent = `완료: ${completed}`;
}

// ===================================
// 유틸리티 함수
// ===================================

/**
 * HTML 이스케이프 (XSS 방지)
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// 기간 조회 기능
// ===================================

/**
 * 기간별 조회 실행
 */
async function searchByDateRange() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (!startDate || !endDate) {
        alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }

    try {
        todos = await fetchTodosByDateRange(startDate, endDate);
        isFiltered = true;
        renderTodos();
        updateStats();
        console.log(`📅 ${startDate} ~ ${endDate} 기간 조회: ${todos.length}건`);
    } catch (error) {
        console.error('기간 조회 실패:', error);
        alert('조회 중 오류가 발생했습니다.');
    }
}

/**
 * 전체 보기 (필터 초기화)
 */
async function resetFilter() {
    try {
        todos = await fetchAllTodos();
        isFiltered = false;
        startDateInput.value = '';
        endDateInput.value = '';
        renderTodos();
        updateStats();
        console.log('🔄 전체 보기로 전환');
    } catch (error) {
        console.error('전체 조회 실패:', error);
    }
}

/**
 * 필터 패널 토글
 */
function toggleFilterPanel() {
    dateFilterBody.classList.toggle('show');
    toggleFilterBtn.classList.toggle('open');
}

// ===================================
// 이벤트 핸들러
// ===================================

// 할 일 추가
addBtn.addEventListener('click', () => addTodo(todoInput.value));
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo(todoInput.value);
});

// 기간 조회
toggleFilterBtn.addEventListener('click', toggleFilterPanel);
document.querySelector('.date-filter-header').addEventListener('click', (e) => {
    if (e.target !== toggleFilterBtn && !toggleFilterBtn.contains(e.target)) {
        toggleFilterPanel();
    }
});
searchBtn.addEventListener('click', searchByDateRange);
resetBtn.addEventListener('click', resetFilter);

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        todoInput.focus();
    }
});

// ===================================
// 초기화
// ===================================

/**
 * 애플리케이션 초기화
 */
async function init() {
    try {
        // 할 일 목록 불러오기
        todos = await fetchAllTodos();

        // 렌더링
        renderTodos();
        updateStats();

        // 입력 필드에 포커스
        todoInput.focus();

        // 오늘 날짜를 종료일 기본값으로 설정
        const today = new Date().toISOString().split('T')[0];
        endDateInput.value = today;

        console.log('✨ To-Do List 애플리케이션이 시작되었습니다!');
        console.log(`📝 저장된 할 일: ${todos.length}건`);
    } catch (error) {
        console.error('초기화 실패:', error);
        emptyState.classList.add('show');
        emptyState.querySelector('p').textContent = '서버에 연결할 수 없습니다. 서버를 실행해주세요.';
        emptyState.querySelector('.empty-icon').textContent = '⚠️';
    }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
