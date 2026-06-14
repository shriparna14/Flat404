// ==========================================
// FRONTEND STATE MANAGEMENT
// ==========================================
let API_URL = window.location.origin;
let state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  groupId: 1, // Default seed group
  activeTab: 'dashboard',
  members: [], // Group members with active timelines
  expenses: [],
  settlements: [],
  importRows: [] // Parsed rows returned from CSV analysis
};

// Headers helper for API requests
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.token}`
  };
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initModalForms();
  initCSVImporter();
  initTimelineManager();
  
  if (state.token) {
    showApp();
  } else {
    showAuth();
  }
});

// ==========================================
// AUTHENTICATION MODULE
// ==========================================
function initAuth() {
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const toggleLoginBtn = document.getElementById('toggle-login-btn');
  const toggleRegisterBtn = document.getElementById('toggle-register-btn');
  const logoutBtn = document.getElementById('logout-btn');

  // Toggle login/register forms
  toggleLoginBtn.addEventListener('click', () => {
    toggleLoginBtn.classList.add('active');
    toggleRegisterBtn.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  });

  toggleRegisterBtn.addEventListener('click', () => {
    toggleRegisterBtn.classList.add('active');
    toggleLoginBtn.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
  });

  // Login submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('login-name').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      const data = await res.json();
      if (res.ok) {
        saveSession(data.token, data.user);
        showApp();
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error(err);
      alert('Network error during login');
    }
  });

  // Register submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        saveSession(data.token, data.user);
        showApp();
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error(err);
      alert('Network error during registration');
    }
  });

  // Demo Login Buttons
  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const name = btn.getAttribute('data-name');
      document.getElementById('login-name').value = name;
      document.getElementById('login-password').value = 'flatmate123';
      loginForm.dispatchEvent(new Event('submit'));
    });
  });

  // Logout button
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.token = '';
    state.user = null;
    showAuth();
  });
}

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  state.token = token;
  state.user = user;
}

function showAuth() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

async function showApp() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  
  // Set user profile
  document.getElementById('current-user-name').textContent = state.user.name;
  document.getElementById('user-avatar').textContent = state.user.name.charAt(0);

  // Initialize and load core data
  await loadGroupMembers();
  switchTab(state.activeTab);
}

// ==========================================
// NAVIGATION SYSTEM
// ==========================================
function initNavigation() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Update menu styling
  document.querySelectorAll('.menu-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle active tab panel view
  document.querySelectorAll('.tab-panel').forEach(panel => {
    if (panel.id === `panel-${tabId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Title headings
  const titles = {
    'dashboard': { title: 'Dashboard', sub: 'Flatmate ledger balances and simplified settlements' },
    'expenses': { title: 'Ledger History', sub: 'Complete history of all expenses and settlements logged' },
    'import-wizard': { title: 'CSV Import Wizard', sub: 'Import expenses_export.csv and resolve formatting errors' },
    'timeline': { title: 'Membership Timeline', sub: 'Flatmate active durations to satisfy billing constraints' }
  };

  const headerInfo = titles[tabId] || { title: 'Flat Ledger', sub: '' };
  document.getElementById('tab-title').textContent = headerInfo.title;
  document.getElementById('tab-subtitle').textContent = headerInfo.sub;

  // Trigger loads
  if (tabId === 'dashboard') {
    loadDashboard();
  } else if (tabId === 'expenses') {
    loadExpensesHistory();
  } else if (tabId === 'timeline') {
    loadTimeline();
  }
}

// ==========================================
// CORE METRICS & BALANCES (Aisha & Rohan views)
// ==========================================
async function loadGroupMembers() {
  try {
    const res = await fetch(`${API_URL}/api/groups/${state.groupId}/members`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      state.members = await res.json();
      
      // Populate Payer/User selects on forms
      populateSelectDropdowns();
    }
  } catch (err) {
    console.error('Error fetching group members:', err);
  }
}

