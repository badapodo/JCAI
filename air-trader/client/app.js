// API 기본 URL
const API_BASE_URL = 'http://localhost:5001/api';

// DOM 요소
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');

// 선물 계약 관련 요소
const contractSize = document.getElementById('contract-size');
const tradePrice = document.getElementById('trade-price');
const leverage = document.getElementById('leverage');
const expiryHours = document.getElementById('expiry-hours');
const marginAmount = document.getElementById('margin-amount');
const liquidationPrice = document.getElementById('liquidation-price');
const contractCreateBtn = document.getElementById('contract-create-btn');
const positionLong = document.getElementById('position-long');
const positionShort = document.getElementById('position-short');

// 자산 정보 요소
const ecoCredits = document.getElementById('eco-credits');
const jcaiHoldings = document.getElementById('jcai-holdings');
const avgPrice = document.getElementById('avg-price');
const avgPriceContainer = document.getElementById('avg-price-container');

// JCAI 지수 요소
const jcaiValue = document.getElementById('jcai-value');
const pm25Value = document.getElementById('pm25-value');
const pm10Value = document.getElementById('pm10-value');

// 포지션 관련 요소
const noPositions = document.getElementById('no-positions');
const positionsList = document.getElementById('positions-list');
const positionsTableBody = document.getElementById('positions-table-body');

// 거래 내역 요소
const transactionsTableBody = document.getElementById('transactions-table-body');

// 차트 관련 변수
let jcaiChart;
const chartData = {
  labels: [],
  values: []
};

// 현재 JCAI 값
let currentJcai = 0;

// 인증 관련 함수
function checkAuth() {
  const token = localStorage.getItem('token');
  if (token) {
    authContainer.style.display = 'none';
    dashboardContainer.style.display = 'block';
    const user = JSON.parse(localStorage.getItem('user'));
    userEmail.textContent = user.email;
    loadDashboard();
  } else {
    authContainer.style.display = 'block';
    dashboardContainer.style.display = 'none';
  }
}

async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '로그인 중 오류가 발생했습니다.');
    }
    
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    checkAuth();
    return data;
  } catch (error) {
    alert(error.message);
    throw error;
  }
}

async function register(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '회원가입 중 오류가 발생했습니다.');
    }
    
    alert('회원가입이 완료되었습니다. 로그인해주세요.');
    loginTab.click();
    return data;
  } catch (error) {
    alert(error.message);
    throw error;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  checkAuth();
}

// API 호출 함수
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    checkAuth();
    throw new Error('인증이 필요합니다.');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
    }
    
    return data;
  } catch (error) {
    console.error('API 호출 오류:', error);
    if (error.message === 'Failed to fetch') {
      alert('서버에 연결할 수 없습니다.');
    } else {
      alert(error.message);
    }
    throw error;
  }
}

// 대시보드 데이터 로드
async function loadDashboard() {
  try {
    // JCAI 지수 로드
    await fetchJcai();
    
    // 포트폴리오 정보 로드
    await fetchPortfolio();
    
    // 거래 내역 로드
    await fetchTransactions();
    
    // 차트 초기화
    initChart();
    
    // 주기적으로 데이터 업데이트
    setInterval(fetchJcai, 5000);
    setInterval(fetchPortfolio, 10000);
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
  }
}

// JCAI 지수 조회
async function fetchJcai() {
  try {
    const data = await fetch(`${API_BASE_URL}/jcai`).then(res => res.json());
    
    currentJcai = data.jcai;
    
    // UI 업데이트
    jcaiValue.textContent = currentJcai.toLocaleString();
    pm25Value.textContent = data.pm25;
    pm10Value.textContent = data.pm10;
    
    // 선물 계약 가격 업데이트
    tradePrice.value = currentJcai;
    
    // 증거금 및 청산가 업데이트
    updateMarginAndLiquidation();
    
    // 차트 데이터 업데이트
    updateChartData(data.jcai);
    
    return data;
  } catch (error) {
    console.error('JCAI 조회 오류:', error);
    throw error;
  }
}

