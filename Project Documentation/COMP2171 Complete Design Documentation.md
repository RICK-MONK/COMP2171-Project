<!-- TODO: Transfer this content into the official "COMP2171 Complete Design Documentation.docx" template once that file is added to the repository. The template file was not present in this repo at the time of writing. -->

# COMP2171 Complete Design Documentation

## White Rose WhatsApp Order System

## 1. Background and Proposed Solution

White Rose Interiors handles customer enquiries, quotations, order updates, and delivery coordination through conversational interaction. Managing these activities manually over chat introduces delays, inconsistent responses, and additional administrative effort whenever staff need to quote a product, confirm an order, update delivery status, or remind a customer about a scheduled job.

The proposed solution is a Node.js based WhatsApp order system that automates the most repetitive customer-service and administration tasks while keeping the business on a familiar communication channel. The implemented system combines a WhatsApp chatbot, a browser-based dashboard, PDF generation for estimates and invoices, and lightweight JSON persistence for orders, reminders, and catalog data.

The current codebase supports the following operational capabilities:

- Guided quotation for blinds and cleaning supplies through WhatsApp.
- Order creation and basic order self-management for existing customers.
- Administrative dashboard access for viewing orders, analytics, reminders, and system connection status.
- Job-status updates with customer-facing WhatsApp notifications.
- Scheduled reminder delivery for orders with due reminder times.
- PDF estimate and invoice generation and optional email delivery.

This document aligns the design discussion with the implemented repository and gives specific emphasis to the assigned responsibilities of Schedule Appointment, Receive Reminders, View Dashboard, Update Pricing, Update Job Status, Send Completion Message, and Send Proactive Notification.

## 2. Domain Model

### Figure 2.1: Domain Model
Diagram source: `../docs/diagrams/domain-model.puml`

This domain model identifies the principal business entities and relationships implemented in the project. A `Customer` can create and manage `Order` records. Each `Order` aggregates one or more `OrderItem` entries derived from the pricing catalog, may carry scheduling and reminder information, and may generate an `InvoiceDocument`. Administrators review and update orders through the dashboard, while `ReminderLog` entries record automated reminder attempts.

The domain model is intentionally focused on persistent business concepts instead of low-level framework classes. This keeps the analysis aligned with the problem domain while still matching the JSON files and service modules used by the application.

## 3. Use Case Model

### 3.1 Use Case Diagram

#### Figure 3.1: Use Case Overview
Diagram source: `../docs/diagrams/usecase-overview.puml`

This diagram shows the externally visible interactions between customers, administrators, and the implemented system. It includes both customer-facing chatbot behaviour and staff-facing administrative actions. The assigned responsibilities are highlighted as first-class use cases rather than left as implied dashboard actions.

### 3.2 Use Case Specifications

#### 3.2.1 Schedule Appointment

Purpose: Allow a customer to reschedule an existing order appointment through the WhatsApp conversation flow.

Primary actor: Customer

Supporting actors: WhatsApp Bot, Orders Store

Trigger: The customer selects `Manage Orders` and chooses `Reschedule` for an active order.

Preconditions:

- The customer already has at least one active order associated with the WhatsApp phone number.
- The selected order has not been cancelled, delivered, or picked up.

Postconditions:

- The selected order is updated with a new `scheduledDate` and `scheduleTime`.
- The customer receives a confirmation message showing the new appointment details.

Main success scenario:

1. The customer opens the order-management flow from the main chatbot menu.
2. The system lists the customer's active orders.
3. The customer selects an order.
4. The system displays the current order details and available actions.
5. The customer chooses `Reschedule`.
6. The system prompts for a new date and then for a new time.
7. The system validates both values.
8. The orders store updates the selected record.
9. The chatbot confirms the new schedule.

Alternative and exception flows:

- If no active orders exist, the system reports that no upcoming appointments are available to manage.
- If the date format is invalid, the system asks the customer to re-enter it using `YYYY-MM-DD`.
- If the time format is invalid, the system asks the customer to re-enter it using an accepted time format.

