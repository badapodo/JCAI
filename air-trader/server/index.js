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
try {
  demoData = JSON.parse(fs.readFileSync('./demo-data.json', 'utf-8'));
} catch (err) {
  console.error("demo-data.json 파일을 읽을 수 없습니다. JSON 모드가 동작하지 않을 수 있습니다.", err);
}
let demoDataIndex = 0;

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
      // JSON 모드는 현재 단일 데이터 포인트만 지원하므로, 필요시 수정이 필요합니다.
      if (demoData.length > 0) {
        const data = demoData[demoDataIndex];
        demoDataIndex = (demoDataIndex + 1) % demoData.length;
        dataToInsert.push({
            jcai: data.jcai,
            pm25: data.pm25,
            pm10: data.pm10,
            timestamp: new Date(data.timestamp).toISOString()
        });
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
        
        if (row.count === 0) {
            console.log('JCAI 이력이 비어있습니다. 과거 24시간 데이터로 채웁니다.');
            await updateLatestJcai(); // DB가 비어있을 때만 즉시 업데이트
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

    setInterval(updateLatestJcai, ONE_HOUR_IN_MS);
    console.log(`JCAI 시스템 초기화 완료. ${ONE_HOUR_IN_MS / 1000 / 60}분마다 자동 업데이트됩니다.`);
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
      expiry_time TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS jcai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value REAL NOT NULL,
      pm25 REAL NOT NULL,
      pm10 REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  db.all(`SELECT strftime('%Y-%m-%d %H:00:00', created_at) as hour, AVG(value) as value FROM jcai_history WHERE created_at >= datetime('now', '-24 hours') GROUP BY hour ORDER BY hour ASC`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '기록 조회 중 오류 발생' });
    }
    res.json(rows);
  });
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
        res.json({
          eco_credits: user.eco_credits,
          holdings: holdings || { jcai_amount: 0, avg_price: 0 },
          futures_contracts: futuresContracts || []
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
        'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value, expiry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, positionType, contractSize, price, marginAmount, leverage, totalValue, expiryTime.toISOString()]
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
          'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, contract.position_type + '_close', contract.contract_size, currentPrice, contract.margin_amount, contract.leverage, contract.contract_size * currentPrice]
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

// --- 서버 시작 ---
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
