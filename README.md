# COMP2171 Project: White Rose WhatsApp Order System

This repository contains a COMP2171 software engineering project built around a WhatsApp-based order workflow for White Rose Interiors. The system combines a customer-facing chatbot, a browser-based admin dashboard, PDF estimate and invoice generation, and local JSON-backed order tracking.

## Project Scope

- Customer interaction through WhatsApp using `whatsapp-web.js`
- Quote generation for blinds and cleaning supplies
- Order capture and status tracking
- Admin dashboard for analytics, reporting, reminders, and order updates
- PDF estimate and invoice generation

## Tech Stack

- Node.js
- Express
- whatsapp-web.js
- PDFKit
- Nodemailer
- Plain HTML, CSS, and JavaScript for the dashboard

## Running the Project

1. Install dependencies with `npm install`
2. Create a local `.env` file if you want to override the default `PORT`
3. Start the app with `npm start`
4. Open `http://localhost:3000/dashboard.html`
5. Pair the WhatsApp client by scanning the QR code shown in the terminal when prompted

## Marker Run Guide

For the smoothest setup, use Node.js 20 LTS. The project may still run on other versions, but the codebase itself warns that `whatsapp-web.js` is more reliable on Node 20.

This README includes the information needed for a marker to run and verify the system without guesswork. It explains how to install and start the project, which pages to open in the browser, how to access the main dashboard sections, how to test the WhatsApp bot workflow, and the current admin login credentials required to access the protected dashboard features.

### 1. Install and start

1. Run `npm install`
2. Run `npm start`
3. Wait for the server to start
4. If this is the first run, scan the WhatsApp QR code shown in the terminal

### 2. Open the admin interface

Use the browser and go to:

- `http://localhost:3000/login.html`

You can also open:

- `http://localhost:3000/dashboard.html`

If you are not authenticated, the dashboard page redirects to the login page.

### 3. Admin login details

The current admin credentials implemented in the code are:

- Username: `admin`
- Password: `admin123`

These are defined in the backend login handler in `src/server.js`.

### 4. Dashboard sections

After signing in, the marker can access these sections from the sidebar:

- `Revenue & Analytics`
  Shows summary cards, revenue figures, monthly chart data, and product distribution.
- `Order Management`
  Shows the order table and allows filtering, status changes, reminder updates, date updates, order deletion, and report download.
- `Connect Device`
  Shows WhatsApp connection status and QR-code state.

### 5. WhatsApp / chatbot testing

The customer-facing flow runs through the paired WhatsApp account. Once the QR code is scanned:

1. Send a message such as `Hi`
2. Follow the bot menu to request quotes, view order status, or manage existing orders

The implemented conversational flows include:

- Quote generation for blinds
- Quote generation for cleaning supplies
- Order confirmation
- Order status lookup
- Manage Orders
  Includes rescheduling and cancellation for eligible orders
- FAQ and contact-support responses

### 6. Testing order-management features from the dashboard

The dashboard reads from `orders.json`, so existing saved orders can be used immediately for testing. From the `Order Management` section, the marker can test:

- changing an order status
- editing scheduled dates
- editing reminder times
- sending a ready/completion notification
- downloading the CSV report
- deleting orders

### 7. Pricing maintenance

Pricing is currently maintained through:

- `prices.json`

There is no runtime dashboard screen for editing prices in the current implementation. To test updated pricing, edit `prices.json` and restart the application.

### 8. Optional launcher

The repository also includes `WhiteRoseBot.bat`, which attempts to open the dashboard and start the server on Windows. The most reliable cross-checking method is still:

- `npm install`
- `npm start`

## Project Structure

- `index.js`: application entry point
- `src/`: backend modules for the bot, pricing, orders, reminders, invoices, email, and server
- `public/`: dashboard UI assets
- `prices.json`, `orders.json`, `reminders.json`, `cleaning_supply.json`: local data files
- `Project Documentation/`: project documentation sources and exports

## Repository Notes

- Generated files such as runtime caches, build outputs, local environment files, and generated PDFs should not be committed
- The app can recreate the `public/invoices/` output directory as needed

## License

This project is licensed under the MIT License. See `LICENSE`.