Implementation trace: `src/bot.js`, `src/botHelpers.js`, `src/orders.js`

Note: In the current codebase, this responsibility is implemented as rescheduling an existing order rather than creating a free-standing appointment record.

#### 3.2.2 Receive Reminders

Purpose: Deliver a reminder to a customer when an order's reminder time becomes due.

Primary actor: Customer

Supporting actors: Reminder Scheduler, Orders Store, Reminder Logger, WhatsApp Client

Trigger: The reminder scheduler detects an order whose `reminderTime` is due and whose `reminderSent` flag is still `false`.

Preconditions:

- The system is connected to WhatsApp.
- The order contains a valid `reminderTime`.
- The reminder has not already been sent.

Postconditions:

- A reminder message is sent to the customer.
- The order is updated with `reminderSent = true` and a `reminderSentAt` timestamp.
- A reminder audit entry is written to `reminders.json`.

Main success scenario:

1. The scheduler wakes on its configured interval.
2. The system retrieves all orders from storage.
3. The scheduler filters orders that are due for a reminder.
4. The WhatsApp client sends the reminder message to the customer.
5. The system marks the reminder as sent.
6. The reminder logger records a successful reminder event.

Alternative and exception flows:

- If WhatsApp is not ready, the scheduler skips sending during that tick.
- If sending fails, the system records a failed reminder log entry instead of marking the reminder as sent.

Implementation trace: `src/reminderScheduler.js`, `src/orders.js`, `src/reminders.js`

#### 3.2.3 View Dashboard

Purpose: Allow an authenticated administrator to review order data, summary statistics, charts, and WhatsApp connection state through the web dashboard.

Primary actor: Administrator

Supporting actors: Login Page, Dashboard Page, API Server, Orders Store

Trigger: The administrator opens the web dashboard and signs in.

Preconditions:

- The HTTP server is running.
- The administrator provides valid credentials.

Postconditions:

- The administrator receives an authenticated session token.
- Dashboard tables, statistics, and connection-state data are loaded from the backend.

Main success scenario:

1. The administrator opens the login page.
2. Credentials are submitted to `/api/login`.
3. The system returns an authentication token.
4. The dashboard page loads.
5. The client fetches `/api/orders` and `/api/status`.
6. The interface renders revenue figures, order summaries, tables, and connection information.

Alternative and exception flows:

- Invalid credentials produce an authentication error and the user remains on the login page.
- Missing or invalid tokens cause protected API routes to return `401 Unauthorized`.
- Failed order loading produces an error dialog in the browser.

Implementation trace: `public/login.html`, `public/dashboard.html`, `public/js/script.js`, `src/server.js`

#### 3.2.4 Update Pricing

Purpose: Maintain the product and pricing catalog used by quotation logic.

Primary actor: System Administrator or Repository Maintainer

Supporting actors: Configuration Loader, Pricing Service

Trigger: The business needs to revise catalog prices or product definitions.

Preconditions:

- The maintainer has local access to the repository or deployment host.
- The application is stopped or is about to be restarted after the file change.

Postconditions:

- `prices.json` reflects the revised product definitions.
- New pricing values are available to the application on the next startup.

Main success scenario:

1. The maintainer edits `prices.json`.
2. The application loads the catalog through `src/config.js`.
3. Quotation requests use the updated catalog through `src/pricing.js`.

Alternative and exception flows:

- Invalid JSON prevents the application from loading the catalog correctly.
- Incorrect grid dimensions or missing product fields can produce quotation failures.

Implementation trace: `prices.json`, `src/config.js`, `src/pricing.js`

> TODO: The current codebase does not implement a secure runtime dashboard feature for editing prices. Pricing maintenance is presently a file-based administrative activity.

#### 3.2.5 Update Job Status

Purpose: Allow an administrator to update the status of an order through the dashboard.

Primary actor: Administrator

Supporting actors: Dashboard Page, API Server, Orders Store, WhatsApp Client

Trigger: The administrator selects a new status from the dashboard status dropdown.

