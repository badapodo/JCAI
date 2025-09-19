const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// --- 전역 변수 및 설정 ---
let demoData = [];
let demoDataIndex = 0;

// 시나리오별 JSON 데이터 로딩
function loadJsonData() {
  const jsonDataPath = process.env.JSON_DATA_PATH || 'demo-data.json';
  const jsonScenario = process.env.JSON_SCENARIO || 'demo';
  
  let filePath = './demo-data.json'; // 기본값
  
  if (jsonScenario === 'bull') {
    filePath = './bull-market-data.json';
  } else if (jsonScenario === 'bear') {
    filePath = './bear-market-data.json';
  } else if (jsonDataPath !== 'demo-data.json') {
    filePath = `./${jsonDataPath}`;
  }
  
  try {
    demoData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`JSON 데이터 로딩 완료: ${filePath} (${demoData.length}개 데이터 포인트)`);
    console.log(`시나리오: ${jsonScenario}, 업데이트 간격: ${process.env.JSON_UPDATE_INTERVAL || 10000}ms`);
  } catch (err) {
    console.error(`JSON 파일을 읽을 수 없습니다: ${filePath}`, err);
    // 기본 데이터로 폴백
    try {
      demoData = JSON.parse(fs.readFileSync('./demo-data.json', 'utf-8'));
      console.log("기본 demo-data.json으로 폴백했습니다.");
    } catch (fallbackErr) {
      console.error("기본 demo-data.json도 읽을 수 없습니다. JSON 모드가 동작하지 않을 수 있습니다.", fallbackErr);
    }
  }
}

// 초기 JSON 데이터 로딩
loadJsonData();

