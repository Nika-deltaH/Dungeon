/**
 * 遊戲參數
 */
const GRID_SIZE = 5;
const DOOR_LEVEL = 6;
const TILE_SIZE = 75;
const MARGIN = 10;
const HEADER_H = 60;
const CANVAS_W = GRID_SIZE * TILE_SIZE + (GRID_SIZE + 1) * MARGIN;
const CANVAS_H = CANVAS_W + HEADER_H;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const COLORS = {
    V: '#448ef6', // Villager
    M: '#ff4d4d', // Monster
    T: '#ffca28', // Treasure
    D: '#393e46', // Door
    X: '#e94560', // Boss
    K: '#a855f7'  // Key
};


/**
 * 類別定義
 */
class Tile {
    constructor(type, level, x, y) {
        this.type = type;
        this.level = level;
        this.x = x;
        this.y = y;
        this.visualX = x;
        this.visualY = y;
        this.scale = 0; // 起始縮放用於 Pop 動畫
        this.id = Math.random();
    }
    update() {
        this.visualX += (this.x - this.visualX) * 0.2;
        this.visualY += (this.y - this.visualY) * 0.2;
        if (Math.abs(this.scale - 1) < 0.05) this.scale = 1;
        else if (this.scale < 1) this.scale += 0.08;
        else this.scale -= 0.04;
    }
}

/**
 * 遊戲狀態
 */
let grid = [];
let gold = 0;
let floor = 1;
let hasKey = false;
let keySpawned = false;
let bossCol = Math.floor(Math.random() * GRID_SIZE);
let dragStart = null;

// 持久化紀錄
let bestFloor = parseInt(localStorage.getItem('df_bestFloor') || '0');
let bestGold = parseInt(localStorage.getItem('df_bestGold') || '0');

function initGame() {
    floor = 1;
    gold = 0;
    hasKey = false;
    keySpawned = false;
    bossCol = Math.floor(Math.random() * GRID_SIZE);
    updateUI();
    resetGrid();
}

function resetGrid() {
    grid = [];
    for (let x = 0; x < GRID_SIZE; x++) {
        grid[x] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            grid[x][y] = spawnInitial(x, y);
            grid[x][y].scale = 1;
        }
    }
}

function nextFloor() {
    const bonus = 10 * floor;
    gold += bonus;
    floor++;
    hasKey = false;
    keySpawned = false;
    bossCol = Math.floor(Math.random() * GRID_SIZE);
    updateUI();
    resetGrid();
}

function gameOver() {
    if (floor > bestFloor) { bestFloor = floor; localStorage.setItem('df_bestFloor', bestFloor); }
    if (gold > bestGold) { bestGold = gold; localStorage.setItem('df_bestGold', bestGold); }
    const msg = `💀 Game Over！所有單位都無路可走！
最終到達 B${floor}，持金 ${gold}G`;
    setTimeout(() => { alert(msg); initGame(); }, 400);
}

function spawnInitial(x, y) {
    const r = Math.random();
    if (r < 0.08) return new Tile('M', 2, x, y);
    if (r < 0.12) return new Tile('M', 3, x, y);
    if (r < 0.13) return new Tile('T', 1, x, y);
    if (r < 0.30) return new Tile('V', 2, x, y);
    return new Tile('V', 1, x, y);
}

/**
 * 核心交互邏輯
 */
// 盤面上是否已有鑰匙
function keyExistsOnBoard() {
    return grid.flat().some(t => t.type === 'K');
}

// T 升到 DOOR_LEVEL 且本局尚未出現過鑰匙時，生成唯一鑰匙
function checkKeyPromotion(tile) {
    if (!keySpawned && tile.type === 'T' && tile.level === DOOR_LEVEL) {
        tile.type = 'K';
        tile.scale = 1.5;
        keySpawned = true;
    }
}

