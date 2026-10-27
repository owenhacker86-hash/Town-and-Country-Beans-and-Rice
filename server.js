// Beans & Rice Shop - zero-dependency Node server.
// Run: node server.js   (optional env: PORT, ADMIN_PASSWORD)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DEFAULT_SETTINGS = { ordersOpen: false, closedMessage: 'We are not taking orders right now. Check back soon!' };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// --- storage -------------------------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const getProducts = () => readJson(PRODUCTS_FILE, []);
const getOrders = () => readJson(ORDERS_FILE, []);
const getSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) });

// --- helpers -------------------------------------------------------------

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function isAdmin(req) {
  const given = Buffer.from(req.headers['x-admin-password'] || '');
  const expected = Buffer.from(ADMIN_PASSWORD);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function validateProduct(p) {
  const errors = [];
  if (!p.name || typeof p.name !== 'string') errors.push('name is required');
  if (!['beans', 'rice', 'combo'].includes(p.category)) errors.push('category must be beans, rice or combo');
  if (!(Number(p.price) > 0)) errors.push('price must be greater than 0');
  if (!(Number.isInteger(Number(p.stock)) && Number(p.stock) >= 0)) errors.push('stock must be a whole number >= 0');
  return errors;
}

function cleanProduct(p) {
  return {
    name: String(p.name).trim(),
    category: p.category,
    icon: String(p.icon || '').trim().slice(0, 16),
    weight: String(p.weight || '').trim(),
    price: Math.round(Number(p.price) * 100) / 100,
    stock: Number(p.stock),
    description: String(p.description || '').trim(),
  };
}

// --- API -----------------------------------------------------------------

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  // Public: list products
  if (pathname === '/api/products' && method === 'GET') {
    return send(res, 200, getProducts());
  }

  // Public: shop settings (whether orders are open)
  if (pathname === '/api/settings' && method === 'GET') {
    return send(res, 200, getSettings());
  }

  // Public: place an order. Prices and stock are checked server-side.
  if (pathname === '/api/orders' && method === 'POST') {
    const settings = getSettings();
    if (!settings.ordersOpen) return send(res, 403, { error: settings.closedMessage });
    const body = await readBody(req);
    const { customer = {}, items = [] } = body;

    if (!customer.name || !customer.phone || !customer.address) {
      return send(res, 400, { error: 'Name, phone and delivery address are required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return send(res, 400, { error: 'Your cart is empty.' });
    }

    const products = getProducts();
    const lines = [];
    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      const qty = Number(item.qty);
      if (!product) return send(res, 400, { error: 'A product in your cart no longer exists.' });
      if (!Number.isInteger(qty) || qty < 1) return send(res, 400, { error: 'Invalid quantity.' });
      if (qty > product.stock) {
        return send(res, 400, { error: `Only ${product.stock} left of ${product.name}.` });
      }
      lines.push({ id: product.id, name: product.name, weight: product.weight, price: product.price, qty });
    }

    for (const line of lines) {
      products.find((p) => p.id === line.id).stock -= line.qty;
    }

    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const order = {
      id: 'ORD-' + Date.now().toString(36).toUpperCase(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      customer: {
        name: String(customer.name).trim(),
        phone: String(customer.phone).trim(),
        email: String(customer.email || '').trim(),
        address: String(customer.address).trim(),
        notes: String(customer.notes || '').trim(),
      },
      payment: customer.payment === 'transfer' ? 'transfer' : 'cash',
      items: lines,
      total: Math.round(subtotal * 100) / 100,
    };

    const orders = getOrders();
    orders.unshift(order);
    writeJson(PRODUCTS_FILE, products);
    writeJson(ORDERS_FILE, orders);
    return send(res, 201, order);
  }

  // Everything below is admin-only
  if (pathname.startsWith('/api/admin')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin password.' });

    if (pathname === '/api/admin/login' && method === 'POST') {
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const body = await readBody(req);
      const settings = {
        ordersOpen: Boolean(body.ordersOpen),
        closedMessage: String(body.closedMessage || '').trim() || DEFAULT_SETTINGS.closedMessage,
      };
      writeJson(SETTINGS_FILE, settings);
      return send(res, 200, settings);
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      return send(res, 200, getOrders());
    }

    const orderMatch = pathname.match(/^\/api\/admin\/orders\/([\w-]+)$/);
    if (orderMatch && method === 'PATCH') {
      const body = await readBody(req);
      const allowed = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
      if (!allowed.includes(body.status)) return send(res, 400, { error: 'Invalid status.' });
      const orders = getOrders();
      const order = orders.find((o) => o.id === orderMatch[1]);
      if (!order) return send(res, 404, { error: 'Order not found.' });

      // Return items to stock when an order is cancelled (and take them back if un-cancelled)
      if (body.status !== order.status && (body.status === 'cancelled' || order.status === 'cancelled')) {
        const products = getProducts();
        const sign = body.status === 'cancelled' ? 1 : -1;
        for (const line of order.items) {
          const p = products.find((x) => x.id === line.id);
          if (p) p.stock = Math.max(0, p.stock + sign * line.qty);
        }
        writeJson(PRODUCTS_FILE, products);
      }

      order.status = body.status;
      writeJson(ORDERS_FILE, orders);
      return send(res, 200, order);
    }

    if (pathname === '/api/admin/products' && method === 'POST') {
      const body = await readBody(req);
      const errors = validateProduct(body);
      if (errors.length) return send(res, 400, { error: errors.join(', ') });
      const products = getProducts();
      const product = { id: crypto.randomUUID().slice(0, 8), ...cleanProduct(body) };
      products.push(product);
      writeJson(PRODUCTS_FILE, products);
      return send(res, 201, product);
    }

    const productMatch = pathname.match(/^\/api\/admin\/products\/([\w-]+)$/);
    if (productMatch && method === 'PUT') {
      const body = await readBody(req);
      const errors = validateProduct(body);
      if (errors.length) return send(res, 400, { error: errors.join(', ') });
      const products = getProducts();
      const idx = products.findIndex((p) => p.id === productMatch[1]);
      if (idx === -1) return send(res, 404, { error: 'Product not found.' });
      products[idx] = { id: products[idx].id, ...cleanProduct(body) };
      writeJson(PRODUCTS_FILE, products);
      return send(res, 200, products[idx]);
    }
    if (productMatch && method === 'DELETE') {
      const products = getProducts().filter((p) => p.id !== productMatch[1]);
      writeJson(PRODUCTS_FILE, products);
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

// --- static files ---------------------------------------------------------

function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (filePath === '/admin') filePath = '/admin.html';
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(data);
  });
}

// --- boot -----------------------------------------------------------------

if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    serveStatic(req, res, url);
  } catch (err) {
    send(res, 400, { error: err.message || 'Bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`Shop running at http://localhost:${PORT}`);
  console.log(`Admin panel at  http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.log('Using default admin password "admin123" - set ADMIN_PASSWORD to change it.');
});