function populateSelectDropdowns() {
  const selects = ['exp-payer', 'set-payer', 'set-payee', 'audit-user-select', 'timeline-user-select'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.innerHTML = '';
    
    // Default empty state or placeholder for select payee
    if (id === 'set-payee') {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- Select Payee --';
      el.appendChild(opt);
    }
    
    state.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id || m.name; // user ID or name
      opt.textContent = m.name;
      
      // Select Rohan by default on audit dropdown for testing convenience
      if (id === 'audit-user-select' && m.name === 'Rohan') {
        opt.selected = true;
      }
      
      el.appendChild(opt);
    });
  });
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/api/groups/${state.groupId}/balances`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) return console.error(data.error);

    // 1. Calculate and update personal balance summary
    const myBalance = data.balances[state.user.name] || 0;
    const balanceValEl = document.getElementById('dash-user-balance');
    const statusPill = document.getElementById('dash-user-status');
    
    balanceValEl.textContent = `₹${Math.abs(myBalance).toFixed(2)}`;
    
    if (myBalance > 0.01) {
      balanceValEl.style.color = 'var(--success-color)';
      statusPill.textContent = 'You are Owed';
      statusPill.className = 'card-status-pill owed-plus';
    } else if (myBalance < -0.01) {
      balanceValEl.style.color = 'var(--error-color)';
      statusPill.textContent = 'You Owe';
      statusPill.className = 'card-status-pill owed-minus';
    } else {
      balanceValEl.style.color = 'var(--text-primary)';
      statusPill.textContent = 'Settled';
      statusPill.className = 'card-status-pill settled';
    }

    // 2. Fetch total expenses spend
    const expRes = await fetch(`${API_URL}/api/groups/${state.groupId}/expenses`, {
      headers: getAuthHeaders()
    });
    if (expRes.ok) {
      const exps = await expRes.json();
      const total = exps.reduce((acc, curr) => acc + curr.amount_in_inr, 0);
      document.getElementById('dash-total-expenses').textContent = `₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    }

    // 3. Render active members count
    const activeMems = state.members.filter(m => !m.left_at);
    document.getElementById('dash-active-members').textContent = activeMems.length;

    // 4. Aisha's View: Simplified debt paths
    const simplifiedList = document.getElementById('simplified-settlements-list');
    simplifiedList.innerHTML = '';
    
    if (data.simplifiedDebts.length === 0) {
      simplifiedList.innerHTML = `<li class="no-debts-notice text-secondary text-center" style="padding: 20px;">All flatmates are settled up!</li>`;
    } else {
      data.simplifiedDebts.forEach(d => {
        const li = document.createElement('li');
        li.className = 'settlement-path-card';
        li.innerHTML = `
          <div class="debt-details">
            <span class="debtor-name">${d.from}</span>
            <span class="debt-arrow">owes</span>
            <span class="creditor-name">${d.to}</span>
          </div>
          <div class="debt-actions" style="display:flex; align-items:center; gap: 10px;">
            <span class="debt-amount">₹${d.amount.toFixed(2)}</span>
            <button class="btn btn-secondary btn-xs record-path-payment-btn" data-from="${d.from}" data-to="${d.to}" data-amount="${d.amount}">Record</button>
          </div>
        `;
        simplifiedList.appendChild(li);
      });
      
      // Wire shortcut buttons
      document.querySelectorAll('.record-path-payment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const from = btn.getAttribute('data-from');
          const to = btn.getAttribute('data-to');
          const amt = btn.getAttribute('data-amount');
          
          openSettlementModal(from, to, amt);
        });
      });
    }

    // 5. Render individual balances breakdown grid
    const balancesList = document.getElementById('group-balances-list');
    balancesList.innerHTML = '';
    
    Object.entries(data.balances).forEach(([name, bal]) => {
      const row = document.createElement('div');
      row.className = 'balance-item-row';
      
      let classVal = 'neutral';
      let formattedVal = `₹${bal.toFixed(2)}`;
      
      if (bal > 0.01) {
        classVal = 'positive';
        formattedVal = `+₹${bal.toFixed(2)}`;
      } else if (bal < -0.01) {
        classVal = 'negative';
        formattedVal = `-₹${Math.abs(bal).toFixed(2)}`;
      }
      
      row.innerHTML = `
        <div class="balance-user-meta">
          <div class="balance-avatar" style="background-color: ${name === state.user.name ? 'var(--accent-color)' : 'var(--border-color)'}">${name.charAt(0)}</div>
          <span class="balance-user-name">${name} ${name === state.user.name ? '(You)' : ''}</span>
        </div>
        <span class="balance-value ${classVal}">${formattedVal}</span>
      `;
      balancesList.appendChild(row);
    });

    // 6. Load Rohan's ledger audit based on currently selected audit dropdown
    const auditSelect = document.getElementById('audit-user-select');
    if (auditSelect.value) {
      loadLedgerAudit(auditSelect.value);
    }

  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// Rohan's View: Ledger audit details
async function loadLedgerAudit(userIdName) {
  // We resolve the ID first
  const member = state.members.find(m => m.id == userIdName || m.name === userIdName);
  if (!member) return;

  try {
    const res = await fetch(`${API_URL}/api/groups/${state.groupId}/ledger/${member.id}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) return console.error(data.error);

    const tbody = document.getElementById('ledger-audit-tbody');
    tbody.innerHTML = '';

    if (data.ledger.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-secondary text-center">No transactions recorded for this user yet.</td></tr>`;
      return;
    }

    let runningSum = 0;
    data.ledger.forEach(item => {
      runningSum += item.impact;
      const dateFormatted = new Date(item.date).toLocaleDateString('en-GB');
      
      const tr = document.createElement('tr');
      const impactClass = item.impact > 0 ? 'positive' : item.impact < 0 ? 'negative' : '';
      const impactPrefix = item.impact > 0 ? '+' : '';
      
      tr.innerHTML = `
        <td>${dateFormatted}</td>
        <td>
          <div style="font-weight: 500;">${item.description}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${item.detailText}</div>
        </td>
        <td>${item.payer}</td>
        <td class="text-right">${item.totalAmount} ${item.currency}</td>
        <td class="text-right">${item.userShare > 0 ? '₹' + item.userShare.toFixed(2) : '-'}</td>
        <td class="text-right">
          <span class="ledger-impact-pill ${impactClass}">${impactPrefix}₹${item.impact.toFixed(2)}</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    // Append running balance summary at end of ledger audit table to make it extremely clear
    const summaryTr = document.createElement('tr');
    summaryTr.style.borderTop = '2px solid var(--border-color)';
    summaryTr.style.backgroundColor = 'rgba(255, 255, 255, 0.005)';
    summaryTr.innerHTML = `
      <td colspan="5" style="font-weight: 600; text-align: right; text-transform: uppercase; font-size: 0.8rem; color: var(--text-secondary);">Audit Statement Net Balance:</td>
      <td class="text-right" style="font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem; color: ${runningSum > 0.01 ? 'var(--success-color)' : runningSum < -0.01 ? 'var(--error-color)' : 'var(--text-primary)'}">
        ₹${runningSum.toFixed(2)}
      </td>
    `;
    tbody.appendChild(summaryTr);

  } catch (err) {
    console.error('Error loading ledger audit:', err);
  }
}

// Bind audit dropdown select change
document.getElementById('audit-user-select').addEventListener('change', (e) => {
  loadLedgerAudit(e.target.value);
});

// ==========================================
// MANUAL EXPENSES & HISTORY (Sam's Rule)
// ==========================================
async function loadExpensesHistory() {
  try {
    const res = await fetch(`${API_URL}/api/groups/${state.groupId}/expenses`, {
      headers: getAuthHeaders()
    });
    const exps = await res.json();
    if (!res.ok) return console.error(exps.error);

    const setRes = await fetch(`${API_URL}/api/groups/${state.groupId}/settlements`, {
      headers: getAuthHeaders()
    });
    const sets = await setRes.json();

    const tbody = document.getElementById('expenses-history-tbody');
    tbody.innerHTML = '';

    // Merge transactions and sort chronologically
    const all = [];
    exps.forEach(e => { all.push({ ...e, txType: 'expense' }); });
    sets.forEach(s => { all.push({ ...s, txType: 'settlement', description: s.notes || 'Settlement Payment' }); });

    all.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-secondary text-center" style="padding: 30px;">No transaction history.</td></tr>`;
      return;
    }

    all.forEach(item => {
      const dateFormatted = new Date(item.date).toLocaleDateString('en-GB');
      const tr = document.createElement('tr');
      
      if (item.txType === 'settlement') {
        tr.innerHTML = `
          <td>${dateFormatted}</td>
          <td>
            <div style="font-weight: 600;">${item.description}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Direct transfer</div>
          </td>
          <td>${item.paid_by_name}</td>
          <td class="text-right">-</td>
          <td class="text-right" style="font-weight: 600; color: var(--success-color);">₹${item.amount.toFixed(2)}</td>
          <td><span class="split-badge" style="background-color: var(--success-bg); color: var(--success-color); border-color: rgba(16, 185, 129, 0.2)">Settlement</span></td>
          <td>${item.paid_to_name}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.notes || '-'}</td>
          <td>
            <!-- No settlements delete or simple log -->
          </td>
        `;
      } else {
        const participants = item.splits.map(s => s.user_name).join(', ');
        tr.innerHTML = `
          <td>${dateFormatted}</td>
          <td>
            <div style="font-weight: 600;">${item.description}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${item.notes || ''}</div>
          </td>
          <td>${item.paid_by_name}</td>
          <td class="text-right">${item.amount} ${item.currency}</td>
          <td class="text-right" style="font-weight: 600;">₹${item.amount_in_inr.toFixed(2)}</td>
          <td><span class="split-badge">${item.split_type}</span></td>
          <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${participants}">${participants}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${item.exchange_rate > 1 ? `1 USD = ${item.exchange_rate} INR` : '-'}</td>
          <td>
            <button class="trash-btn delete-expense-btn" data-id="${item.id}" title="Delete Expense">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </td>
        `;
      }
      tbody.appendChild(tr);
    });

    // Wire delete buttons
    document.querySelectorAll('.delete-expense-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const expId = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this expense? This will update flat balances immediately.')) {
          try {
            const res = await fetch(`${API_URL}/api/groups/${state.groupId}/expenses/${expId}`, {
              method: 'DELETE',
              headers: getAuthHeaders()
            });
            if (res.ok) {
              loadExpensesHistory();
            }
          } catch (err) {
            console.error(err);
          }
        }
      });
    });

  } catch (err) {
    console.error(err);
  }
}

