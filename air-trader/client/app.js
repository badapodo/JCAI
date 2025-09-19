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
    const user = JSON.parse(localStorage.getItem('user'));
    userEmail.textContent = user.email;
    showPage('home'); // 로그인 후 홈 화면 표시
    loadDashboardData(); // 백그라운드에서 대시보드 데이터 로드
  } else {
    authContainer.style.display = 'block';
    // 모든 페이지 숨기기
    const pages = ['home-container', 'trading-container', 'rewards-container', 'board-container', 'news-container', 'mypage-container'];
    pages.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
      }
    });
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
async function loadDashboardData() {
  try {
    // 차트 초기화 (과거 데이터 포함)
    await initChart();

    // JCAI 지수 로드
    await fetchJcai();
    
    // 포트폴리오 정보 로드
    await fetchPortfolio();
    
    // 거래 내역 로드
    await fetchTransactions();
    
    // 주기적으로 데이터 업데이트
    setInterval(fetchJcai, 5000); // 실시간 지수는 계속 업데이트
    setInterval(fetchPortfolio, 10000); // 포트폴리오는 10초마다
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
  }
}

// JCAI 지수 조회
async function fetchJcai() {
  try {
    const data = await fetch(`${API_BASE_URL}/jcai`).then(res => res.json());
    
    currentJcai = data.jcai;
    
    // 거래 화면 UI 업데이트
    if (jcaiValue) {
      jcaiValue.textContent = currentJcai.toLocaleString();
    }
    if (pm25Value) {
      pm25Value.textContent = data.pm25;
    }
    if (pm10Value) {
      pm10Value.textContent = data.pm10;
    }
    
    // 홈 화면 UI 업데이트
    const homeJcaiValue = document.getElementById('home-jcai-value');
    const homePm25Value = document.getElementById('home-pm25-value');
    const homePm10Value = document.getElementById('home-pm10-value');
    
    if (homeJcaiValue) {
      homeJcaiValue.textContent = currentJcai.toLocaleString();
    }
    if (homePm25Value) {
      homePm25Value.textContent = data.pm25;
    }
    if (homePm10Value) {
      homePm10Value.textContent = data.pm10;
    }
    
    // 선물 계약 가격 업데이트
    if (tradePrice) {
      tradePrice.value = currentJcai;
    }
    
    // 증거금 및 청산가 업데이트
    updateMarginAndLiquidation();
    
    // 차트 데이터 업데이트
    updateChartData(data);
    
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

// 거래 내역 조회 (메인화면용 - 10개 제한)
async function fetchTransactions() {
  try {
    const data = await fetchWithAuth(`${API_BASE_URL}/transactions/recent`);
    
    // UI 업데이트
    transactionsTableBody.innerHTML = '';
    
    data.forEach(tx => {
      const row = document.createElement('tr');
      
      const typeMap = {
        'buy': '매수',
        'sell': '매도',
        'long': '롱',
        'long_close': '롱 청산',
        'short': '숏',
        'short_close': '숏 청산'
      };
      
      const date = new Date(tx.created_at);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      // 차익 표시 로직
      let profitLossDisplay = '';
      if (tx.profit_loss !== undefined && tx.profit_loss !== null) {
        const profitLoss = parseFloat(tx.profit_loss);
        if (profitLoss > 0) {
          profitLossDisplay = `<span class="text-success">+${profitLoss.toLocaleString()} EC</span>`;
        } else if (profitLoss < 0) {
          profitLossDisplay = `<span class="text-danger">${profitLoss.toLocaleString()} EC</span>`;
        } else {
          profitLossDisplay = `<span class="text-muted">0 EC</span>`;
        }
      } else {
        profitLossDisplay = `<span class="text-muted">-</span>`;
      }

      row.innerHTML = `
        <td>${formattedDate}</td>
        <td>${typeMap[tx.type] || tx.type}</td>
        <td>${tx.contract_size.toLocaleString()}</td>
        <td>${tx.price.toLocaleString()} EC</td>
        <td>${tx.total_value.toLocaleString()} EC</td>
        <td>${profitLossDisplay}</td>
      `;
      
      transactionsTableBody.appendChild(row);
    });
    
    return data;
  } catch (error) {
    console.error('거래 내역 조회 오류:', error);
    throw error;
  }
}

// 차트 초기화
async function initChart() {
  try {
    const canvas = document.getElementById('jcai-chart');
    if (!canvas) {
      console.error('차트 캔버스를 찾을 수 없습니다.');
      return;
    }

    // API를 통해 과거 데이터 가져오기
    const historyData = await fetch(`${API_BASE_URL}/jcai/history`).then(res => res.json());

    // 차트 데이터 초기화
    chartData.labels = [];
    chartData.values = [];

    if (historyData && historyData.length > 0) {
        historyData.forEach((item, index) => {
            const date = new Date(item.hour);
            // JSON 모드에서는 더 상세한 시간 표시
            if (historyData.length > 24) {
                // 많은 데이터가 있을 때는 분:초까지 표시
                chartData.labels.push(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
            } else {
                // 적은 데이터일 때는 시간만 표시
                chartData.labels.push(`${date.getHours().toString().padStart(2, '0')}:00`);
            }
            chartData.values.push(item.value);
        });
        console.log(`차트에 ${historyData.length}개의 데이터 포인트가 로드되었습니다.`);
    } else {
        // API에서 데이터를 가져오지 못한 경우, 24시간 더미 데이터로 채움
        console.warn("Could not fetch history data, falling back to dummy data.");
        const now = new Date();
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now);
            time.setHours(now.getHours() - i);
            chartData.labels.push(time.getHours().toString().padStart(2, '0') + ':00');
            const randomValue = Math.floor(Math.random() * 1000) + 8000;
            chartData.values.push(randomValue);
        }
    }
    
    const ctx = canvas.getContext('2d');
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
          legend: { display: false },
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
            ticks: {
                callback: function(value, index, values) {
                    return value.toLocaleString();
                }
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
function updateChartData(newData) {
  try {
    const now = new Date(newData.timestamp);
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const newLabel = `${currentHour}:${currentMinute}`;

    // 마지막 레이블과 같으면 업데이트하지 않음 (중복 방지)
    if (chartData.labels[chartData.labels.length - 1] === newLabel) {
        return;
    }

    // 새 데이터 추가
    chartData.labels.push(newLabel);
    chartData.values.push(newData.jcai);
    
    // 24개 데이터만 유지
    if (chartData.labels.length > 24) {
      chartData.labels.shift();
      chartData.values.shift();
    }
    
    // 차트 업데이트
    if (jcaiChart) {
      jcaiChart.data.labels = chartData.labels;
      jcaiChart.data.datasets[0].data = chartData.values;
      jcaiChart.update();
    } else {
      initChart();
    }
  } catch (error) {
    console.error('차트 데이터 업데이트 오류:', error);
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
    liquidationValue = price - (price / leverageValue) * 0.9;
  } else {
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

// 숏 포지션 청산
async function closeShortPosition(positionId) {
  try {
    const data = await fetchWithAuth(`${API_BASE_URL}/trade/short/${positionId}/close`, {
      method: 'POST',
      body: JSON.stringify({ current_price: currentJcai })
    });
    
    alert(`숏 포지션이 청산되었습니다. 손익: ${data.profit_loss.toLocaleString()} EC`);
    
    // 데이터 새로고침
    await fetchPortfolio();
    await fetchTransactions();
    
    return data;
  } catch (error) {
    console.error('숏 청산 오류:', error);
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

// === 페이지 전환 기능 ===
function showPage(pageId) {
  // 모든 페이지 숨기기
  const pages = ['home-container', 'trading-container', 'rewards-container', 'board-container', 'news-container', 'mypage-container'];
  pages.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  });
  
  // 선택된 페이지 보이기
  const targetPage = document.getElementById(pageId + '-container');
  if (targetPage) {
    targetPage.style.display = 'block';
  }
  
  // 페이지별 데이터 로드
  if (pageId === 'trading') {
    // 거래 페이지 로드 시 기존 대시보드 데이터 로드
    loadDashboardData();
  } else if (pageId === 'mypage') {
    loadMyPageData();
  } else if (pageId === 'board') {
    loadBoardPosts();
  } else if (pageId === 'news') {
    loadNews();
  }
}

// === 리워드 시스템 ===
function showRewardAlert() {
  alert('리워드 시스템은 추후 지원 예정입니다. 곧 만나보실 수 있습니다!');
}

// === 게시판 기능 ===
async function showPostForm() {
  document.getElementById('post-form').style.display = 'block';
  
  // 포트폴리오 데이터를 가져와서 총 손익을 실현 차익 필드에 설정
  try {
    const response = await fetch(`${API_BASE_URL}/portfolio`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const profitAmountField = document.getElementById('profit-amount');
      if (profitAmountField && data.total_profit_loss !== undefined) {
        profitAmountField.value = data.total_profit_loss.toFixed(2);
      }
    }
  } catch (error) {
    console.error('포트폴리오 데이터 로드 중 오류:', error);
    // 오류가 발생해도 폼은 표시
  }
}

function hidePostForm() {
  document.getElementById('post-form').style.display = 'none';
  document.getElementById('portfolio-post-form').reset();
}

// 게시글 작성
document.addEventListener('DOMContentLoaded', function() {
  const portfolioPostForm = document.getElementById('portfolio-post-form');
  if (portfolioPostForm) {
    portfolioPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('post-title').value;
      const content = document.getElementById('post-content').value;
      const profitAmount = document.getElementById('profit-amount').value || 0;
      
      try {
        const response = await fetch(`${API_BASE_URL}/board/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            title,
            content,
            profit_amount: profitAmount
          })
        });
        
        if (response.ok) {
          alert('포트폴리오가 성공적으로 게시되었습니다!');
          hidePostForm();
          loadBoardPosts();
        } else {
          alert('게시글 작성에 실패했습니다.');
        }
      } catch (error) {
        console.error('게시글 작성 오류:', error);
        alert('게시글 작성 중 오류가 발생했습니다.');
      }
    });
  }
});

// 게시글 목록 로드
async function loadBoardPosts() {
  try {
    const response = await fetch(`${API_BASE_URL}/board/posts`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      const posts = await response.json();
      displayBoardPosts(posts);
    }
  } catch (error) {
    console.error('게시글 로드 오류:', error);
  }
}

// 게시글 표시
function displayBoardPosts(posts) {
  const postsList = document.getElementById('posts-list');
  if (!postsList) return;
  
  if (posts.length === 0) {
    postsList.innerHTML = `
      <div class="card">
        <div class="card-body text-center">
          <p class="text-muted">아직 게시된 포트폴리오가 없습니다.</p>
        </div>
      </div>
    `;
    return;
  }
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  
  postsList.innerHTML = posts.map(post => `
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h5 class="card-title mb-0">${post.title}</h5>
          ${currentUser && currentUser.email === post.user_email ? 
            `<button class="btn btn-outline-danger btn-sm" onclick="deletePost(${post.id})" title="게시글 삭제">
              <i class="fas fa-trash"></i>
            </button>` : ''
          }
        </div>
        <p class="card-text">${post.content}</p>
        <div class="row">
          <div class="col-md-6">
            <small class="text-muted">작성자: ${post.user_email}</small><br>
            <small class="text-muted">작성일: ${new Date(post.created_at).toLocaleString()}</small>
          </div>
          <div class="col-md-6 text-end">
            <span class="badge ${post.profit_amount >= 0 ? 'bg-success' : 'bg-danger'}">
              실현 차익: ${post.profit_amount >= 0 ? '+' : ''}${post.profit_amount} EC
            </span>
          </div>
        </div>
        <hr>
        <div class="comments-section">
          <h6>댓글</h6>
          <div id="comments-${post.id}">
            <!-- 댓글들이 여기에 표시됩니다 -->
          </div>
          <div class="mt-2">
            <input type="text" class="form-control" placeholder="댓글을 입력하세요..." 
                   onkeypress="if(event.key==='Enter') addComment(${post.id}, this.value, this)">
          </div>
        </div>
      </div>
    </div>
  `).join('');
  
  // 각 게시글의 댓글 로드
  posts.forEach(post => loadComments(post.id));
}

// 댓글 추가
async function addComment(postId, content, inputElement) {
  if (!content.trim()) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/board/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ content })
    });
    
    if (response.ok) {
      inputElement.value = '';
      loadComments(postId);
    } else {
      alert('댓글 작성에 실패했습니다.');
    }
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    alert('댓글 작성 중 오류가 발생했습니다.');
  }
}

// 댓글 로드
async function loadComments(postId) {
  try {
    const response = await fetch(`${API_BASE_URL}/board/posts/${postId}/comments`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      const comments = await response.json();
      displayComments(postId, comments);
    }
  } catch (error) {
    console.error('댓글 로드 오류:', error);
  }
}

// 댓글 표시
function displayComments(postId, comments) {
  const commentsContainer = document.getElementById(`comments-${postId}`);
  if (!commentsContainer) return;
  
  if (comments.length === 0) {
    commentsContainer.innerHTML = '<p class="text-muted small">댓글이 없습니다.</p>';
    return;
  }
  
  const currentUser = JSON.parse(localStorage.getItem('user'));
  
  commentsContainer.innerHTML = comments.map(comment => `
    <div class="border-start border-2 ps-2 mb-2">
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <small class="text-muted">${comment.user_email}</small>
          <p class="mb-1">${comment.content}</p>
          <small class="text-muted">${new Date(comment.created_at).toLocaleString()}</small>
        </div>
        ${currentUser && currentUser.email === comment.user_email ? 
          `<button class="btn btn-outline-danger btn-sm ms-2" onclick="deleteComment(${postId}, ${comment.id})" title="댓글 삭제">
            <i class="fas fa-trash"></i>
          </button>` : ''
        }
      </div>
    </div>
  `).join('');
}

// === 마이페이지 기능 ===
async function loadMyPageData() {
  try {
    // 사용자 정보 로드
    const userResponse = await fetch(`${API_BASE_URL}/user/info`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (userResponse.ok) {
      const userData = await userResponse.json();
      updateMyPageInfo(userData);
    }
    
    // 거래 내역 로드
    const transactionsResponse = await fetch(`${API_BASE_URL}/transactions`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (transactionsResponse.ok) {
      const transactions = await transactionsResponse.json();
      updateMyPageTransactions(transactions);
      updateMyPageStats(transactions);
    }
  } catch (error) {
    console.error('마이페이지 데이터 로드 오류:', error);
  }
}

// 마이페이지 정보 업데이트
function updateMyPageInfo(userData) {
  document.getElementById('mypage-eco-credits').textContent = userData.eco_credits?.toLocaleString() || '0';
  document.getElementById('mypage-jcai-amount').textContent = userData.jcai_amount?.toLocaleString() || '0';
  document.getElementById('mypage-avg-price').textContent = userData.avg_price?.toFixed(2) || '0.00';
}

// 마이페이지 거래 내역 업데이트
function updateMyPageTransactions(transactions) {
  const tbody = document.getElementById('mypage-transactions-table-body');
  if (!tbody) return;
  
  const typeMap = {
    'buy': '매수',
    'sell': '매도',
    'long': '롱',
    'long_close': '롱 청산',
    'short': '숏',
    'short_close': '숏 청산'
  };
  
  tbody.innerHTML = transactions.map(transaction => {
    // 차익 표시 로직
    let profitLossDisplay = '';
    if (transaction.profit_loss !== undefined && transaction.profit_loss !== null) {
      const profitLoss = parseFloat(transaction.profit_loss);
      if (profitLoss > 0) {
        profitLossDisplay = `<span class="text-success">+${profitLoss.toLocaleString()} EC</span>`;
      } else if (profitLoss < 0) {
        profitLossDisplay = `<span class="text-danger">${profitLoss.toLocaleString()} EC</span>`;
      } else {
        profitLossDisplay = `<span class="text-muted">0 EC</span>`;
      }
    } else {
      profitLossDisplay = `<span class="text-muted">-</span>`;
    }
    
    return `
      <tr>
        <td>${new Date(transaction.created_at).toLocaleString()}</td>
        <td>${typeMap[transaction.type] || transaction.type}</td>
        <td>${transaction.contract_size.toLocaleString()}</td>
        <td>${transaction.price.toLocaleString()} EC</td>
        <td>${transaction.total_value.toLocaleString()} EC</td>
        <td>${profitLossDisplay}</td>
      </tr>
    `;
  }).join('');
}

// 마이페이지 통계 업데이트
function updateMyPageStats(transactions) {
  // 청산 거래만 필터링 (long_close, short_close)
  const closedTrades = transactions.filter(t => t.type === 'long_close' || t.type === 'short_close');
  
  const totalTrades = transactions.length;
  const totalClosedTrades = closedTrades.length;
  const profitTrades = closedTrades.filter(t => t.profit_loss > 0).length;
  const lossTrades = closedTrades.filter(t => t.profit_loss < 0).length;
  
  // 승률은 청산 거래에 대해서만 계산
  const winRate = totalClosedTrades > 0 ? ((profitTrades / totalClosedTrades) * 100).toFixed(1) : 0;
  const totalPnL = transactions.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  
  document.getElementById('mypage-total-trades').textContent = totalTrades;
  document.getElementById('mypage-profit-trades').textContent = profitTrades;
  document.getElementById('mypage-loss-trades').textContent = lossTrades;
  document.getElementById('mypage-win-rate').textContent = winRate;
  document.getElementById('mypage-total-pnl').textContent = totalPnL >= 0 ? '+' + totalPnL : totalPnL;
}

// === 뉴스 기능 ===

// 뉴스 로드
async function loadNews() {
  const newsLoading = document.getElementById('news-loading');
  const newsList = document.getElementById('news-list');
  const newsError = document.getElementById('news-error');
  
  // 로딩 상태 표시
  newsLoading.style.display = 'block';
  newsList.innerHTML = '';
  newsError.style.display = 'none';
  
  try {
    const response = await fetch(`${API_BASE_URL}/news/air-quality`);
    
    if (!response.ok) {
      throw new Error('뉴스를 불러올 수 없습니다.');
    }
    
    const news = await response.json();
    newsLoading.style.display = 'none';
    
    if (news.length === 0) {
      newsList.innerHTML = `
        <div class="col-12">
          <div class="alert alert-info text-center">
            <i class="fas fa-info-circle"></i>
            현재 표시할 뉴스가 없습니다.
          </div>
        </div>
      `;
      return;
    }
    
    // 뉴스 목록 표시
    newsList.innerHTML = news.map(article => `
      <div class="col-md-6 mb-3">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">${article.title}</h5>
            <p class="card-text">${article.summary}</p>
            <div class="d-flex justify-content-between align-items-center">
              <small class="text-muted">
                <i class="fas fa-newspaper"></i> ${article.source}
              </small>
              <small class="text-muted">
                <i class="fas fa-clock"></i> ${formatNewsDate(article.publishedAt)}
              </small>
            </div>
          </div>
          <div class="card-footer">
            <a href="${article.url}" class="btn btn-outline-primary btn-sm" target="_blank">
              <i class="fas fa-external-link-alt"></i> 기사 보기
            </a>
          </div>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('뉴스 로드 오류:', error);
    newsLoading.style.display = 'none';
    newsError.style.display = 'block';
  }
}

// 뉴스 날짜 포맷팅
function formatNewsDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) {
    return '방금 전';
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR');
  }
}

// 게시글 삭제
async function deletePost(postId) {
  if (!confirm('정말로 이 게시글을 삭제하시겠습니까?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/board/posts/${postId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      alert('게시글이 삭제되었습니다.');
      loadBoardPosts(); // 게시글 목록 새로고침
    } else {
      const error = await response.json();
      alert(error.message || '게시글 삭제에 실패했습니다.');
    }
  } catch (error) {
    console.error('게시글 삭제 오류:', error);
    alert('게시글 삭제 중 오류가 발생했습니다.');
  }
}

// 댓글 삭제
async function deleteComment(postId, commentId) {
  if (!confirm('정말로 이 댓글을 삭제하시겠습니까?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/board/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (response.ok) {
      alert('댓글이 삭제되었습니다.');
      loadComments(postId); // 댓글 목록 새로고침
    } else {
      const error = await response.json();
      alert(error.message || '댓글 삭제에 실패했습니다.');
    }
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    alert('댓글 삭제 중 오류가 발생했습니다.');
  }
}
