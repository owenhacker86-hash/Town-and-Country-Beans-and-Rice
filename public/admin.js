const $ = (id) => document.getElementById(id);
const money = (n) => '$' + n.toFixed(2);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

let password = sessionStorage.getItem('adminPassword') || '';
let products = [];

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password, ...options.headers },
  });
  const data = await res.json();
  if (res.status === 401) logout();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showDashboard(show) {
  $('login').classList.toggle('hidden', show);
  $('dashboard').classList.toggle('hidden', !show);
  $('logout').classList.toggle('hidden', !show);
}

function logout() {
  password = '';
  sessionStorage.removeItem('adminPassword');
  showDashboard(false);
}

async function refresh() {
  const [orders, prods, settings] = await Promise.all([
    api('/api/admin/orders'),
    fetch('/api/products').then((r) => r.json()),
    fetch('/api/settings').then((r) => r.json()),
  ]);
  products = prods;
  $('settings-form').elements.ordersOpen.checked = settings.ordersOpen;
  $('settings-form').elements.closedMessage.value = settings.closedMessage;
  renderStats(orders);
  renderOrders(orders);
  renderProducts();
}

function renderStats(orders) {
  const active = orders.filter((o) => o.status !== 'cancelled');
  const revenue = active.reduce((s, o) => s + o.total, 0);
  const pending = orders.filter((o) => o.status === 'pending').length;
  const lowStock = products.filter((p) => p.stock < 10).length;
  $('stats').innerHTML = [
    ['Orders', orders.length],
    ['Pending', pending],
    ['Revenue', money(revenue)],
    ['Low stock items', lowStock],
  ].map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`).join('');
}

function renderOrders(orders) {
  if (!orders.length) {
    $('orders').innerHTML = '<tr><td class="empty">No orders yet.</td></tr>';
    return;
  }
  $('orders').innerHTML = `
    <tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
    ${orders.map((o) => `
      <tr>
        <td><strong>${o.id}</strong><br><small>${new Date(o.createdAt).toLocaleString()}</small></td>
        <td>
          ${escapeHtml(o.customer.name)}<br>
          <small>${escapeHtml(o.customer.phone)}${o.customer.email ? ' · ' + escapeHtml(o.customer.email) : ''}</small><br>
          <small>${escapeHtml(o.customer.address)}</small>
          ${o.customer.notes ? `<br><small><em>${escapeHtml(o.customer.notes)}</em></small>` : ''}
        </td>
        <td>${o.items.map((i) => `${i.qty} × ${escapeHtml(i.name)}`).join('<br>')}</td>
        <td>${money(o.total)}<br><small>${o.payment === 'cash' ? 'Cash on delivery' : 'Bank transfer'}</small></td>
        <td>
          <select data-order="${o.id}">
            ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('')}`;
}

function renderProducts() {
  $('products').innerHTML = `
    <tr><th>Name</th><th>Category</th><th>Size</th><th>Price</th><th>Stock</th><th></th></tr>
    ${products.map((p) => `
      <tr>
        <td>${escapeHtml(p.icon || '')} ${escapeHtml(p.name)}</td>
        <td>${p.category}</td>
        <td>${escapeHtml(p.weight)}</td>
        <td>${money(p.price)}</td>
        <td>${p.stock < 10 ? `<strong style="color:var(--danger)">${p.stock}</strong>` : p.stock}</td>
        <td style="white-space:nowrap">
          <button data-edit="${p.id}">Edit</button>
          <button class="btn-danger" data-delete="${p.id}">Delete</button>
        </td>
      </tr>`).join('')}`;
}

function resetProductForm() {
  $('product-form').reset();
  $('product-form').elements.id.value = '';
  $('product-form-title').textContent = 'Add product';
  $('cancel-edit').classList.add('hidden');
  $('product-msg').innerHTML = '';
}

// --- events ---------------------------------------------------------------

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = new FormData(e.target).get('password');
  try {
    await api('/api/admin/login', { method: 'POST' });
    sessionStorage.setItem('adminPassword', password);
    showDashboard(true);
    refresh();
  } catch (err) {
    $('login-msg').innerHTML = `<div class="msg error">${escapeHtml(err.message)}</div>`;
  }
});

$('logout').addEventListener('click', logout);

$('orders').addEventListener('change', async (e) => {
  const id = e.target.dataset.order;
  if (!id) return;
  try {
    await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
  } catch (err) {
    alert(err.message);
  }
  refresh();
});

$('products').addEventListener('click', async (e) => {
  const { edit, delete: del } = e.target.dataset;
  if (edit) {
    const p = products.find((x) => x.id === edit);
    const form = $('product-form');
    for (const key of ['id', 'name', 'category', 'icon', 'weight', 'price', 'stock', 'description']) form.elements[key].value = p[key];
    $('product-form-title').textContent = `Edit: ${p.name}`;
    $('cancel-edit').classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
  }
  if (del) {
    const p = products.find((x) => x.id === del);
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await api(`/api/admin/products/${del}`, { method: 'DELETE' });
    refresh();
  }
});

$('cancel-edit').addEventListener('click', resetProductForm);

$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.elements;
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ ordersOpen: form.ordersOpen.checked, closedMessage: form.closedMessage.value }),
    });
    $('settings-msg').innerHTML = '<div class="msg success">Saved.</div>';
  } catch (err) {
    $('settings-msg').innerHTML = `<div class="msg error">${escapeHtml(err.message)}</div>`;
  }
});

$('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    });
    resetProductForm();
    $('product-msg').innerHTML = '<div class="msg success">Product saved.</div>';
    refresh();
  } catch (err) {
    $('product-msg').innerHTML = `<div class="msg error">${escapeHtml(err.message)}</div>`;
  }
});

// Auto-login if the password is remembered for this browser tab
if (password) {
  api('/api/admin/login', { method: 'POST' })
    .then(() => { showDashboard(true); refresh(); })
    .catch(() => {});
}