// 포트폴리오 정보 조회
async function fetchPortfolio() {
  try {
    const data = await fetchWithAuth(`${API_BASE_URL}/portfolio`);
    
    // 에코 크레딧 업데이트
    ecoCredits.textContent = data.eco_credits.toLocaleString();
    
    // 선물 계약 포지션 업데이트
    updatePositions(data.futures_contracts || []);
    
    return data;
  } catch (error) {
    console.error('포트폴리오 조회 오류:', error);
    throw error;
  }
}

// 선물 계약 포지션 업데이트
function updatePositions(positions) {
  if (positions.length === 0) {
    noPositions.style.display = 'block';
    positionsList.style.display = 'none';
    return;
  }
  
  noPositions.style.display = 'none';
  positionsList.style.display = 'block';
  
  // 테이블 초기화
  positionsTableBody.innerHTML = '';
  
  positions.forEach(position => {
    const row = document.createElement('tr');
    
    // 수익/손실 계산
    let profitLoss;
    if (position.position_type === 'long') {
      profitLoss = (currentJcai - position.entry_price) * position.contract_size;
    } else {
      profitLoss = (position.entry_price - currentJcai) * position.contract_size;
    }
    
    const profitLossClass = profitLoss >= 0 ? 'text-success' : 'text-danger';
    
    // 만기 시간 포맷팅
    const expiryTime = new Date(position.expiry_time);
    const formattedExpiryTime = expiryTime.toLocaleString();
    
    row.innerHTML = `
      <td>${position.position_type === 'long' ? '롱' : '숏'}</td>
      <td>${position.contract_size}</td>
      <td>${position.entry_price.toLocaleString()}</td>
      <td>${position.leverage}x</td>
      <td>${position.liquidation_price.toLocaleString()}</td>
      <td>${formattedExpiryTime}</td>
      <td>${currentJcai.toLocaleString()}</td>
      <td class="${profitLossClass}">${profitLoss.toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-warning close-position" data-id="${position.id}">청산</button>
      </td>
    `;
    
    positionsTableBody.appendChild(row);
  });
  
  // 청산 버튼 이벤트 리스너 추가
  document.querySelectorAll('.close-position').forEach(button => {
    button.addEventListener('click', async (e) => {
      const contractId = e.target.dataset.id;
      
      try {
        await fetchWithAuth(`${API_BASE_URL}/futures/close`, {
          method: 'POST',
          body: JSON.stringify({ contractId, currentPrice: currentJcai })
        });
        
        alert('선물 계약이 청산되었습니다.');
        
        // 포트폴리오 정보 갱신
        await fetchPortfolio();
        
        // 거래 내역 갱신
        await fetchTransactions();
      } catch (error) {
        console.error('계약 청산 오류:', error);
      }
    });
  });
}

// 거래 내역 조회
async function fetchTransactions() {
  try {
    const data = await fetchWithAuth(`${API_BASE_URL}/transactions`);
    
    // UI 업데이트
    transactionsTableBody.innerHTML = '';
    
    data.forEach(tx => {
      const row = document.createElement('tr');
      
      const typeMap = {
        'buy': '매수',
        'sell': '매도',
        'short': '공매도',
        'short_close': '공매도 청산'
      };
      
      const date = new Date(tx.created_at);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      row.innerHTML = `
        <td>${formattedDate}</td>
        <td>${typeMap[tx.type] || tx.type}</td>
        <td>${tx.amount.toLocaleString()}</td>
        <td>${tx.price.toLocaleString()}</td>
        <td>${tx.total_value.toLocaleString()}</td>
      `;
      
      transactionsTableBody.appendChild(row);
    });
    
    return data;
  } catch (error) {
    console.error('거래 내역 조회 오류:', error);
    throw error;
  }
}

