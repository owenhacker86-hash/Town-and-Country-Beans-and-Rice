const ICONS = { beans: '🫘', rice: '🍚', combo: '🛍️' };
const money = (n) => '$' + n.toFixed(2);
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let products = [];
let ordersOpen = false;
let cart = loadCart(); // { productId: qty }

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart')) || {}; } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem('cart', JSON.stringify(cart)); } catch {}
  renderCart();
}

async function loadProducts() {
  const [prodRes, settingsRes] = await Promise.all([fetch('/api/products'), fetch('/api/settings')]);
  products = await prodRes.json();
  const settings = await settingsRes.json();
  ordersOpen = settings.ordersOpen;
  $('notice').textContent = settings.closedMessage;
  $('notice').classList.toggle('hidden', ordersOpen);
  $('cart-btn').classList.toggle('hidden', !ordersOpen);
  if (!ordersOpen) closeCart();
  // Drop cart entries for products that no longer exist
  for (const id of Object.keys(cart)) if (!products.find((p) => p.id === id)) delete cart[id];
  renderProducts();
  renderCart();
}

function renderProducts() {
  $('products').innerHTML = products.length ? products.map((p) => `
    <article class="card">
      <div class="card-art ${p.category}">${escapeHtml(p.icon || ICONS[p.category] || '📦')}</div>
      <div class="card-body">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description)}</p>
        <div class="meta"><span class="price">${money(p.price)}</span><span>${escapeHtml(p.weight)}</span></div>
        ${ordersOpen ? `
          <div class="meta"><span>${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span></div>
          <button class="btn-primary" data-add="${p.id}" ${p.stock <= (cart[p.id] || 0) ? 'disabled' : ''}>
            ${p.stock > 0 ? 'Add to cart' : 'Sold out'}
          </button>` : '<button disabled>Orders paused</button>'}
      </div>
    </article>`).join('') : '<p class="empty">No products yet.</p>';
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find((x) => x.id === id);
    return p ? sum + p.price * qty : sum;
  }, 0);
}

function renderCart() {
  const entries = Object.entries(cart);
  $('cart-count').textContent = entries.reduce((n, [, q]) => n + q, 0);
  $('cart-lines').innerHTML = entries.length ? entries.map(([id, qty]) => {
    const p = products.find((x) => x.id === id);
    if (!p) return '';
    return `
      <div class="cart-line">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <small>${escapeHtml(p.weight)} · ${money(p.price)} each</small>
        </div>
        <div class="qty">
          <button data-dec="${id}" aria-label="Decrease">−</button>
          <span>${qty}</span>
          <button data-inc="${id}" aria-label="Increase" ${qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('') : '<p class="empty">Your cart is empty.</p>';
  $('cart-total').textContent = money(cartTotal());
  $('checkout-total').textContent = money(cartTotal());
  $('to-checkout').disabled = entries.length === 0 || !ordersOpen;
  renderProducts();
}

function showStep(step) {
  $('cart-view').classList.toggle('hidden', step !== 'cart');
  $('checkout-form').classList.toggle('hidden', step !== 'checkout');
  $('confirmation').classList.toggle('hidden', step !== 'done');
  $('drawer-title').textContent = { cart: 'Your cart', checkout: 'Checkout', done: 'Thank you!' }[step];
}

function openCart() {
  showStep('cart');
  $('drawer').classList.add('open');
  $('overlay').classList.add('open');
}
function closeCart() {
  $('drawer').classList.remove('open');
  $('overlay').classList.remove('open');
}

// --- events ---------------------------------------------------------------

$('products').addEventListener('click', (e) => {
  const id = e.target.dataset.add;
  if (!id) return;
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
});

$('cart-lines').addEventListener('click', (e) => {
  const { inc, dec } = e.target.dataset;
  if (inc) cart[inc] += 1;
  if (dec) {
    cart[dec] -= 1;
    if (cart[dec] <= 0) delete cart[dec];
  }
  if (inc || dec) saveCart();
});

$('cart-btn').addEventListener('click', openCart);
$('close-cart').addEventListener('click', closeCart);
$('overlay').addEventListener('click', closeCart);
$('to-checkout').addEventListener('click', () => showStep('checkout'));
$('back-to-cart').addEventListener('click', () => showStep('cart'));

$('checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const submit = e.target.querySelector('[type=submit]');
  submit.disabled = true;
  $('checkout-msg').innerHTML = '';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: Object.fromEntries(form),
        items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not place order.');

    cart = {};
    saveCart();
    e.target.reset();
    $('confirmation').innerHTML = `
      <div class="msg success">Order <strong>${data.id}</strong> received!</div>
      <p>Total: <strong>${money(data.total)}</strong> (${data.payment === 'cash' ? 'cash on delivery' : 'bank transfer'}).</p>
      <p>We'll contact you at ${escapeHtml(data.customer.phone)} to confirm delivery.</p>
      <button class="btn-primary btn-block" id="continue">Continue shopping</button>`;
    $('continue').addEventListener('click', closeCart);
    showStep('done');
    loadProducts();
  } catch (err) {
    $('checkout-msg').innerHTML = `<div class="msg error">${escapeHtml(err.message)}</div>`;
  } finally {
    submit.disabled = false;
  }
});

$('year').textContent = new Date().getFullYear();
loadProducts();