Preconditions:

- The administrator is authenticated.
- The order exists in storage.

Postconditions:

- The order's status is persisted to `orders.json`.
- If the status changed, the system attempts to notify the customer through WhatsApp.

Main success scenario:

1. The administrator opens the order-management table.
2. A new status is chosen for a specific order.
3. The dashboard sends a `PUT` request to `/api/orders/:id`.
4. The server updates the stored order.
5. If the status differs from the previous value, the server sends a status-change message to the customer.
6. The dashboard reflects the new status styling.

Alternative and exception flows:

- If the order does not exist, the API returns `404`.
- If WhatsApp messaging fails, the server logs the error; the order update still remains stored.

Implementation trace: `public/js/script.js`, `src/server.js`, `src/orders.js`

#### 3.2.6 Send Completion Message

Purpose: Allow an administrator to send an explicit completion or readiness message when an order is ready for pickup or delivery.

Primary actor: Administrator

Supporting actors: Dashboard Page, API Server, Orders Store, WhatsApp Client

Trigger: The administrator clicks the `Notify Ready` action in the dashboard.

Preconditions:

- The administrator is authenticated.
- The selected order exists.
- WhatsApp connectivity is available.

Postconditions:

- The customer receives a completion-ready message.

Main success scenario:

1. The administrator clicks the notification button for a selected order.
2. The dashboard sends `POST /api/notify/:id`.
3. The server retrieves the order.
4. The server sends a ready/completion message to the customer's WhatsApp number.
5. The dashboard reports success to the administrator.

Alternative and exception flows:

- If the order is missing, the API returns `404`.
- If message delivery fails, the API returns a server error.

Implementation trace: `public/js/script.js`, `src/server.js`

> TODO: The current codebase does not persist a dedicated audit trail for completion-message delivery beyond runtime logging and user feedback.

#### 3.2.7 Send Proactive Notification

Purpose: Push a customer-facing notification immediately after an administrator changes an order status.

Primary actor: Administrator

Supporting actors: API Server, Orders Store, WhatsApp Client, Customer

Trigger: An order status update is submitted through the dashboard.

Preconditions:

- The order exists.
- The status value changes.
- WhatsApp connectivity is available.

Postconditions:

- The customer receives a proactive status-update message without having to request an update manually.

Main success scenario:

1. The administrator updates an order's status.
2. The API server saves the new status.
3. The server compares the new status with the old status.
4. The server generates a status-update message.
5. The WhatsApp client sends the message to the customer.

Alternative and exception flows:

- If the status is unchanged, no proactive notification is sent.
- If the send attempt fails, the status remains updated but the customer message is not delivered.

Implementation trace: `src/server.js`, `src/orders.js`

### 3.3 Activity Diagram

#### Figure 3.2: Schedule Appointment Activity Diagram
Diagram source: `../docs/diagrams/schedule-appointment-activity.puml`

This activity diagram expands the appointment-related conversation path used in the implemented chatbot. It shows the validation checkpoints that protect the integrity of `scheduledDate` and `scheduleTime` before the order record is updated.

## 4. Architectural Design

### 4.1 Package Diagram

#### Figure 4.1: Package Diagram
Diagram source: `../docs/diagrams/package-diagram.puml`

This package diagram groups the repository into coherent design units. The presentation assets live under `public/`, the HTTP and conversational logic live under `src/`, and the file-backed data sources remain at repository root. The diagram mirrors the repository structure rather than an abstract textbook layering.

### 4.2 Component Diagram

#### Figure 4.2: Component Diagram
Diagram source: `../docs/diagrams/component-diagram.puml`

This component diagram shows the runtime dependencies between the dashboard, API server, bot controller, pricing logic, order storage, reminder scheduler, and supporting services for PDF and email generation. It captures the interaction boundaries that matter operationally in this implementation.

### 4.3 Deployment Diagram

#### Figure 4.3: Deployment Diagram
Diagram source: `../docs/diagrams/deployment-diagram.puml`

