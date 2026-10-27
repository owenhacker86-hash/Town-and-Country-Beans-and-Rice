# Town and Country Beans and Rice

Online store selling cheap and delicious beans and rice packets for dirt cheap: Mexican tomato rice & refried beans, Colombian coconut rice & black beans, and Indian jasmine rice & lentil blend. No dependencies, just Node.js 18+.

## Run it

```bash
ADMIN_PASSWORD=choose-a-password npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin (the default password is `admin123` if `ADMIN_PASSWORD` isn't set)

## Features

**Ordering is paused right now.** The site shows a banner saying it isn't taking orders, the cart and
"Add to cart" buttons are hidden, and the server refuses any orders sent to it. To start taking orders,
log in to `/admin` and turn on **Accept orders on the website** in the **Ordering** box. You can change the banner message there too.

**Customers**
- Browse the products
- Cart that's saved in the browser
- Checkout with name, phone, address and notes. Payment is cash on delivery or bank transfer.

**Admin**
- Dashboard showing orders, pending count, revenue and low-stock items
- See every order and change its status (pending → paid → shipped → delivered / cancelled)
- Add, edit and delete products, and set price, stock and icon

Stock goes down when an order is placed and goes back up when an order is cancelled.
The server recalculates prices and checks stock, so customers can't change them from the browser.

## Data

Everything is saved as JSON in `data/`:
- `products.json`: your catalog (you can edit it by hand or in the admin page)
- `orders.json`: orders that have been placed
- `settings.json`: whether orders are open and the message shown when they're paused

## Next steps for going live
- Use a database (SQLite or Postgres) instead of the JSON files if you get a lot of orders
- Add online card payments (Stripe, PayPal, or a local provider)
- Send order confirmation emails or SMS
- Host it somewhere (Render, Railway, Fly.io or a VPS) and serve it over HTTPS
