const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'air_trader_secret_key';

// 미들웨어
// CORS 설정
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

// 데이터베이스 설정
const db = new sqlite3.Database('./airtrader.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
  } else {
    console.log('SQLite 데이터베이스에 연결되었습니다.');
    initializeDatabase();
  }
});

// 데이터베이스 초기화
function initializeDatabase() {
  // 사용자 테이블
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    eco_credits INTEGER DEFAULT 1000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 선물 계약 테이블
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

  // 거래 내역 테이블
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

  // JCAI 지수 이력 테이블
  db.run(`CREATE TABLE IF NOT EXISTS jcai_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value REAL NOT NULL,
    pm25 REAL NOT NULL,
    pm10 REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('데이터베이스 테이블이 초기화되었습니다.');
}

// 인증 미들웨어
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

// 회원가입 API
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
      
      // 사용자의 JCAI 보유량 초기화
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

// 로그인 API
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

// JCAI 지수 계산 및 저장 API
app.get('/api/jcai', (req, res) => {
  // 해커톤 MVP에서는 임의의 데이터 사용
  const mockPM25 = Math.random() * 30 + 10; // 10~40 사이 값
  const mockPM10 = Math.random() * 50 + 20; // 20~70 사이 값
  
  // JCAI 가격 = 10000 - (전북 평균 PM2.5 농도 * 1.5 + 전북 평균 PM10 농도)
  const jcaiValue = Math.round(10000 - (mockPM25 * 1.5 + mockPM10));
  
  // JCAI 지수 이력 저장
  db.run(
    `INSERT INTO jcai_history (value, pm25, pm10) VALUES (?, ?, ?)`,
    [jcaiValue, Math.round(mockPM25 * 10) / 10, Math.round(mockPM10)],
    function(err) {
      if (err) {
        console.error('JCAI 지수 저장 오류:', err.message);
      }
    }
  );
  
  res.json({
    jcai: jcaiValue,
    pm25: Math.round(mockPM25 * 10) / 10,
    pm10: Math.round(mockPM10),
    timestamp: new Date()
  });
});

// 사용자 자산 정보 조회
app.get('/api/portfolio', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.get('SELECT eco_credits FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
    }
    
    db.get('SELECT jcai_amount, avg_price FROM holdings WHERE user_id = ?', [userId], (err, holdings) => {
      if (err) {
        return res.status(500).json({ error: '보유 자산 조회 중 오류가 발생했습니다.' });
      }
      
      db.all('SELECT * FROM short_positions WHERE user_id = ? AND is_active = 1', [userId], (err, shortPositions) => {
        if (err) {
          return res.status(500).json({ error: '공매도 포지션 조회 중 오류가 발생했습니다.' });
        }
        
        res.json({
          eco_credits: user.eco_credits,
          holdings: holdings || { jcai_amount: 0, avg_price: 0 },
          short_positions: shortPositions || []
        });
      });
    });
  });
});

// 선물 계약 생성 API
app.post('/api/futures/create', authenticateToken, (req, res) => {
  const { contractSize, price, leverage, positionType, expiryHours } = req.body;
  const userId = req.user.id;
  
  // 계약 총 가치
  const totalValue = contractSize * price;
  
  // 필요한 증거금 계산 (레버리지에 따라 다름)
  const marginAmount = totalValue / leverage;
  
  // 청산 가격 계산
  let liquidationPrice;
  if (positionType === 'long') {
    // 롱 포지션의 경우: 진입가격 - (진입가격 / 레버리지) * 0.9
    liquidationPrice = price - (price / leverage) * 0.9;
  } else {
    // 숏 포지션의 경우: 진입가격 + (진입가격 / 레버리지) * 0.9
    liquidationPrice = price + (price / leverage) * 0.9;
  }
  
  // 만기 시간 계산 (현재 시간 + expiryHours)
  const now = new Date();
  const expiryTime = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
  
  // 사용자 자산 확인
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

    // 트랜잭션 시작
    db.serialize(() => {
      // 증거금 차감
      db.run('UPDATE users SET eco_credits = eco_credits - ? WHERE id = ?', [marginAmount, userId]);

      // 거래 내역 추가
      db.run(
        'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value, expiry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, positionType, contractSize, price, marginAmount, leverage, totalValue, expiryTime.toISOString()]
      );

      // 선물 계약 추가
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
            contract: {
              id: this.lastID,
              type: positionType,
              contractSize,
              price,
              marginAmount,
              leverage,
              liquidationPrice,
              expiryTime,
              totalValue
            }
          });
        }
      );
    });
  });
});

// 선물 계약 청산 API
app.post('/api/futures/close', authenticateToken, (req, res) => {
  const { contractId, currentPrice } = req.body;
  const userId = req.user.id;

  // 선물 계약 확인
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

      // 손익 계산
      let profitLoss;
      if (contract.position_type === 'long') {
        // 롱 포지션: (현재가격 - 진입가격) * 계약 크기
        profitLoss = (currentPrice - contract.entry_price) * contract.contract_size;
      } else {
        // 숏 포지션: (진입가격 - 현재가격) * 계약 크기
        profitLoss = (contract.entry_price - currentPrice) * contract.contract_size;
      }

      // 트랜잭션 시작
      db.serialize(() => {
        // 계약 비활성화
        db.run(
          'UPDATE futures_contracts SET is_active = 0, closed_at = CURRENT_TIMESTAMP, profit_loss = ? WHERE id = ?',
          [profitLoss, contractId]
        );

        // 거래 내역 추가
        db.run(
          'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, contract.position_type + '_close', contract.contract_size, currentPrice, contract.margin_amount, contract.leverage, contract.contract_size * currentPrice]
        );

        // 에코 크레딧 반환 (증거금 + 손익)
        const returnAmount = Math.max(0, contract.margin_amount + profitLoss); // 손실이 증거금을 초과하지 않도록
        db.run(
          'UPDATE users SET eco_credits = eco_credits + ? WHERE id = ?',
          [returnAmount, userId]
        );

        res.json({
          success: true,
          message: `${contract.contract_size} JCAI의 ${contract.position_type} 포지션을 청산했습니다.`,
          transaction: {
            type: contract.position_type + '_close',
            contractSize: contract.contract_size,
            price: currentPrice,
            profitLoss,
            returnedCredits: returnAmount
          }
        });
      });
    }
  );
});

// 강제 청산 API (시스템 내부 호출용)
app.post('/api/futures/liquidate', (req, res) => {
  const { contractId, currentPrice } = req.body;
  
  // 선물 계약 확인
  db.get(
    'SELECT * FROM futures_contracts WHERE id = ? AND is_active = 1',
    [contractId],
    (err, contract) => {
      if (err) {
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (!contract) {
        return res.status(404).json({ error: '해당 계약을 찾을 수 없습니다.' });
      }

      const userId = contract.user_id;
      
      // 손익 계산 (강제 청산의 경우 증거금 전액 손실)
      const profitLoss = -contract.margin_amount;

      // 트랜잭션 시작
      db.serialize(() => {
        // 계약 비활성화
        db.run(
          'UPDATE futures_contracts SET is_active = 0, closed_at = CURRENT_TIMESTAMP, profit_loss = ? WHERE id = ?',
          [profitLoss, contractId]
        );

        // 거래 내역 추가
        db.run(
          'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, 'liquidation', contract.contract_size, currentPrice, contract.margin_amount, contract.leverage, contract.contract_size * currentPrice]
        );

        res.json({
          success: true,
          message: `${contract.contract_size} JCAI의 ${contract.position_type} 포지션이 강제 청산되었습니다.`,
          transaction: {
            type: 'liquidation',
            contractSize: contract.contract_size,
            price: currentPrice,
            profitLoss
          }
        });
      });
    }
  );
});

// 만기 청산 API (시스템 내부 호출용)
app.post('/api/futures/expire', (req, res) => {
  const { contractId, currentPrice } = req.body;
  
  // 선물 계약 확인
  db.get(
    'SELECT * FROM futures_contracts WHERE id = ? AND is_active = 1',
    [contractId],
    (err, contract) => {
      if (err) {
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (!contract) {
        return res.status(404).json({ error: '해당 계약을 찾을 수 없습니다.' });
      }

      const userId = contract.user_id;
      
      // 손익 계산
      let profitLoss;
      if (contract.position_type === 'long') {
        profitLoss = (currentPrice - contract.entry_price) * contract.contract_size;
      } else {
        profitLoss = (contract.entry_price - currentPrice) * contract.contract_size;
      }

      // 트랜잭션 시작
      db.serialize(() => {
        // 계약 비활성화
        db.run(
          'UPDATE futures_contracts SET is_active = 0, closed_at = CURRENT_TIMESTAMP, profit_loss = ? WHERE id = ?',
          [profitLoss, contractId]
        );

        // 거래 내역 추가
        db.run(
          'INSERT INTO transactions (user_id, type, contract_size, price, margin_amount, leverage, total_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, 'expiry', contract.contract_size, currentPrice, contract.margin_amount, contract.leverage, contract.contract_size * currentPrice]
        );

        // 에코 크레딧 반환 (증거금 + 손익)
        const returnAmount = Math.max(0, contract.margin_amount + profitLoss); // 손실이 증거금을 초과하지 않도록
        db.run(
          'UPDATE users SET eco_credits = eco_credits + ? WHERE id = ?',
          [returnAmount, userId]
        );

        res.json({
          success: true,
          message: `${contract.contract_size} JCAI의 ${contract.position_type} 포지션이 만기 청산되었습니다.`,
          transaction: {
            type: 'expiry',
            contractSize: contract.contract_size,
            price: currentPrice,
            profitLoss,
            returnedCredits: returnAmount
          }
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

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});