This deployment diagram models the practical execution environment of the application. Customer traffic reaches the system through WhatsApp, administrative traffic reaches it through a browser, and the Node.js host coordinates both channels while persisting local JSON files on the same machine.

## 5. Detailed Design

### 5.1 Class Diagram

#### Figure 5.1: Logical Class Diagram
Diagram source: `../docs/diagrams/class-diagram.puml`

This class diagram uses logical service classes to describe the structure of the JavaScript modules. Although the repository is implemented with CommonJS modules and exported functions instead of ES6 classes, the diagram accurately reflects the responsibilities, data handled, and major operations of each module.

### 5.2 Use-Case Realizations

#### 5.2.1 Schedule Appointment

##### Figure 5.2: Schedule Appointment Sequence Diagram
Diagram source: `../docs/diagrams/schedule-appointment-sequence.puml`

This sequence diagram traces how an existing order is selected, validated, and rescheduled through the chatbot conversation flow. It emphasizes the fact that the operation updates an existing stored order rather than creating a separate appointment entity.

##### Figure 5.3: Schedule Appointment Object Diagram
Diagram source: `../docs/diagrams/schedule-appointment-object.puml`

This object diagram presents a runtime snapshot of a customer, a selected order, and the chatbot session state while the reschedule flow is in progress.

##### Figure 5.4: Schedule Appointment State Diagram
Diagram source: `../docs/diagrams/schedule-appointment-state.puml`

This state diagram summarizes the implemented scheduling lifecycle around an order, including unscheduled, scheduled, rescheduled, completed, and cancelled conditions.

#### 5.2.2 Receive Reminders

##### Figure 5.5: Receive Reminders Sequence Diagram
Diagram source: `../docs/diagrams/receive-reminders-sequence.puml`

This sequence diagram shows how the reminder scheduler checks due reminders, sends the WhatsApp message, and records both the order update and reminder log entry.

##### Figure 5.6: Receive Reminders Object Diagram
Diagram source: `../docs/diagrams/receive-reminders-object.puml`

This object diagram captures the state of a due order, the reminder logger, and the scheduler context at the point a reminder becomes eligible for delivery.

##### Figure 5.7: Reminder Lifecycle State Diagram
Diagram source: `../docs/diagrams/receive-reminders-state.puml`

This state diagram shows how reminder-related fields evolve from unscheduled to due, sent, failed, and rescheduled conditions.

#### 5.2.3 View Dashboard

##### Figure 5.8: View Dashboard Sequence Diagram
Diagram source: `../docs/diagrams/view-dashboard-sequence.puml`

This sequence diagram models the login and data-loading behaviour of the dashboard. It reflects the actual token-based API access implemented in the browser-side script and Express server.

##### Figure 5.9: View Dashboard Object Diagram
Diagram source: `../docs/diagrams/view-dashboard-object.puml`

This object diagram presents the authenticated admin session, dashboard page, and current order collection that together form the dashboard view.

#### 5.2.4 Update Pricing

##### Figure 5.10: Update Pricing Sequence Diagram
Diagram source: `../docs/diagrams/update-pricing-sequence.puml`

This sequence diagram documents the price-maintenance process that is currently supported by the codebase: editing the catalog file and restarting the application so the pricing service can reload it.

##### Figure 5.11: Update Pricing Object Diagram
Diagram source: `../docs/diagrams/update-pricing-object.puml`

This object diagram shows a maintainer, the pricing catalog file, and a representative product entry at the moment catalog maintenance is performed.

> TODO: If the team adds a runtime pricing editor later, both this section and its diagrams should be replaced with the implemented dashboard-based flow.

#### 5.2.5 Update Job Status

##### Figure 5.12: Update Job Status Sequence Diagram
Diagram source: `../docs/diagrams/update-job-status-sequence.puml`

This sequence diagram models the administrator's status change, the persisted order update, and the automatic customer notification that follows when the status value has changed.

##### Figure 5.13: Update Job Status Object Diagram
Diagram source: `../docs/diagrams/update-job-status-object.puml`