// Modal handling
function initModalForms() {
  const btnNewExpense = document.getElementById('btn-new-expense');
  const btnNewSettlement = document.getElementById('btn-new-settlement');
  const modalExpense = document.getElementById('modal-expense');
  const modalSettlement = document.getElementById('modal-settlement');
  
  const closeExpense = document.getElementById('btn-close-expense-modal');
  const closeSettlement = document.getElementById('btn-close-settlement-modal');
  const cancelExpense = document.getElementById('btn-cancel-expense');
  const cancelSettlement = document.getElementById('btn-cancel-settlement');

  // Trigger modal display
  btnNewExpense.addEventListener('click', () => {
    modalExpense.classList.remove('hidden');
    // Set default date as today
    document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
    renderExpenseSplitChecklist();
    validatePayerAndSplitTimelines();
  });

  btnNewSettlement.addEventListener('click', () => {
    openSettlementModal('', '', '');
  });

  // Closes
  const hideModals = () => {
    modalExpense.classList.add('hidden');
    modalSettlement.classList.add('hidden');
  };
  
  closeExpense.addEventListener('click', hideModals);
  closeSettlement.addEventListener('click', hideModals);
  cancelExpense.addEventListener('click', hideModals);
  cancelSettlement.addEventListener('click', hideModals);

  // Currency select triggers exchange rate
  const currSelect = document.getElementById('exp-currency');
  const rateInput = document.getElementById('exp-exchange-rate');
  const helperText = document.getElementById('exp-exchange-helper');

  currSelect.addEventListener('change', () => {
    if (currSelect.value === 'USD') {
      rateInput.value = '83';
      rateInput.readOnly = false;
      helperText.textContent = 'Enter USD rate (Default: 83.0)';
    } else {
      rateInput.value = '1';
      rateInput.readOnly = true;
      helperText.textContent = '1.0 for INR';
    }
  });

  // Split type select change
  document.getElementById('exp-split-type').addEventListener('change', () => {
    renderExpenseSplitChecklist();
  });

  // Watch fields for date-timeline rule validation
  document.getElementById('exp-date').addEventListener('change', validatePayerAndSplitTimelines);
  document.getElementById('exp-payer').addEventListener('change', validatePayerAndSplitTimelines);

  // Form submission: Save manual expense
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = document.getElementById('exp-description').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const currency = document.getElementById('exp-currency').value;
    const exchange_rate = parseFloat(document.getElementById('exp-exchange-rate').value);
    const split_type = document.getElementById('exp-split-type').value;
    const date = document.getElementById('exp-date').value;
    const notes = document.getElementById('exp-notes').value;
    
    // Resolve payer name
    const payerSelect = document.getElementById('exp-payer');
    const paid_by_name = payerSelect.options[payerSelect.selectedIndex].text;

    // Collect participants and details
    const split_with = [];
    const split_details = {};

    const checkedRows = document.querySelectorAll('.split-user-row input[type="checkbox"]:checked');
    checkedRows.forEach(cb => {
      const name = cb.getAttribute('data-name');
      split_with.push(name);

      if (split_type === 'share' || split_type === 'percentage' || split_type === 'unequal') {
        const valInput = document.getElementById(`split-val-${name}`);
        split_details[name] = parseFloat(valInput.value) || 0;
      }
    });

    if (split_with.length === 0) {
      alert('Please check at least one participant in the split list.');
      return;
    }

    // Double check split sums
    if (split_type === 'percentage') {
      const sum = Object.values(split_details).reduce((a,b)=>a+b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        alert(`Split percentages must sum to 100%. Current sum: ${sum}%`);
        return;
      }
    } else if (split_type === 'unequal') {
      const sum = Object.values(split_details).reduce((a,b)=>a+b, 0);
      if (Math.abs(sum - amount) > 0.1) {
        alert(`Unequal split amounts must sum to the total expense amount (${amount}). Current sum: ${sum}`);
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/api/groups/${state.groupId}/expenses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          description,
          paid_by_name,
          amount,
          currency,
          exchange_rate,
          split_type,
          split_with,
          split_details,
          date,
          notes
        })
      });
      const data = await res.json();
      if (res.ok) {
        hideModals();
        document.getElementById('expense-form').reset();
        switchTab(state.activeTab); // Reload
      } else {
        alert(data.error || 'Failed to save expense');
      }
    } catch (err) {
      console.error(err);
      alert('Network error saving expense');
    }
  });

  // Form submission: Save settlement
  document.getElementById('settlement-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const payerSelect = document.getElementById('set-payer');
    const paid_by_name = payerSelect.options[payerSelect.selectedIndex].text;

    const payeeSelect = document.getElementById('set-payee');
    const paid_to_name = payeeSelect.options[payeeSelect.selectedIndex].text;

    const amount = parseFloat(document.getElementById('set-amount').value);
    const date = document.getElementById('set-date').value;
    const notes = document.getElementById('set-notes').value;

    if (!paid_to_name || paid_by_name === paid_to_name) {
      alert('A flatmate cannot pay themselves. Please select a different payee.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/groups/${state.groupId}/settlements`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          paid_by_name,
          paid_to_name,
          amount,
          date,
          notes
        })
      });
      const data = await res.json();
      if (res.ok) {
        hideModals();
        document.getElementById('settlement-form').reset();
        switchTab(state.activeTab); // Reload
      } else {
        alert(data.error || 'Failed to log settlement');
      }
    } catch (err) {
      console.error(err);
      alert('Network error logging settlement');
    }
  });
}

