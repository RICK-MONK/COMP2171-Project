"""
Project Guideline: COMP2171 White Rose Chatbot/Admin Portal
--------------------------------------------------

What this project does
- WhatsApp Bot: Uses whatsapp-web.js (see src/bot.js) to chat with customers, build carts/quotes, generate PDFs, and place orders into orders.json.
- HTTP/API Server: Express server (index.js / src/server.js) serves the admin dashboard (public/) and provides JSON APIs for orders, login, status, reminders, and report download.
- Scheduling: reminderScheduler.js polls orders with reminder times and triggers WhatsApp reminders through the bot.
- Invoicing/Email: invoice.js builds PDFs under public/invoices; email.js can email estimates/orders.

Prerequisites
- Node.js 18+ and npm
- A WhatsApp account to pair via QR (first run will prompt a QR in the terminal).
- Optional: Gmail/SMTP creds in .env for email sending.

Initial setup (one time)
1) Install dependencies
   npm install
2) Configure environment (.env)
   PORT=3000
   ADMIN_USER=admin
   ADMIN_PASS=changeme
   COMPANY_PHONE=876-555-1234
   (Add SMTP settings if you plan to send emails.)
3) Ensure writable folders
   public/invoices/  (PDF output)
   orders.json       (order store)

How to start the system
1) From the project root:
   npm start
2) Watch the terminal:
   - You’ll see “>>> SYSTEM ONLINE <<<” when the bot is ready.
   - A QR code appears on first run; scan with your WhatsApp to authenticate.
3) Open the admin dashboard:
   http://localhost:3000/dashboard.html
   - Login using ADMIN_USER / ADMIN_PASS from .env.
   - Orders, status, and reminders load from the backend APIs.
4) WhatsApp interaction:
   - Message the bot (“Hi”) to get the menu (goods/services, manage orders, status, support, FAQ).
   - Quotes/PDFs write into public/invoices; orders persist to orders.json.

Common operations
- Restart: Ctrl+C then npm start.
- Clear orders: use the dashboard “Clear All” or remove orders.json (with the app stopped).
- Update prices/products: edit prices.json and config.js (product definitions).

Troubleshooting
- No QR / stuck connecting: delete .wwebjs_auth/ to force re-auth, then npm start again.
- Cannot write invoices/orders: verify public/invoices and orders.json are writable.
- Dashboard 401/redirect to login: ensure ADMIN_USER/ADMIN_PASS set and resend credentials.
- Emails not sending: confirm SMTP creds in .env and internet access.

Quick architecture map
- Entry: index.js
- Bot logic: src/bot.js (poll-driven WhatsApp flows)
- Helpers: src/botHelpers.js, src/orderUtils.js, src/pricing.js
- Persistence: orders.json
- Frontend: public/dashboard.html + public/js/script.js
- Scheduling: src/reminderScheduler.js
"""

if __name__ == "__main__":
    print(__doc__)