function checkInteraction(mover, target) {
    const n = mover.level;
    const x = target.level;

    // 0. Vn + K (n >= K等級=DOOR_LEVEL): 取得鑰匙, V 留原地, 尾端生 Mn+1
    if (mover.type === 'V' && target.type === 'K' && n >= target.level) {
        hasKey = true;
        target.type = 'V';
        target.level = n;
        target.scale = 1.3;
        return { type: 'M', level: n + 1 };
    }
    // 1. Vn + Vn: 合併 Vn+1, 尾端生 Mn+1
    if (mover.type === 'V' && target.type === 'V' && n === x) {
        target.level = n + 1;
        target.scale = 1.5;
        return { type: 'M', level: n + 1 };
    }
    // 2. Tn + Tn: 合併 Tn+1, 尾端生 Vn; 若升到 DOOR_LEVEL 則變鑰匙
    if (mover.type === 'T' && target.type === 'T' && n === x) {
        target.level = n + 1;
        target.scale = 1.5;
        checkKeyPromotion(target);
        return { type: 'V', level: n };
    }
    // 3. Vn + Mx (x <= n): V 戰勝 M, 原地變 Vn, 尾端生 T(x-1) 或 V(x-2)
    if (mover.type === 'V' && target.type === 'M' && x <= n) {
        const enemyLv = target.level;
        target.type = 'V';
        target.level = n;
        target.scale = 1.2;
        // 80% 產生 Lv-1 寶箱, 20% 出現 Lv-2 村民 (最低等級 1)
        if (Math.random() < 0.8) {
            return { type: 'T', level: Math.max(1, enemyLv - 1) };
        } else {
            return { type: 'V', level: Math.max(1, enemyLv - 2) };
        }
    }
    // 4. Vn + Tx (x <= n): V 收集 T, 原地變 Vn, 尾端生 M(x+1) 或 M(x+2)
    if (mover.type === 'V' && target.type === 'T' && x <= n) {
        addGold(x);
        target.type = 'V';
        target.level = n;
        target.scale = 1.2;
        // 80% 產生 Lv+1 怪物, 20% 出現 Lv+2 怪物
        const nextLv = Math.random() < 0.8 ? x + 1 : x + 2;
        return { type: 'M', level: nextLv };
    }
    return null;
}

function tryMove(startX, startY, dx, dy) {
    const mover = grid[startX][startY];
    if (!mover || mover.type === 'M') return;

    const tx = startX + dx;
    const ty = startY + dy;

    if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) {
        // 特殊：V 從 BOSS 欄第 0 行往上滑進 BOSS 門
        if (dy === -1 && startY === 0 && startX === bossCol
            && mover.type === 'V' && mover.level >= DOOR_LEVEL && hasKey) {
            const bonus = 10 * floor;
            setTimeout(() => {
                alert(`🏆 勇者擊敗了 B${floor} 的魔王！獲得 ${bonus}G！`);
                nextFloor();
            }, 300);
        }
        return;
    }

    const target = grid[tx][ty];
    const result = checkInteraction(mover, target);

    if (result) {
        // 執行局部推擠並在尾端生成
        let tailTile;
        if (dy === -1) { // 向上
            for (let i = startY; i < GRID_SIZE - 1; i++) grid[startX][i] = grid[startX][i + 1];
            tailTile = new Tile(result.type, result.level, startX, GRID_SIZE - 1);
            grid[startX][GRID_SIZE - 1] = tailTile;
        } else if (dy === 1) { // 向下
            for (let i = startY; i > 0; i--) grid[startX][i] = grid[startX][i - 1];
            tailTile = new Tile(result.type, result.level, startX, 0);
            grid[startX][0] = tailTile;
        } else if (dx === -1) { // 向左
            for (let i = startX; i < GRID_SIZE - 1; i++) grid[i][startY] = grid[i + 1][startY];
            tailTile = new Tile(result.type, result.level, GRID_SIZE - 1, startY);
            grid[GRID_SIZE - 1][startY] = tailTile;
        } else if (dx === 1) { // 向右
            for (let i = startX; i > 0; i--) grid[i][startY] = grid[i - 1][startY];
            tailTile = new Tile(result.type, result.level, 0, startY);
            grid[0][startY] = tailTile;
        }
        // 尾端生成的 T 若達到 DOOR_LEVEL 也升為鑰匙
        if (tailTile) checkKeyPromotion(tailTile);

        // 同步座標
        syncPositions();

        // Game Over 檢測
        if (isGameOver()) gameOver();
    }
}