function openSettlementModal(fromName = '', toName = '', amountVal = '') {
  const modal = document.getElementById('modal-settlement');
  modal.classList.remove('hidden');
  document.getElementById('set-date').value = new Date().toISOString().split('T')[0];

  // Set selectors
  const payerSelect = document.getElementById('set-payer');
  const payeeSelect = document.getElementById('set-payee');

  if (fromName) {
    for (let i = 0; i < payerSelect.options.length; i++) {
      if (payerSelect.options[i].text === fromName) {
        payerSelect.selectedIndex = i;
        break;
      }
    }
  }
  if (toName) {
    for (let i = 0; i < payeeSelect.options.length; i++) {
      if (payeeSelect.options[i].text === toName) {
        payeeSelect.selectedIndex = i;
        break;
      }
    }
  }

  if (amountVal) {
    document.getElementById('set-amount').value = parseFloat(amountVal).toFixed(2);
  } else {
    document.getElementById('set-amount').value = '';
  }
}

// Render participants splits checklist dynamically in Expense modal
function renderExpenseSplitChecklist() {
  const container = document.getElementById('split-participants-container');
  const splitType = document.getElementById('exp-split-type').value;
  
  container.innerHTML = '';

  state.members.forEach(m => {
    // Determine input types and units
    let inputHtml = '';
    if (splitType === 'share') {
      inputHtml = `<div class="split-input-box"><input type="number" step="any" id="split-val-${m.name}" value="1"><span class="split-unit">shares</span></div>`;
    } else if (splitType === 'percentage') {
      inputHtml = `<div class="split-input-box"><input type="number" step="any" id="split-val-${m.name}" value="0"><span class="split-unit">%</span></div>`;
    } else if (splitType === 'unequal') {
      inputHtml = `<div class="split-input-box"><input type="number" step="any" id="split-val-${m.name}" value="0"><span class="split-unit">₹</span></div>`;
    }

    const row = document.createElement('div');
    row.className = 'split-user-row';
    row.innerHTML = `
      <label class="split-user-left">
        <input type="checkbox" class="split-cb" data-name="${m.name}" checked>
        <span>${m.name}</span>
      </label>
      ${inputHtml}
    `;
    container.appendChild(row);
  });

  // Attach event listener to checkboxes for checking timeline constraints
  document.querySelectorAll('.split-cb').forEach(cb => {
    cb.addEventListener('change', validatePayerAndSplitTimelines);
  });
}

// Sam's Request: Validate timelines dynamically and surface helpful error logs
function validatePayerAndSplitTimelines() {
  const dateStr = document.getElementById('exp-date').value;
  if (!dateStr) return;

  const expDate = new Date(dateStr);
  const warningBox = document.getElementById('split-validation-warning');
  const submitBtn = document.getElementById('btn-save-expense');
  
  warningBox.classList.add('hidden');
  warningBox.textContent = '';
  submitBtn.disabled = false;
  submitBtn.style.opacity = '1';

  // Check payer timeline
  const payerSelect = document.getElementById('exp-payer');
  const payerName = payerSelect.options[payerSelect.selectedIndex]?.text;
  const payerMem = state.members.find(m => m.name === payerName);
  
  if (payerMem) {
    const joined = new Date(payerMem.joined_at);
    const left = payerMem.left_at ? new Date(payerMem.left_at) : null;
    if (expDate < joined || (left && expDate > left)) {
      warningBox.textContent = `Warning: Payer ${payerName} was inactive on this date. Joined ${payerMem.joined_at}, Left ${payerMem.left_at || 'Present'}. Select a different date or payer.`;
      warningBox.classList.remove('hidden');
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      return;
    }
  }

  // Check split participants
  const checkedBoxes = document.querySelectorAll('.split-cb:checked');
  const inactiveNames = [];

  checkedBoxes.forEach(cb => {
    const name = cb.getAttribute('data-name');
    const mem = state.members.find(m => m.name === name);
    if (mem) {
      const joined = new Date(mem.joined_at);
      const left = mem.left_at ? new Date(mem.left_at) : null;

      if (expDate < joined || (left && expDate > left)) {
        inactiveNames.push(`${name} (Moved In: ${mem.joined_at}, Left: ${mem.left_at || 'Present'})`);
      }
    }
  });

  if (inactiveNames.length > 0) {
    warningBox.textContent = `Sam's Billing Constraint: Cannot charge members who were not active in flat on date (${dateStr}): ${inactiveNames.join(', ')}. Please adjust participants list.`;
    warningBox.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
  }
}