// JSON 모드에서 초기 그래프 데이터를 로드하는 함수
async function loadInitialJsonData() {
  if (process.env.DATA_MODE !== 'json' || !demoData || demoData.length === 0) {
    return;
  }

  console.log('JSON 모드: 초기 그래프 데이터를 로드합니다...');
  
  // 현재 시간에서 역순으로 시간을 계산하여 초기 데이터 생성
  const now = new Date();
  const updateInterval = parseInt(process.env.JSON_UPDATE_INTERVAL) || 10000;
  
  // 최대 20개의 초기 데이터 포인트를 생성 (또는 demoData 길이만큼)
  const initialDataCount = Math.min(20, demoData.length);
  
  for (let i = initialDataCount - 1; i >= 0; i--) {
    const dataIndex = i % demoData.length;
    const data = demoData[dataIndex];
    
    // 각 데이터 포인트의 시간을 updateInterval만큼 과거로 설정
    const timestamp = new Date(now.getTime() - (i * updateInterval));
    
    const insertQuery = `
      INSERT INTO jcai_history (value, pm25, pm10, created_at) 
      VALUES (?, ?, ?, ?)
    `;
    
    await new Promise((resolve, reject) => {
      db.run(insertQuery, [data.jcai, data.pm25, data.pm10, timestamp.toISOString()], function(err) {
        if (err) {
          console.error('초기 JCAI 데이터 삽입 오류:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  
  // 가장 최신 데이터로 캐시 업데이트
  const latestData = demoData[0];
  cachedJcaiData = { 
    jcai: latestData.jcai, 
    pm25: latestData.pm25, 
    pm10: latestData.pm10, 
    timestamp: now 
  };
  
  // demoDataIndex를 1로 설정 (다음 업데이트에서 두 번째 데이터부터 사용)
  demoDataIndex = 1;
  
  console.log(`JSON 모드: ${initialDataCount}개의 초기 데이터 포인트가 로드되었습니다.`);
  console.log('최신 JCAI 데이터로 캐시를 업데이트했습니다.', cachedJcaiData.jcai);
}

let cachedJcaiData = null;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const app = express();
const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'air_trader_secret_key';

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- JCAI 데이터 관리 로직 ---
function calculateJcai(pm10, pm25) {
  const pm10Value = parseInt(pm10) || 0;
  const pm25Value = parseInt(pm25) || 0;
  if (pm10Value === 0 || pm25Value === 0) return null;
  return Math.round(10000 - (pm25Value * 1.5 + pm10Value));
}

async function updateLatestJcai() {
  console.log(`[${new Date().toISOString()}] 최신 JCAI 데이터 업데이트를 시작합니다.`);
  const mode = process.env.DATA_MODE || 'random';

  try {
    let dataToInsert = [];

    if (mode === 'api') {
      const response = await axios.get('http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty', {
        params: {
          serviceKey: process.env.AIRKOREA_API_KEY,
          returnType: 'json',
          numOfRows: 24,
          pageNo: 1,
          stationName: '노송동',
          dataTerm: 'DAILY',
          ver: '1.3',
        }
      });

      console.log('AirKorea API Response:', JSON.stringify(response.data, null, 2)); // DEBUG LOG

      if (!response.data.response || !response.data.response.body || !response.data.response.body.items) {
        console.error('AirKorea API returned an unexpected format:', response.data);
        throw new Error('AirKorea API로부터 예상치 못한 응답 형식을 받았습니다.');
      }

      const items = response.data.response.body.items;
      if (items.length === 0) {
        throw new Error('API 응답에 측정 항목(items)이 없습니다.');
      }

      for (const item of items) {
        if (item && item.pm10Value !== '-' && item.pm25Value !== '-') {
          const jcaiValue = calculateJcai(item.pm10Value, item.pm25Value);
          if (jcaiValue !== null) {
            dataToInsert.push({
              jcai: jcaiValue,
              pm25: parseFloat(item.pm25Value),
              pm10: parseFloat(item.pm10Value),
              timestamp: new Date(item.dataTime).toISOString()
            });
          }
        }
      }
    } else if (mode === 'json') {
      // JSON 모드: 설정된 간격마다 시연용 데이터를 순차적으로 추가
      if (demoData.length > 0) {
        // 다음 데이터 포인트가 있는지 확인
        if (demoDataIndex < demoData.length) {
          const data = demoData[demoDataIndex];
          
          dataToInsert.push({
            jcai: data.jcai,
            pm25: data.pm25,
            pm10: data.pm10,
            timestamp: new Date().toISOString() // 현재 시간으로 설정
          });
          
          console.log(`[JSON 모드] 데이터 포인트 ${demoDataIndex + 1}/${demoData.length} 추가: JCAI=${data.jcai}, PM2.5=${data.pm25}, PM10=${data.pm10}`);
          demoDataIndex++;
        } else {
          // 모든 데이터를 다 사용했으면 처음부터 다시 시작 (순환)
          demoDataIndex = 0;
          const data = demoData[demoDataIndex];
          
          dataToInsert.push({
            jcai: data.jcai,
            pm25: data.pm25,
            pm10: data.pm10,
            timestamp: new Date().toISOString()
          });
          
          console.log(`[JSON 모드] 데이터 순환 시작 - 데이터 포인트 ${demoDataIndex + 1}/${demoData.length} 추가: JCAI=${data.jcai}, PM2.5=${data.pm25}, PM10=${data.pm10}`);
          demoDataIndex++;
        }
      } else {
        console.warn('시연용 데이터가 비어있습니다.');
        return;
      }
    } else { // random
      // Random 모드도 단일 데이터 포인트만 생성합니다.
      const mockPM25 = Math.random() * 30 + 10;
      const mockPM10 = Math.random() * 50 + 20;
      const jcaiValue = calculateJcai(mockPM10, mockPM25);
      dataToInsert.push({
        jcai: jcaiValue,
        pm25: Math.round(mockPM25 * 10) / 10,
        pm10: Math.round(mockPM10),
        timestamp: new Date().toISOString()
      });
    }

    if (dataToInsert.length > 0) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO jcai_history (value, pm25, pm10, created_at) VALUES (?, ?, ?, ?)`);
      db.serialize(() => {
        for (const data of dataToInsert) {
          stmt.run(data.jcai, data.pm25, data.pm10, data.timestamp);
        }
        stmt.finalize();
      });
      
      // 가장 최신 데이터로 cachedJcaiData 업데이트
      cachedJcaiData = dataToInsert.reduce((latest, current) => new Date(latest.timestamp) > new Date(current.timestamp) ? latest : current);

      console.log(`[${new Date().toISOString()}] JCAI 데이터 ${dataToInsert.length}건 업데이트 완료. 최신 JCAI:`, cachedJcaiData.jcai);
    } else {
      console.log(`[${new Date().toISOString()}] 업데이트할 새로운 JCAI 데이터가 없습니다.`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] JCAI 데이터 업데이트 실패:`, error.message);
  }
}

async function initializeJcaiSystem() {
    console.log('JCAI 시스템 초기화를 시작합니다...');
    
    db.get('SELECT COUNT(*) as count FROM jcai_history', async (err, row) => {
        if (err) {
            console.error('JCAI 이력 확인 중 오류 발생:', err.message);
            return;
        }
        
        const mode = process.env.DATA_MODE || 'random';
        
        if (row.count === 0) {
            console.log('JCAI 이력이 비어있습니다. 초기 데이터로 채웁니다.');
            if (mode === 'json') {
                // JSON 모드에서는 초기 그래프 데이터를 로드
                await loadInitialJsonData();
            } else {
                // 다른 모드에서는 기존 방식 사용
                await updateLatestJcai();
            }
        } else if (mode === 'api') {
            // API 모드에서는 기존 데이터가 있어도 최신 24시간 데이터로 업데이트
            console.log(`기존 JCAI 이력 ${row.count}건이 존재합니다. API 모드이므로 최신 24시간 데이터로 업데이트합니다.`);
            await updateLatestJcai();
        } else if (mode === 'json') {
            // JSON 모드에서는 기존 데이터를 지우고 새로운 초기 데이터로 채움
            console.log(`기존 JCAI 이력 ${row.count}건이 존재합니다. JSON 모드이므로 초기 그래프 데이터로 다시 로드합니다.`);
            // 기존 데이터 삭제
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM jcai_history', function(err) {
                    if (err) {
                        console.error('기존 JCAI 데이터 삭제 오류:', err.message);
                        reject(err);
                    } else {
                        console.log('기존 JCAI 데이터가 삭제되었습니다.');
                        resolve();
                    }
                });
            });
            // 새로운 초기 데이터 로드
            await loadInitialJsonData();
        } else {
            console.log(`기존 JCAI 이력 ${row.count}건이 존재합니다.`);
            // 가장 최신 데이터로 캐시 업데이트
            db.get('SELECT * FROM jcai_history ORDER BY created_at DESC LIMIT 1', (err, latest) => {
                if (latest) {
                    cachedJcaiData = { jcai: latest.value, pm25: latest.pm25, pm10: latest.pm10, timestamp: new Date(latest.created_at) };
                    console.log('최신 JCAI 데이터로 캐시를 업데이트했습니다.', cachedJcaiData.jcai);
                }
            });
        }
    });

    // 모드별 자동 업데이트 설정
    if (process.env.DATA_MODE === 'json') {
        // JSON 모드: 환경 변수에서 설정된 간격으로 업데이트 (기본값: 10초)
        const updateInterval = parseInt(process.env.JSON_UPDATE_INTERVAL) || 10000;
        setInterval(updateLatestJcai, updateInterval);
        console.log(`JCAI 시스템 초기화 완료. JSON 모드에서 ${updateInterval / 1000}초마다 자동 업데이트됩니다.`);
    } else {
        // API/Random 모드: 1시간마다 업데이트
        setInterval(updateLatestJcai, ONE_HOUR_IN_MS);
        console.log(`JCAI 시스템 초기화 완료. ${ONE_HOUR_IN_MS / 1000 / 60}분마다 자동 업데이트됩니다.`);
    }
}

// --- 데이터베이스 설정 ---
const db = new sqlite3.Database('./airtrader.db', (err) => {
  if (err) {
    return console.error('데이터베이스 연결 오류:', err.message);
  }
  console.log('SQLite 데이터베이스에 연결되었습니다.');
  initializeDatabase(() => {
    // DB 초기화 후 JCAI 시스템 시작
    initializeJcaiSystem();
  });
});

function initializeDatabase(callback) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      eco_credits INTEGER DEFAULT 1000000,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      jcai_amount INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS futures_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      contract_size INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      margin_amount REAL NOT NULL,
      leverage INTEGER NOT NULL,
      position_type TEXT NOT NULL,
      liquidation_price REAL NOT NULL,
      expiry_time TIMESTAMP NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      profit_loss REAL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      contract_size INTEGER NOT NULL,
      price REAL NOT NULL,
      margin_amount REAL NOT NULL,
      leverage INTEGER NOT NULL,
      total_value REAL NOT NULL,
      profit_loss REAL DEFAULT 0,
      expiry_time TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    
    // 기존 테이블에 profit_loss 컬럼이 없는 경우 추가
    db.run(`ALTER TABLE transactions ADD COLUMN profit_loss REAL DEFAULT 0`, (err) => {
      // 컬럼이 이미 존재하는 경우 에러가 발생하지만 무시
    });
    db.run(`CREATE TABLE IF NOT EXISTS jcai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value REAL NOT NULL,
      pm25 REAL NOT NULL,
      pm10 REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS board_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      profit_amount REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS board_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES board_posts (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`, () => {
        console.log('데이터베이스 테이블이 초기화되었습니다.');
        callback();
    });
  });
}