// 공매도 포지션 업데이트
function updateShortPositions(positions) {
  if (positions.length === 0) {
    noPositions.style.display = 'block';
    positionsList.style.display = 'none';
    return;
  }
  
  noPositions.style.display = 'none';
  positionsList.style.display = 'block';
  
  positionsTableBody.innerHTML = '';
  
  positions.forEach(position => {
    const row = document.createElement('tr');
    
    const priceDiff = position.entry_price - currentJcai;
    const profitLoss = priceDiff * position.amount;
    const profitLossClass = profitLoss >= 0 ? 'text-profit' : 'text-loss';
    
    row.innerHTML = `
      <td>${position.amount.toLocaleString()}</td>
      <td>${position.entry_price.toLocaleString()}</td>
      <td>${currentJcai.toLocaleString()}</td>
      <td class="${profitLossClass}">${profitLoss.toLocaleString()}</td>
      <td><button class="btn btn-sm btn-warning close-position" data-id="${position.id}">청산</button></td>
    `;
    
    positionsTableBody.appendChild(row);
  });
  
  // 청산 버튼 이벤트 리스너 추가
  document.querySelectorAll('.close-position').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const positionId = e.target.dataset.id;
      await closeShortPosition(positionId);
    });
  });
}

// 차트 초기화
function initChart() {
  try {
    const canvas = document.getElementById('jcai-chart');
    if (!canvas) {
      console.error('차트 캔버스를 찾을 수 없습니다.');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 차트 데이터 초기화
    chartData.labels = [];
    chartData.values = [];
    
    // 초기 데이터 생성 (24시간 더미 데이터)
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now);
      time.setHours(now.getHours() - i);
      
      chartData.labels.push(time.getHours().toString().padStart(2, '0') + ':00');
      
      // 8000~9000 사이의 랜덤값 (실제로는 API에서 받아와야 함)
      const randomValue = Math.floor(Math.random() * 1000) + 8000;
      chartData.values.push(randomValue);
    }
    
    // 이미 차트가 있으면 파괴
    if (jcaiChart) {
      jcaiChart.destroy();
    }
    
    jcaiChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'JCAI 지수',
          data: chartData.values,
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `JCAI: ${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: function() {
              return Math.min(...chartData.values) - 500;
            },
            max: function() {
              return Math.max(...chartData.values) + 500;
            }
          }
        }
      }
    });
    
    console.log('차트가 성공적으로 초기화되었습니다.');
  } catch (error) {
    console.error('차트 초기화 오류:', error);
  }
}

// 차트 데이터 업데이트
function updateChartData(newValue) {
  try {
    // 현재 시간 가져오기
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    
    // 새 데이터 추가
    chartData.labels.push(`${currentHour}:${currentMinute}`);
    chartData.values.push(newValue);
    
    // 24개 데이터만 유지
    if (chartData.labels.length > 24) {
      chartData.labels.shift();
      chartData.values.shift();
    }
    
    // 차트 업데이트
    if (jcaiChart) {
      jcaiChart.data.labels = chartData.labels;
      jcaiChart.data.datasets[0].data = chartData.values;
      
      // y축 범위 업데이트
      if (jcaiChart.options.scales.y) {
        const minValue = Math.min(...chartData.values) - 500;
        const maxValue = Math.max(...chartData.values) + 500;
        jcaiChart.options.scales.y.min = minValue;
        jcaiChart.options.scales.y.max = maxValue;
      }
      
      jcaiChart.update();
    } else {
      // 차트가 없으면 초기화
      initChart();
    }
  } catch (error) {
    console.error('차트 데이터 업데이트 오류:', error);
    // 오류 발생 시 차트 재초기화 시도
    initChart();
  }
}

// 증거금 및 청산가 계산
contractSize.addEventListener('input', updateMarginAndLiquidation);
leverage.addEventListener('change', updateMarginAndLiquidation);
positionLong.addEventListener('change', updateMarginAndLiquidation);
positionShort.addEventListener('change', updateMarginAndLiquidation);

function updateMarginAndLiquidation() {
  const size = parseFloat(contractSize.value) || 0;
  const price = parseFloat(tradePrice.value) || 0;
  const leverageValue = parseInt(leverage.value) || 1;
  const isLong = positionLong.checked;
  
  // 증거금 계산
  const marginValue = (size * price) / leverageValue;
  marginAmount.value = marginValue.toFixed(2);
  
  // 청산가 계산
  let liquidationValue;
  if (isLong) {
    // 롱 포지션: 진입가격 - (진입가격 / 레버리지) * 0.9
    liquidationValue = price - (price / leverageValue) * 0.9;
  } else {
    // 숏 포지션: 진입가격 + (진입가격 / 레버리지) * 0.9
    liquidationValue = price + (price / leverageValue) * 0.9;
  }
  
  liquidationPrice.value = liquidationValue.toFixed(2);
}

// 선물 계약 생성
async function executeTrade() {
  const contractSizeValue = parseInt(contractSize.value) || 0;
  const price = parseInt(tradePrice.value) || 0;
  const leverageValue = parseInt(leverage.value) || 1;
  const expiryHoursValue = parseInt(expiryHours.value) || 24;
  
  if (contractSizeValue <= 0) {
    alert('계약 크기는 1 이상이어야 합니다.');
    return;
  }
  
  try {
    const positionType = positionLong.checked ? 'long' : 'short';
    
    const data = await fetchWithAuth(`${API_BASE_URL}/futures/create`, {
      method: 'POST',
      body: JSON.stringify({
        contractSize: contractSizeValue,
        price,
        leverage: leverageValue,
        positionType,
        expiryHours: expiryHoursValue
      })
    });
    
    alert(`${contractSizeValue} JCAI의 ${positionType} 포지션이 생성되었습니다.`);
    
    // 데이터 새로고침
    await fetchPortfolio();
    await fetchTransactions();
    
    return data;
  } catch (error) {
    console.error('계약 생성 오류:', error);
    throw error;
  }
}

// 공매도 포지션 청산
async function closeShortPosition(positionId) {
  try {
    const data = await fetchWithAuth(`${API_BASE_URL}/trade/short/${positionId}/close`, {
      method: 'POST',
      body: JSON.stringify({ current_price: currentJcai })
    });
    
    alert(`공매도 포지션이 청산되었습니다. 손익: ${data.profit_loss.toLocaleString()} EC`);
    
    // 데이터 새로고침
    await fetchPortfolio();
    await fetchTransactions();
    
    return data;
  } catch (error) {
    console.error('공매도 청산 오류:', error);
    throw error;
  }
}

// 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
  // 인증 상태 확인
  checkAuth();
  
  // 로그인 폼 제출
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    await login(email, password);
  });
  
  // 회원가입 폼 제출
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    
    if (password !== passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    await register(email, password);
  });
  
  // 로그아웃 버튼
  logoutBtn.addEventListener('click', logout);
  
  // 탭 전환
  loginTab.addEventListener('click', (e) => {
    e.preventDefault();
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });
  
  registerTab.addEventListener('click', (e) => {
    e.preventDefault();
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  });
  
  // 포지션 유형 변경
positionLong.addEventListener('change', () => {
  contractCreateBtn.textContent = '롱 포지션 생성';
  contractCreateBtn.className = 'btn btn-success btn-trade';
  updateMarginAndLiquidation();
});

positionShort.addEventListener('change', () => {
  contractCreateBtn.textContent = '숏 포지션 생성';
  contractCreateBtn.className = 'btn btn-danger btn-trade';
  updateMarginAndLiquidation();
});

// 계약 생성 버튼
contractCreateBtn.addEventListener('click', executeTrade);
});