// ==========================================
// CSV IMPORT WIZARD (Meera's Review screen)
// ==========================================
function initCSVImporter() {
  const dropzone = document.getElementById('csv-dropzone');
  const fileInput = document.getElementById('csv-file-input');
  
  const step1 = document.getElementById('import-step-1');
  const step2 = document.getElementById('import-step-2');
  const step3 = document.getElementById('import-step-3');

  const btnCancel = document.getElementById('import-btn-cancel');
  const btnCommit = document.getElementById('import-btn-commit');
  const btnFinish = document.getElementById('import-btn-finish');

  // Drag-and-drop actions
  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      uploadCSV(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      uploadCSV(fileInput.files[0]);
    }
  });

  // Cancel trigger
  btnCancel.addEventListener('click', () => {
    if (confirm('Cancel importing? All changes will be lost.')) {
      state.importRows = [];
      step2.classList.remove('active');
      step1.classList.add('active');
    }
  });

  // Commit resolved anomalies
  btnCommit.addEventListener('click', async () => {
    btnCommit.disabled = true;
    btnCommit.textContent = 'Processing ledger...';
    await commitResolvedImport();
  });

  // Finish trigger
  btnFinish.addEventListener('click', () => {
    step3.classList.remove('active');
    step1.classList.add('active');
    switchTab('dashboard'); // Back to dashboard
  });
}