// --- API 엔드포인트 ---
app.get('/api/jcai', (req, res) => {
  if (cachedJcaiData) {
    res.json(cachedJcaiData);
  } else {
    res.status(503).json({ error: 'JCAI 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.' });
  }
});

app.get('/api/jcai/history', (req, res) => {
  const mode = process.env.DATA_MODE || 'random';
  
  let query;
  if (mode === 'json') {
    // JSON 모드에서는 모든 데이터를 반환 (최대 50개)
    query = `SELECT created_at as hour, value FROM jcai_history ORDER BY created_at ASC LIMIT 50`;
  } else {
    // 다른 모드에서는 24시간 데이터를 시간별로 그룹화
    query = `SELECT strftime('%Y-%m-%d %H:00:00', created_at) as hour, AVG(value) as value FROM jcai_history WHERE created_at >= datetime('now', '-24 hours') GROUP BY hour ORDER BY hour ASC`;
  }
  
  db.all(query, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '기록 조회 중 오류 발생' });
    }
    res.json(rows);
  });
});

// JSON 모드 테스트용 수동 업데이트 엔드포인트
app.post('/api/jcai/update', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] 수동 JCAI 데이터 업데이트 요청`);
    await updateLatestJcai();
    res.json({ success: true, message: 'JCAI 데이터가 업데이트되었습니다.' });
  } catch (error) {
    console.error('수동 업데이트 중 오류:', error);
    res.status(500).json({ error: '업데이트 중 오류가 발생했습니다.' });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: '인증 토큰이 필요합니다.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    req.user = user;
    next();
  });
};

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호가 필요합니다.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
        }
        return res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
      }
      const userId = this.lastID;
      db.run('INSERT INTO holdings (user_id) VALUES (?)', [userId], (err) => {
        if (err) {
          return res.status(500).json({ error: '사용자 자산 초기화 중 오류가 발생했습니다.' });
        }
        res.status(201).json({ message: '회원가입이 완료되었습니다.' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호가 필요합니다.' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
    }
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    try {
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      }
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        message: '로그인 성공',
        token,
        user: {
          id: user.id,
          email: user.email,
          eco_credits: user.eco_credits
        }
      });
    } catch (error) {
      res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
    }
  });
});

app.get('/api/portfolio', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT eco_credits FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
    }
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다. 다시 로그인해주세요.' });
    }
    db.get('SELECT jcai_amount, avg_price FROM holdings WHERE user_id = ?', [userId], (err, holdings) => {
      if (err) {
        return res.status(500).json({ error: '보유 자산 조회 중 오류가 발생했습니다.' });
      }
      db.all('SELECT * FROM futures_contracts WHERE user_id = ? AND is_active = 1', [userId], (err, futuresContracts) => {
        if (err) {
          return res.status(500).json({ error: '선물 계약 조회 중 오류가 발생했습니다.' });
        }
        
        // 총 손익 계산 (거래 내역에서 profit_loss 합계)
        db.get('SELECT SUM(profit_loss) as total_profit_loss FROM transactions WHERE user_id = ?', [userId], (err, profitResult) => {
          if (err) {
            return res.status(500).json({ error: '손익 계산 중 오류가 발생했습니다.' });
          }
          
          const totalProfitLoss = profitResult ? (profitResult.total_profit_loss || 0) : 0;
          
          res.json({
            eco_credits: user.eco_credits,
            holdings: holdings || { jcai_amount: 0, avg_price: 0 },
            futures_contracts: futuresContracts || [],
            total_profit_loss: totalProfitLoss
          });
        });
      });
    });
  });
});

app.post('/api/futures/create', authenticateToken, (req, res) => {
  const { contractSize, price, leverage, positionType, expiryHours } = req.body;
  const userId = req.user.id;
  const totalValue = contractSize * price;
  const marginAmount = totalValue / leverage;
  let liquidationPrice;
  if (positionType === 'long') {
    liquidationPrice = price - (price / leverage) * 0.9;
  } else {
    liquidationPrice = price + (price / leverage) * 0.9;
  }
  const now = new Date();
  const expiryTime = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
  db.get('SELECT eco_credits FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    if (user.eco_credits < marginAmount) {
      return res.status(400).json({ error: '증거금으로 사용할 에코 크레딧이 부족합니다.' });
    }
    db.serialize(() => {
      db.run('UPDATE users SET eco_credits = eco_credits - ? WHERE id = ?', [marginAmount, userId]);
      db.run(
        'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value, profit_loss, expiry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, positionType, contractSize, price, marginAmount, leverage, totalValue, 0, expiryTime.toISOString()]
      );
      db.run(
        'INSERT INTO futures_contracts (user_id, contract_size, entry_price, margin_amount, leverage, position_type, liquidation_price, expiry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, contractSize, price, marginAmount, leverage, positionType, liquidationPrice, expiryTime.toISOString()],
        function(err) {
          if (err) {
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
          }
          res.json({
            success: true,
            message: `${contractSize} JCAI의 ${positionType} 포지션을 생성했습니다.`,
            contract: { id: this.lastID, type: positionType, contractSize, price, marginAmount, leverage, liquidationPrice, expiryTime, totalValue }
          });
        }
      );
    });
  });
});

app.post('/api/futures/close', authenticateToken, (req, res) => {
  const { contractId, currentPrice } = req.body;
  const userId = req.user.id;
  db.get(
    'SELECT * FROM futures_contracts WHERE id = ? AND user_id = ? AND is_active = 1',
    [contractId, userId],
    (err, contract) => {
      if (err) {
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }
      if (!contract) {
        return res.status(404).json({ error: '해당 계약을 찾을 수 없습니다.' });
      }
      let profitLoss;
      if (contract.position_type === 'long') {
        profitLoss = (currentPrice - contract.entry_price) * contract.contract_size;
      } else {
        profitLoss = (contract.entry_price - currentPrice) * contract.contract_size;
      }
      db.serialize(() => {
        db.run(
          'UPDATE futures_contracts SET is_active = 0, closed_at = CURRENT_TIMESTAMP, profit_loss = ? WHERE id = ?',
          [profitLoss, contractId]
        );
        db.run(
          'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value, profit_loss) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, contract.position_type + '_close', contract.contract_size, currentPrice, contract.margin_amount, contract.leverage, contract.contract_size * currentPrice, profitLoss]
        );
        const returnAmount = Math.max(0, contract.margin_amount + profitLoss);
        db.run(
          'UPDATE users SET eco_credits = eco_credits + ? WHERE id = ?',
          [returnAmount, userId]
        );
        res.json({
          success: true,
          message: `${contract.contract_size} JCAI의 ${contract.position_type} 포지션을 청산했습니다.`,
          transaction: { type: contract.position_type + '_close', contractSize: contract.contract_size, price: currentPrice, profitLoss, returnedCredits: returnAmount }
        });
      });
    }
  );
});

// 거래 내역 조회
app.get('/api/transactions', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.all(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [userId],
    (err, transactions) => {
      if (err) {
        return res.status(500).json({ error: '거래 내역 조회 중 오류가 발생했습니다.' });
      }
      
      res.json(transactions);
    }
  );
});

// === 게시판 API ===

// 게시글 목록 조회
app.get('/api/board/posts', authenticateToken, (req, res) => {
  db.all(`
    SELECT bp.*, u.email as user_email 
    FROM board_posts bp 
    JOIN users u ON bp.user_id = u.id 
    ORDER BY bp.created_at DESC
  `, (err, posts) => {
    if (err) {
      return res.status(500).json({ error: '게시글 조회 중 오류가 발생했습니다.' });
    }
    res.json(posts);
  });
});

// 게시글 작성
app.post('/api/board/posts', authenticateToken, (req, res) => {
  const { title, content, profit_amount } = req.body;
  const userId = req.user.id;
  
  if (!title || !content) {
    return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
  }
  
  db.run(
    'INSERT INTO board_posts (user_id, title, content, profit_amount) VALUES (?, ?, ?, ?)',
    [userId, title, content, profit_amount || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '게시글 작성 중 오류가 발생했습니다.' });
      }
      res.json({ id: this.lastID, message: '게시글이 성공적으로 작성되었습니다.' });
    }
  );
});

// 댓글 목록 조회
app.get('/api/board/posts/:postId/comments', authenticateToken, (req, res) => {
  const postId = req.params.postId;
  
  db.all(`
    SELECT bc.*, u.email as user_email 
    FROM board_comments bc 
    JOIN users u ON bc.user_id = u.id 
    WHERE bc.post_id = ? 
    ORDER BY bc.created_at ASC
  `, [postId], (err, comments) => {
    if (err) {
      return res.status(500).json({ error: '댓글 조회 중 오류가 발생했습니다.' });
    }
    res.json(comments);
  });
});

// 댓글 작성
app.post('/api/board/posts/:postId/comments', authenticateToken, (req, res) => {
  const { content } = req.body;
  const postId = req.params.postId;
  const userId = req.user.id;
  
  if (!content) {
    return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
  }
  
  db.run(
    'INSERT INTO board_comments (post_id, user_id, content) VALUES (?, ?, ?)',
    [postId, userId, content],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
      }
      res.json({ id: this.lastID, message: '댓글이 성공적으로 작성되었습니다.' });
    }
  );
});

// 게시글 삭제
app.delete('/api/board/posts/:postId', authenticateToken, (req, res) => {
  const postId = req.params.postId;
  const userId = req.user.id;
  
  // 먼저 게시글이 존재하고 작성자가 맞는지 확인
  db.get(
    'SELECT user_id FROM board_posts WHERE id = ?',
    [postId],
    (err, post) => {
      if (err) {
        return res.status(500).json({ error: '게시글 조회 중 오류가 발생했습니다.' });
      }
      
      if (!post) {
        return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
      }
      
      if (post.user_id !== userId) {
        return res.status(403).json({ error: '자신의 게시글만 삭제할 수 있습니다.' });
      }
      
      // 먼저 해당 게시글의 모든 댓글 삭제
      db.run(
        'DELETE FROM board_comments WHERE post_id = ?',
        [postId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' });
          }
          
          // 게시글 삭제
          db.run(
            'DELETE FROM board_posts WHERE id = ?',
            [postId],
            function(err) {
              if (err) {
                return res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
              }
              
              res.json({ message: '게시글이 성공적으로 삭제되었습니다.' });
            }
          );
        }
      );
    }
  );
});

// 댓글 삭제
app.delete('/api/board/posts/:postId/comments/:commentId', authenticateToken, (req, res) => {
  const commentId = req.params.commentId;
  const userId = req.user.id;
  
  // 먼저 댓글이 존재하고 작성자가 맞는지 확인
  db.get(
    'SELECT user_id FROM board_comments WHERE id = ?',
    [commentId],
    (err, comment) => {
      if (err) {
        return res.status(500).json({ error: '댓글 조회 중 오류가 발생했습니다.' });
      }
      
      if (!comment) {
        return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
      }
      
      if (comment.user_id !== userId) {
        return res.status(403).json({ error: '자신의 댓글만 삭제할 수 있습니다.' });
      }
      
      // 댓글 삭제
      db.run(
        'DELETE FROM board_comments WHERE id = ?',
        [commentId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' });
          }
          
          res.json({ message: '댓글이 성공적으로 삭제되었습니다.' });
        }
      );
    }
  );
});

// === 마이페이지 API ===

// 사용자 정보 조회
app.get('/api/user/info', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.get(`
    SELECT u.eco_credits, h.jcai_amount, h.avg_price 
    FROM users u 
    LEFT JOIN holdings h ON u.id = h.user_id 
    WHERE u.id = ?
  `, [userId], (err, userInfo) => {
    if (err) {
      return res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
    }
    
    res.json({
      eco_credits: userInfo?.eco_credits || 0,
      jcai_amount: userInfo?.jcai_amount || 0,
      avg_price: userInfo?.avg_price || 0
    });
  });
});

// 메인화면 거래내역 제한 (10개)
app.get('/api/transactions/recent', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.all(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
    [userId],
    (err, transactions) => {
      if (err) {
        return res.status(500).json({ error: '거래 내역 조회 중 오류가 발생했습니다.' });
      }
      
      res.json(transactions);
    }
  );
});

// === 뉴스 API ===

// 전북 대기질 관련 뉴스 조회 (모의 데이터)
app.get('/api/news/air-quality', (req, res) => {
  // 실제 환경에서는 뉴스 API나 크롤링을 통해 데이터를 가져옵니다
  const mockNews = [
    {
      id: 1,
      title: "전북 미세먼지 농도 '나쁨' 수준, 외출 시 마스크 착용 권고",
      summary: "전라북도 지역의 미세먼지 농도가 나쁨 수준을 기록하며 시민들의 주의가 요구됩니다.",
      url: "#",
      publishedAt: new Date().toISOString(),
      source: "전북일보"
    },
    {
      id: 2,
      title: "전주시, 대기질 개선을 위한 친환경 교통정책 발표",
      summary: "전주시가 대기질 개선을 위해 전기버스 확대 및 자전거 도로 확충 계획을 발표했습니다.",
      url: "#",
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      source: "KBS전주"
    },
    {
      id: 3,
      title: "익산시 대기질 측정소 신설, 실시간 모니터링 강화",
      summary: "익산시가 대기질 개선을 위해 새로운 측정소를 설치하여 실시간 모니터링을 강화합니다.",
      url: "#",
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      source: "전북도민일보"
    },
    {
      id: 4,
      title: "전북도, 미세먼지 저감 위한 산업체 협력 방안 논의",
      summary: "전라북도가 지역 산업체와 함께 미세먼지 저감을 위한 협력 방안을 논의했습니다.",
      url: "#",
      publishedAt: new Date(Date.now() - 10800000).toISOString(),
      source: "연합뉴스"
    },
    {
      id: 5,
      title: "군산시 대기질 개선 효과, 작년 대비 20% 향상",
      summary: "군산시의 대기질이 작년 대비 20% 개선되어 시민들의 건강한 생활환경 조성에 기여하고 있습니다.",
      url: "#",
      publishedAt: new Date(Date.now() - 14400000).toISOString(),
      source: "새전북신문"
    }
  ];
  
  res.json(mockNews);
});

// --- 서버 시작 ---
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