function syncPositions() {
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            const t = grid[x][y];
            t.x = x;
            t.y = y;
            // 只有新生成的 tile（scale===0 表示剛建立）才保留 visualXY
            // 讓 pop 動畫在原地縮放；舊 tile 被推擠後立即對齊，不產生滑動
            if (t.scale !== 0) {
                t.visualX = x;
                t.visualY = y;
            }
        }
    }
}

function addGold(n) {
    gold += Math.pow(2, n - 1) + (n - 1);
    updateUI();
}

function updateUI() {
    document.getElementById('floor-val').textContent = 'B' + floor;
    document.getElementById('gold-val').textContent = gold;
    document.getElementById('best-floor-val').textContent = bestFloor > 0 ? '(B' + bestFloor + ')' : '(--)';
    document.getElementById('best-gold-val').textContent = bestGold > 0 ? '(' + bestGold + 'G)' : '(--)';
}

// 純判斷：mover 能否與 target 發生互動（無副作用）
function canInteract(mover, target) {
    if (!mover || !target) return false;
    const n = mover.level, x = target.level;
    if (mover.type === 'V' && target.type === 'K' && n >= x) return true;
    if (mover.type === 'V' && target.type === 'V' && n === x) return true;
    if (mover.type === 'T' && target.type === 'T' && n === x) return true;
    if (mover.type === 'V' && target.type === 'M' && x <= n) return true;
    if (mover.type === 'V' && target.type === 'T' && x <= n) return true;
    return false;
}

// 判斷格子上的 tile 在四個方向是否有至少一個有效動作
function hasValidMove(gx, gy) {
    const mover = grid[gx][gy];
    if (!mover || mover.type === 'M' || mover.type === 'K') return false;
    // V 在 BOSS 門正下方且等級够且有鑰匙 → 可以上滑過關，不德暴
    if (mover.type === 'V' && gx === bossCol && gy === 0 && mover.level >= DOOR_LEVEL && hasKey) return true;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
        const tx = gx + dx, ty = gy + dy;
        if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
        if (canInteract(mover, grid[tx][ty])) return true;
    }
    return false;
}

// 所有 V 和 T 都沒有有效動作則 game over
function isGameOver() {
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            const t = grid[x][y];
            if ((t.type === 'V' || t.type === 'T') && hasValidMove(x, y)) return false;
        }
    }
    return true;
}