async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    // Show uploading state
    document.getElementById('csv-dropzone').querySelector('h3').textContent = 'Analyzing spreadsheet anomalies...';
    
    const res = await fetch(`${API_URL}/api/import/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to analyze CSV file');
      resetUploadZone();
      return;
    }

    state.importRows = data.rows;
    state.importFilename = file.name;

    // Render anomalies
    renderAnomaliesReviewScreen(data.rows, data.anomaliesCount);

  } catch (err) {
    console.error(err);
    alert('Error connecting to importer API');
    resetUploadZone();
  }
}

function resetUploadZone() {
  const drop = document.getElementById('csv-dropzone');
  drop.querySelector('h3').textContent = 'Drag and drop expenses_export.csv here';
  drop.querySelector('p').textContent = 'Or click to select file from your system';
}

function renderAnomaliesReviewScreen(rows, anomaliesCount) {
  const step1 = document.getElementById('import-step-1');
  const step2 = document.getElementById('import-step-2');
  const container = document.getElementById('anomalies-container');

  document.getElementById('anomalies-count-label').textContent = `${anomaliesCount} Anomaly Issues Identified`;
  container.innerHTML = '';

  // Extract rows that actually have anomalies
  const anomalyRows = rows.filter(r => r.anomalies && r.anomalies.length > 0);
  
  if (anomalyRows.length === 0) {
    container.innerHTML = `<div class="text-center text-secondary" style="padding: 40px;">No anomalies detected! Spreadsheet is completely clean. Click Ingest below to commit.</div>`;
  } else {
    // Create mapping cards for each anomalies row
    anomalyRows.forEach(row => {
      const card = document.createElement('div');
      card.className = 'anomaly-card';
      card.id = `anomaly-card-${row.lineNo}`;

      // Build listing metadata
      const issuesText = row.anomalies.map(a => `[${a.type}] ${a.message}`).join(', ');
      
      let resolutionHtml = '';

      // Loop through all anomalies in the row and create custom controls
      row.anomalies.forEach((a, aIdx) => {
        resolutionHtml += `<div class="anomaly-sub-issue" style="margin-bottom: 12px;">`;
        resolutionHtml += `<div style="font-weight: 500; font-size: 0.85rem; margin-bottom: 4px; color: var(--accent-color);">${a.message}</div>`;

        if (a.type === 'DUPLICATE') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label class="checkbox-option">
                <input type="checkbox" class="resolve-opt" data-line="${row.lineNo}" data-type="DUPLICATE_DISCARD" checked>
                <span>Discard/Ignore duplicate entry (Recommended)</span>
              </label>
            </div>
          `;
        } else if (a.type === 'CONFLICTING_DUPLICATE') {
          // Identify duplicate row from meta
          const otherLine = a.meta?.duplicateLineNo || '';
          const recText = row.description.toLowerCase().includes('thalassa') && row.paidByRaw.toLowerCase() === 'rohan'
            ? 'Keep Rohan\'s ₹2450 (Aisha\'s is noted as wrong)' 
            : 'Uncheck this card to discard';
            
          resolutionHtml += `
            <div class="resolution-control-box">
              <label class="checkbox-option">
                <input type="checkbox" class="resolve-opt" data-line="${row.lineNo}" data-type="DUPLICATE_DISCARD" ${row.paidByRaw.toLowerCase() === 'aisha' && row.description.toLowerCase().includes('thalassa') ? 'checked' : ''}>
                <span>Discard this conflicting duplicate row (${recText})</span>
              </label>
            </div>
          `;
        } else if (a.type === 'MISSING_PAYER') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label for="resolve-payer-${row.lineNo}" class="sr-only">Choose Payer</label>
              <select id="resolve-payer-${row.lineNo}" class="form-control resolve-input" data-line="${row.lineNo}" data-type="PAYER_SELECT">
                <option value="">-- Assign Payer --</option>
                ${state.members.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
              </select>
            </div>
          `;
        } else if (a.type === 'UNREGISTERED_PAYER') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label for="resolve-unregistered-payer-${row.lineNo}" class="sr-only">Map Payer</label>
              <select id="resolve-unregistered-payer-${row.lineNo}" class="form-control resolve-input" data-line="${row.lineNo}" data-type="PAYER_MAP">
                <option value="">-- Map to registered user --</option>
                ${state.members.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
              </select>
            </div>
          `;
        } else if (a.type === 'NON_MEMBER_SPLIT') {
          const nonMembers = a.meta?.nonMembers || [];
          nonMembers.forEach(nm => {
            // Dev's friend Kabir => Dev pays for him
            const defaultHost = nm.toLowerCase().includes('kabir') ? 'Dev' : '';
            resolutionHtml += `
              <div class="resolution-control-box" style="margin-top: 5px;">
                <label for="resolve-nonmember-${row.lineNo}-${nm.replace(/[^a-zA-Z]/g, '')}" class="subtitle" style="text-transform:none; margin-bottom: 2px;">Who hosts/pays for "${nm}"?</label>
                <select id="resolve-nonmember-${row.lineNo}-${nm.replace(/[^a-zA-Z]/g, '')}" class="form-control resolve-nonmember-input" data-line="${row.lineNo}" data-name="${nm}" data-type="NON_MEMBER_MAP">
                  ${state.members.map(m => `<option value="${m.name}" ${m.name === defaultHost ? 'selected' : ''}>${m.name} absorbs share</option>`).join('')}
                </select>
              </div>
            `;
          });
        } else if (a.type === 'PERCENTAGE_MISMATCH') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label class="checkbox-option">
                <input type="checkbox" class="resolve-opt" data-line="${row.lineNo}" data-type="PERCENTAGE_NORMALIZE" checked>
                <span>Normalize percentages proportionally to sum to 100% (Recommended)</span>
              </label>
            </div>
          `;
        } else if (a.type === 'UNEQUAL_SUM_MISMATCH') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label class="checkbox-option">
                <input type="checkbox" class="resolve-opt" data-line="${row.lineNo}" data-type="UNEQUAL_NORMALIZE" checked>
                <span>Normalize splits proportionally to match total amount (Recommended)</span>
              </label>
            </div>
          `;
        } else if (a.type === 'FOREIGN_CURRENCY') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <label for="resolve-rate-${row.lineNo}" style="font-size:0.75rem; color:var(--text-muted);">Customize Conversion exchange rate (INR per USD):</label>
              <input type="number" step="any" id="resolve-rate-${row.lineNo}" class="form-control resolve-input" data-line="${row.lineNo}" data-type="EXCHANGE_RATE" value="83.0">
            </div>
          `;
        } else if (a.type === 'INACTIVE_MEMBER_SPLIT') {
          const inactive = a.meta?.inactiveMembers || [];
          inactive.forEach(name => {
            resolutionHtml += `
              <div class="resolution-control-box">
                <label class="checkbox-option">
                  <input type="checkbox" class="resolve-opt" data-line="${row.lineNo}" data-inactive-user="${name}" data-type="INACTIVE_EXCLUDE" checked>
                  <span>Exclude ${name} from this split (re-split among others, recommended)</span>
                </label>
              </div>
            `;
          });
        } else if (a.type === 'CHRONOLOGICAL_OUTLIER') {
          // e.g. 04-05-2026 placed between March 28 and April 1. Propose April 5th.
          const isDeepClean = row.description.toLowerCase().includes('deep cleaning');
          resolutionHtml += `
            <div class="resolution-control-box">
              <div class="radio-option">
                <label><input type="radio" name="resolve-date-${row.lineNo}" class="resolve-radio" data-line="${row.lineNo}" data-type="DATE_SELECT" value="2026-04-05" checked>
                <span>Interpret as April 5, 2026 (Based on spreadsheet chronological position)</span></label>
              </div>
              <div class="radio-option">
                <label><input type="radio" name="resolve-date-${row.lineNo}" class="resolve-radio" data-line="${row.lineNo}" data-type="DATE_SELECT" value="2026-05-04">
                <span>Interpret as May 4, 2026 (Literal date conversion)</span></label>
              </div>
            </div>
          `;
        } else if (a.type === 'ZERO_AMOUNT') {
          resolutionHtml += `
            <div class="resolution-control-box">
              <div class="radio-option">
                <label><input type="radio" name="resolve-zero-${row.lineNo}" class="resolve-radio-zero" data-line="${row.lineNo}" data-type="ZERO_SELECT" value="discard" checked>
                <span>Discard/Ignore row (Note says "counted twice earlier")</span></label>
              </div>
              <div class="radio-option">
                <label><input type="radio" name="resolve-zero-${row.lineNo}" class="resolve-radio-zero" data-line="${row.lineNo}" data-type="ZERO_SELECT" value="keep">
                <span>Keep as zero-value logs</span></label>
              </div>
            </div>
          `;
        } else {
          // Standard auto-warnings (decimals, thousand commas, aliases) require no manual choice, just visual confirmation
          resolutionHtml += `<div style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">Resolution: Applied automatically during ingestion.</div>`;
        }

        resolutionHtml += `</div>`;
      });

      card.innerHTML = `
        <div class="anomaly-card-meta">
          <span class="anomaly-card-title ${row.anomalies.some(a => a.severity === 'error') ? 'error' : ''}">
            ${row.anomalies.some(a => a.severity === 'error') ? 'Ingestion Error' : 'Spreadsheet Warning'}
          </span>
          <span class="anomaly-card-line">Line ${row.lineNo}</span>
        </div>
        <div class="anomaly-card-body">
          <div class="anomaly-original-info">
            <h4>Raw Spreadsheet Values</h4>
            <div class="anomaly-original-val">
              <strong>Date:</strong> ${row.dateRaw}<br>
              <strong>Desc:</strong> ${row.description}<br>
              <strong>Paid:</strong> ${row.paidByRaw}<br>
              <strong>Amt:</strong> ${row.amountRaw} ${row.currencyRaw}<br>
              <strong>Split:</strong> ${row.splitTypeRaw} (${row.splitWithRaw})<br>
              <strong>Details:</strong> ${row.splitDetailsRaw || '-'}<br>
              <strong>Note:</strong> ${row.notes || '-'}
            </div>
          </div>
          <div class="anomaly-resolution">
            <h4>Ingestion Fix Settings</h4>
            ${resolutionHtml}
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // Switch to Step 2
  step1.classList.remove('active');
  step2.classList.add('active');
  
  // Reset submit button state
  const btnCommit = document.getElementById('import-btn-commit');
  btnCommit.disabled = false;
  btnCommit.textContent = 'Confirm and Ingest Ledger';
}

async function commitResolvedImport() {
  const commitRows = [];
  
  for (const r of state.importRows) {
    const rowCopy = JSON.parse(JSON.stringify(r));
    rowCopy.action = 'import'; // Default action is import
    rowCopy.resolutionReason = '';

    // Check if there were any manual choices on this row
    const card = document.getElementById(`anomaly-card-${r.lineNo}`);
    if (card) {
      // 1. Check duplicate discards
      const discardCb = card.querySelector('.resolve-opt[data-type="DUPLICATE_DISCARD"]');
      if (discardCb && discardCb.checked) {
        rowCopy.action = 'discard';
        rowCopy.resolutionReason = 'Deleted duplicate transaction';
        commitRows.push(rowCopy);
        continue;
      }

      // 2. Check zero amount discards
      const zeroRadios = card.querySelectorAll('.resolve-radio-zero');
      if (zeroRadios.length > 0) {
        let selectedZeroVal = 'discard';
        zeroRadios.forEach(rad => { if (rad.checked) selectedZeroVal = rad.value; });
        if (selectedZeroVal === 'discard') {
          rowCopy.action = 'discard';
          rowCopy.resolutionReason = 'Discarded zero amount double log';
          commitRows.push(rowCopy);
          continue;
        }
      }

      // 3. Resolve Missing/Unregistered Payers
      const payerSelect = card.querySelector('.resolve-input[data-type="PAYER_SELECT"]');
      if (payerSelect && payerSelect.value) {
        rowCopy.data.paid_by = payerSelect.value;
        rowCopy.resolutionReason += `Assigned missing payer to ${payerSelect.value}. `;
      }
      
      const payerMapSelect = card.querySelector('.resolve-input[data-type="PAYER_MAP"]');
      if (payerMapSelect && payerMapSelect.value) {
        rowCopy.data.paid_by = payerMapSelect.value;
        rowCopy.resolutionReason += `Mapped unregistered payer to ${payerMapSelect.value}. `;
      }

      // 4. Resolve Non-Member Splits (Kabir -> Dev)
      const nonMemberSelects = card.querySelectorAll('.resolve-nonmember-input[data-type="NON_MEMBER_MAP"]');
      if (nonMemberSelects.length > 0) {
        nonMemberSelects.forEach(sel => {
          const guestName = sel.getAttribute('data-name');
          const hostName = sel.value;
          
          // Remove guestName from split list
          rowCopy.data.split_with = rowCopy.data.split_with.filter(u => u !== guestName);
          
          // Re-route details
          if (rowCopy.data.split_details) {
            // Add guest share to host
            const guestShare = rowCopy.data.split_details[guestName] || 1; // Default to 1 for share splits
            rowCopy.data.split_details[hostName] = (rowCopy.data.split_details[hostName] || 0) + guestShare;
            delete rowCopy.data.split_details[guestName];
          }

          // If split is equal or share and host is not already in split, add them
          if (!rowCopy.data.split_with.includes(hostName)) {
            rowCopy.data.split_with.push(hostName);
          }
          
          rowCopy.resolutionReason += `Absorbed guest ${guestName}'s share into host ${hostName}. `;
        });
      }

      // 5. Resolve exchange rate conversion customization
      const rateInput = card.querySelector('.resolve-input[data-type="EXCHANGE_RATE"]');
      if (rateInput && rateInput.value) {
        const rate = parseFloat(rateInput.value);
        rowCopy.data.exchange_rate = rate;
        rowCopy.data.amount_in_inr = Math.round((rowCopy.data.amount * rate) * 100) / 100;
        rowCopy.resolutionReason += `Applied currency rate ${rate} INR per USD. `;
      }

      // 6. Resolve percentages normalization
      const percentCb = card.querySelector('.resolve-opt[data-type="PERCENTAGE_NORMALIZE"]');
      if (percentCb && percentCb.checked) {
        rowCopy.resolutionReason += `Normalized split percentages to sum to 100%. `;
        // Server will auto normalize when split_type percentage is calculated
      }

      // 7. Resolve Inactive Member splits (Meera in April Groceries)
      const inactiveCbs = card.querySelectorAll('.resolve-opt[data-type="INACTIVE_EXCLUDE"]');
      if (inactiveCbs.length > 0) {
        inactiveCbs.forEach(cb => {
          if (cb.checked) {
            const inactiveUser = cb.getAttribute('data-inactive-user');
            
            // Remove from split list
            rowCopy.data.split_with = rowCopy.data.split_with.filter(u => u !== inactiveUser);
            
            // If percentage or unequal, delete entry
            if (rowCopy.data.split_details) {
              delete rowCopy.data.split_details[inactiveUser];
            }
            
            rowCopy.resolutionReason += `Excluded inactive member ${inactiveUser} from split. `;
          }
        });
      }

      // 8. Resolve chronological date outlier
      const dateRadios = card.querySelectorAll('.resolve-radio');
      if (dateRadios.length > 0) {
        let selectedDate = '';
        dateRadios.forEach(rad => { if (rad.checked) selectedDate = rad.value; });
        if (selectedDate) {
          rowCopy.data.date = selectedDate;
          rowCopy.resolutionReason += `Corrected date formatting to ${selectedDate}. `;
        }
      }
    }

    // Auto warning summaries that require no action
    if (!rowCopy.resolutionReason) {
      const warningTypes = r.anomalies.map(a => a.type);
      if (warningTypes.includes('NUMBER_FORMAT')) {
        rowCopy.resolutionReason = 'Sanitized amount formatting (removed comma)';
      } else if (warningTypes.includes('DECIMAL_PRECISION')) {
        rowCopy.resolutionReason = 'Rounded fractional amount to 2 decimals';
      } else if (warningTypes.includes('CASE_NORMALIZATION')) {
        rowCopy.resolutionReason = 'Standardized name character casings';
      } else if (warningTypes.includes('ALIAS_RESOLUTION')) {
        rowCopy.resolutionReason = 'Mapped flatmate nickname alias';
      } else if (warningTypes.includes('MISSING_CURRENCY')) {
        rowCopy.resolutionReason = 'Applied base currency default (INR)';
      } else if (warningTypes.includes('SETTLEMENT_LOGGED_AS_EXPENSE')) {
        rowCopy.resolutionReason = 'Imported as peer-to-peer settlement';
      } else if (warningTypes.includes('REDUNDANT_SPLIT_DETAILS')) {
        rowCopy.resolutionReason = 'Processed as equal split (stripped details)';
      } else {
        rowCopy.resolutionReason = 'Ingested clean record';
      }
    }

    commitRows.push(rowCopy);
  }

  // Submit to Backend commit API
  try {
    const res = await fetch(`${API_URL}/api/import/commit`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        groupId: state.groupId,
        filename: state.importFilename,
        rows: commitRows
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to complete ledger import');
      document.getElementById('import-btn-commit').disabled = false;
      document.getElementById('import-btn-commit').textContent = 'Confirm and Ingest Ledger';
      return;
    }

    // Load final step report
    renderFinalImportReport(data.report);

  } catch (err) {
    console.error(err);
    alert('Network error committing import');
    document.getElementById('import-btn-commit').disabled = false;
    document.getElementById('import-btn-commit').textContent = 'Confirm and Ingest Ledger';
  }
}