This object diagram captures the order, current admin session, and selected status value involved in a dashboard-based status update.

##### Figure 5.14: Order Status State Diagram
Diagram source: `../docs/diagrams/update-job-status-state.puml`

This state diagram reflects the status values currently exposed in the dashboard interface and stored in the order records.

#### 5.2.6 Send Completion Message

##### Figure 5.15: Send Completion Message Sequence Diagram
Diagram source: `../docs/diagrams/send-completion-message-sequence.puml`

This sequence diagram follows the explicit ready-notification action triggered from the dashboard's bell icon and sent through the `/api/notify/:id` endpoint.

##### Figure 5.16: Send Completion Message Object Diagram
Diagram source: `../docs/diagrams/send-completion-message-object.puml`

This object diagram shows the order selected for completion notification together with the customer endpoint and the administrator action context.

#### 5.2.7 Send Proactive Notification

##### Figure 5.17: Send Proactive Notification Sequence Diagram
Diagram source: `../docs/diagrams/send-proactive-notification-sequence.puml`

This sequence diagram focuses on the push-notification aspect of a status change. Unlike the previous use case, the emphasis here is on the proactive communication path rather than the status persistence itself.

##### Figure 5.18: Send Proactive Notification Object Diagram
Diagram source: `../docs/diagrams/send-proactive-notification-object.puml`

This object diagram presents the updated order state and generated outbound message that together represent the proactive-notification event.

## 6. Implementation

### 6.1 Technologies Used and Rationale

Node.js was selected as the primary runtime because the application coordinates asynchronous I/O across HTTP requests, WhatsApp events, file access, and scheduled reminder checks. The event-driven model fits that workload well and keeps the implementation consistent across the chatbot and dashboard backend.

Express is used for the administrative web server and API layer. It provides a lightweight routing model for login, order retrieval, status polling, order mutation, CSV report generation, and notification endpoints without introducing unnecessary framework complexity.

`whatsapp-web.js` provides the messaging integration layer. It allows the system to authenticate with a WhatsApp account, receive incoming messages and poll votes, and send outbound notifications, reminders, PDFs, and status updates from the same Node.js process.

Plain HTML, CSS, and JavaScript are used for the dashboard interface. This is appropriate for the scale of the application because the administrative UI is modest in size and does not require a client-side framework. Bootstrap, Font Awesome, and Chart.js are used in the browser to accelerate layout, iconography, and chart rendering.

PDFKit is used to generate estimates and invoices as PDF documents. This matches the operational requirement to produce printable customer-facing estimates and invoices from order data.

Nodemailer is used to send invoices and estimates through email when an address is available. This complements the WhatsApp channel by supporting document delivery outside the chat interface.

`dotenv` is used to load environment variables such as the server port. Although the current implementation uses hard-coded values for some credentials and configuration, environment-variable support is present and should be expanded in future revisions.

The persistence layer is currently file-based. `orders.json`, `reminders.json`, `prices.json`, and `cleaning_supply.json` provide a simple storage model that is easy to inspect and sufficient for a course project. The trade-off is that the design is best suited to low-volume, single-instance deployment.

### 6.2 Code Repository Link

Repository: <https://github.com/RICK-MONK/COMP2171-Project.git>

### 6.3 Implementation Notes Relevant to Assigned Responsibilities

- Schedule Appointment is implemented as a rescheduling flow for existing orders through the WhatsApp bot.
- Receive Reminders is implemented by `src/reminderScheduler.js` and logged to `reminders.json`.
- View Dashboard is implemented through static pages in `public/` backed by token-protected Express routes.
- Update Pricing is currently a manual maintenance task performed through `prices.json`.
- Update Job Status is implemented through the dashboard status selector and `PUT /api/orders/:id`.
- Send Completion Message is implemented through `POST /api/notify/:id`.
- Send Proactive Notification is implemented automatically when a persisted status change occurs.

> TODO: Move any final institutional formatting, cover-page elements, and lecturer-required front matter into the official COMP2171 `.docx` template once it is available in the repository.