/**
 * 繪製系統
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Boss 門（含鎖定/解鎖狀態）
    const bx = bossCol * (TILE_SIZE + MARGIN) + MARGIN;
    const cx = bx + TILE_SIZE / 2;
    // 門框
    ctx.fillStyle = hasKey ? '#1e3a2f' : COLORS.D;
    roundRect(ctx, bx, 4, TILE_SIZE, 52, 6, true);
    // 門框邊框
    ctx.strokeStyle = hasKey ? '#4ade80' : '#e94560';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, 4, TILE_SIZE, 52, 6, false);
    ctx.stroke();
    // BOSS 標題
    ctx.fillStyle = COLORS.X;
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🏰 BOSS Lv" + DOOR_LEVEL, cx, 19);
    // 鎖/解鎖
    ctx.font = "14px Arial";
    ctx.fillStyle = hasKey ? '#4ade80' : '#facc15';
    ctx.fillText(hasKey ? "🔓 門已開" : "🔒 需要鑰匙", cx, 40);

    // 棋盤格
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            roundRect(ctx, x * (TILE_SIZE + MARGIN) + MARGIN, y * (TILE_SIZE + MARGIN) + MARGIN + HEADER_H, TILE_SIZE, TILE_SIZE, 10, true);
        }
    }

    // 單位
    grid.flat().forEach(tile => {
        tile.update();
        const vx = tile.visualX * (TILE_SIZE + MARGIN) + MARGIN;
        const vy = tile.visualY * (TILE_SIZE + MARGIN) + MARGIN + HEADER_H;

        ctx.save();
        ctx.translate(vx + TILE_SIZE / 2, vy + TILE_SIZE / 2);
        ctx.scale(tile.scale, tile.scale);

        // 陰影與主體
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.fillStyle = COLORS[tile.type];
        // M 暗示不可拖動；只有 V 沒有有效動作時變暗
        if (tile.type === 'M') {
            ctx.globalAlpha = 0.85;
        } else if (tile.type === 'V' && !hasValidMove(tile.x, tile.y)) {
            ctx.globalAlpha = 0.35;
        }

        roundRect(ctx, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 12, true);

        // 文字
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (tile.type === 'K') {
            ctx.font = "18px Arial";
            ctx.fillText("🗝️", 0, -10);
            ctx.font = "bold 12px Arial";
            ctx.fillText("Lv" + tile.level, 0, 10);
        } else {
            ctx.fillText(tile.type + tile.level, 0, 0);
        }

        ctx.restore();
    });

    requestAnimationFrame(draw);
}

function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
}

/**
 * 事件監聽
 */
function getGridPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // 畫布可能被縮放（CSS），需換算實際座標
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    const gx = Math.floor((mx - MARGIN) / (TILE_SIZE + MARGIN));
    const gy = Math.floor((my - MARGIN - HEADER_H) / (TILE_SIZE + MARGIN));
    return { gx, gy };
}

// ── Mouse ──
canvas.addEventListener('mousedown', e => {
    const { gx, gy } = getGridPos(e.clientX, e.clientY);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
        dragStart = { x: gx, y: gy, sx: e.clientX, sy: e.clientY };
    }
});

window.addEventListener('mouseup', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.sx;
    const dy = e.clientY - dragStart.sy;

    if (Math.abs(dx) > 25 || Math.abs(dy) > 25) {
        if (Math.abs(dx) > Math.abs(dy)) tryMove(dragStart.x, dragStart.y, dx > 0 ? 1 : -1, 0);
        else tryMove(dragStart.x, dragStart.y, 0, dy > 0 ? 1 : -1);
    }
    dragStart = null;
});

// ── Touch ──
canvas.addEventListener('touchstart', e => {
    e.preventDefault(); // 防止捲動/縮放
    const t = e.changedTouches[0];
    const { gx, gy } = getGridPos(t.clientX, t.clientY);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
        dragStart = { x: gx, y: gy, sx: t.clientX, sy: t.clientY };
    }
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (!dragStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - dragStart.sx;
    const dy = t.clientY - dragStart.sy;

    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
        if (Math.abs(dx) > Math.abs(dy)) tryMove(dragStart.x, dragStart.y, dx > 0 ? 1 : -1, 0);
        else tryMove(dragStart.x, dragStart.y, 0, dy > 0 ? 1 : -1);
    }
    dragStart = null;
}, { passive: false });

function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    const overlay = document.getElementById('modal-overlay');
    const display = modal.style.display === 'block' ? 'none' : 'block';
    modal.style.display = display;
    overlay.style.display = display;
}

function confirmReset() {
    document.getElementById('reset-modal').style.display = 'block';
    document.getElementById('reset-overlay').style.display = 'block';
}

function cancelReset() {
    document.getElementById('reset-modal').style.display = 'none';
    document.getElementById('reset-overlay').style.display = 'none';
}

function doReset() {
    cancelReset();
    initGame();
}

// 啟動
initGame();
draw();