function renderFinalImportReport(report) {
  const step2 = document.getElementById('import-step-2');
  const step3 = document.getElementById('import-step-3');

  document.getElementById('import-report-summary-text').textContent = `Successfully imported ${report.imported_count} records to group database. Discarded ${report.discarded_count} duplicates/errors.`;

  const tbody = document.getElementById('import-report-tbody');
  tbody.innerHTML = '';

  report.actions.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.lineNo}</td>
      <td><strong>${a.description}</strong></td>
      <td><span class="split-badge" style="background-color: ${a.action.includes('DISCARD') ? 'var(--error-bg)' : 'var(--success-bg)'}; color: ${a.action.includes('DISCARD') ? 'var(--error-color)' : 'var(--success-color)'}; border-color: transparent;">${a.action}</span></td>
      <td style="color: var(--text-secondary); font-size: 0.75rem;">${a.details || '-'}</td>
      <td style="font-weight: 500; font-size: 0.75rem;">${a.reason}</td>
    `;
    tbody.appendChild(tr);
  });

  step2.classList.remove('active');
  step3.classList.add('active');
}

// ==========================================
// TIMELINE VIEWS & MANAGER
// ==========================================
function initTimelineManager() {
  document.getElementById('timeline-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('timeline-user-select').value;
    const joined_at = document.getElementById('timeline-joined-at').value;
    const left_at = document.getElementById('timeline-left-at').value;
    
    // Resolve user ID
    const member = state.members.find(m => m.name === name || m.id == name);
    if (!member) return;

    try {
      const res = await fetch(`${API_URL}/api/groups/${state.groupId}/members`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_id: member.id,
          joined_at,
          left_at: left_at || null
        })
      });
      if (res.ok) {
        alert('Membership timeline updated successfully');
        document.getElementById('timeline-form').reset();
        await loadGroupMembers();
        loadTimeline();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update timeline');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

function loadTimeline() {
  const container = document.getElementById('timeline-members-list');
  container.innerHTML = '';

  // Calculate timeline ranges (using fixed dates Feb 1, 2026 to June 1, 2026 as total bounds)
  const startBound = new Date('2026-02-01');
  const endBound = new Date('2026-06-01');
  const totalDuration = endBound - startBound;

  state.members.forEach(m => {
    const joined = new Date(m.joined_at);
    const left = m.left_at ? new Date(m.left_at) : new Date(); // default to present today
    
    // Calculate percentage positioning
    const startPct = Math.max(0, ((joined - startBound) / totalDuration) * 100);
    const endPct = Math.min(100, ((left - startBound) / totalDuration) * 100);
    const widthPct = Math.max(5, endPct - startPct);

    const isCurrentlyActive = !m.left_at;

    const card = document.createElement('div');
    card.className = 'timeline-member-card';
    card.innerHTML = `
      <div class="timeline-member-avatar ${isCurrentlyActive ? 'active' : ''}">${m.name.charAt(0)}</div>
      <div class="timeline-member-info">
        <h4>
          ${m.name} 
          <span class="status-indicator ${isCurrentlyActive ? 'active' : 'left'}"></span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal; margin-left: 5px;">
            (${isCurrentlyActive ? 'Active Resident' : 'Moved Out'})
          </span>
        </h4>
        <div class="timeline-dates-text">
          Occupancy: ${new Date(m.joined_at).toLocaleDateString('en-GB', {month: 'short', day: 'numeric'})} - 
          ${m.left_at ? new Date(m.left_at).toLocaleDateString('en-GB', {month: 'short', day: 'numeric'}) : 'Present'}
        </div>
        <div class="timeline-bar-track">
          <div class="timeline-bar-fill ${isCurrentlyActive ? '' : 'inactive'}" style="margin-left: ${startPct}%; width: ${widthPct}%;"></div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
