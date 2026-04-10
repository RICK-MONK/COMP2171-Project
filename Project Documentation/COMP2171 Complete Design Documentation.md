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

Note: Every diagram in this document is presented with a title and a short explanation.

### Domain Model
Diagram source: `../docs/diagrams/domain/domain-model.puml`

Short explanation: This domain model identifies the principal business entities and relationships implemented in the project. A `Customer` can create and manage `Order` records. Each `Order` aggregates one or more `OrderItem` entries derived from the pricing catalog, may carry scheduling and reminder information, and may generate an `InvoiceDocument`. Administrators review and update orders through the dashboard, while `ReminderLog` entries record automated reminder attempts.

The domain model is intentionally focused on persistent business concepts instead of low-level framework classes. This keeps the analysis aligned with the problem domain while still matching the JSON files and service modules used by the application.

## 3. Use Case Model

### 3.1 Use Case Diagram

#### Use Case Overview
Diagram source: `../docs/diagrams/use-case/usecase-overview.puml`

Short explanation: This use case diagram shows the externally visible interactions between customers, administrators, and the implemented system. It includes both customer-facing chatbot behaviour and staff-facing administrative actions. The assigned responsibilities are highlighted as first-class use cases rather than left as implied dashboard actions.

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

#### 3.2.8 Request Quotation

Purpose: Allow a customer to request a product quotation and receive an estimate through the WhatsApp chatbot.

Primary actor: Customer

Supporting actors: WhatsApp Bot, Pricing Service, Order Utilities, Invoice Service

Trigger: The customer selects a product flow from `Goods/Services`.

Preconditions:

- The catalog data is available.
- The selected product exists in the configured catalog.

Postconditions:

- The customer receives an estimate summary.
- The system can generate an estimate PDF for the selected items.

Main success scenario:

1. The customer opens the goods and services flow.
2. The system presents product categories and options.
3. The customer selects a product and enters dimensions or quantity.
4. The pricing service calculates the estimate.
5. The chatbot displays the quotation details.
6. The customer chooses to finish and receive a PDF estimate.

Alternative and exception flows:

- Invalid dimensions or quantity trigger corrected-input prompts.
- Unavailable size combinations trigger fallback guidance or support contact.

Implementation trace: `src/bot.js`, `src/pricing.js`, `src/orderUtils.js`, `src/invoice.js`

#### 3.2.9 Check Order Status

Purpose: Allow a customer to retrieve the status of stored orders linked to the current WhatsApp phone number.

Primary actor: Customer

Supporting actors: WhatsApp Bot, Order Helpers, Orders Store

Trigger: The customer selects `Get Order Status`.

Preconditions:

- The customer has at least one order associated with the current phone number.

Postconditions:

- The system displays the status of matching orders.

Main success scenario:

1. The customer selects `Get Order Status`.
2. The system maps the WhatsApp number to stored orders.
3. The orders store returns matching orders.
4. The chatbot formats and returns the status list.

Alternative and exception flows:

- If no matching orders exist, the chatbot reports that no pending orders were found.

Implementation trace: `src/bot.js`, `src/botHelpers.js`, `src/orders.js`

#### 3.2.10 Retrieve Booking

Purpose: Allow a customer to retrieve active bookings before choosing a self-service order-management action.

Primary actor: Customer

Supporting actors: WhatsApp Bot, Order Helpers, Orders Store

Trigger: The customer selects `Manage Orders`.

Preconditions:

- The customer has one or more active orders.

Postconditions:

- The system shows a selectable list of active bookings.

Main success scenario:

1. The customer selects `Manage Orders`.
2. The system loads the customer's orders.
3. Completed and cancelled bookings are filtered out.
4. The chatbot presents the remaining bookings as selectable options.

Alternative and exception flows:

- If no active bookings are available, the chatbot reports that no upcoming appointments were found.

Implementation trace: `src/bot.js`, `src/botHelpers.js`, `src/orders.js`

#### 3.2.11 Cancel Booking

Purpose: Allow a customer to cancel an existing booking through the self-service manage-orders flow.

Primary actor: Customer

Supporting actors: WhatsApp Bot, Orders Store

Trigger: The customer selects an active booking and chooses `Cancel`.

Preconditions:

- The selected booking exists and is still active.

Postconditions:

- The selected booking is removed from active storage.
- The customer receives a cancellation confirmation message.

Main success scenario:

1. The customer opens `Manage Orders`.
2. The system presents active bookings.
3. The customer selects a booking and chooses `Cancel`.
4. The chatbot asks for confirmation.
5. The customer confirms the cancellation.
6. The orders store deletes the booking.
7. The chatbot confirms the result.

Alternative and exception flows:

- If the booking no longer exists, the chatbot reports that cancellation could not be completed.
- If the customer selects `No`, the cancellation request is aborted.

Implementation trace: `src/bot.js`, `src/orders.js`

### 3.3 Activity Diagrams

#### 3.3.1 Schedule Appointment Activity Diagram
Diagram source: `../docs/diagrams/activity/schedule-appointment-activity.puml`

Short explanation: This activity diagram expands the appointment-related conversation path used in the implemented chatbot. It shows the validation checkpoints that protect the integrity of `scheduledDate` and `scheduleTime` before the order record is updated.

#### 3.3.2 Receive Reminders Activity Diagram
Diagram source: `../docs/diagrams/activity/receive-reminders-activity.puml`

Short explanation: This activity diagram shows the reminder lifecycle from scheduler tick to due-order detection, reminder delivery, and reminder logging. It also captures the branch where the WhatsApp client is not ready or message delivery fails.

#### 3.3.3 View Dashboard Activity Diagram
Diagram source: `../docs/diagrams/activity/view-dashboard-activity.puml`

Short explanation: This activity diagram models the admin path from login to authenticated dashboard loading. It includes both successful token-based access and the main error branches for invalid credentials or failed API loading.

#### 3.3.4 Update Pricing Activity Diagram
Diagram source: `../docs/diagrams/activity/update-pricing-activity.puml`

Short explanation: This activity diagram documents the file-based pricing maintenance process used by the current implementation. It reflects editing `prices.json`, validating the catalog data, and reloading the application so new quotations use the revised values.

#### 3.3.5 Update Job Status Activity Diagram
Diagram source: `../docs/diagrams/activity/update-job-status-activity.puml`

Short explanation: This activity diagram shows the admin workflow for changing an order status from the dashboard. It includes persistence of the new status and the follow-on proactive notification attempt when the status has actually changed.

#### 3.3.6 Send Completion Message Activity Diagram
Diagram source: `../docs/diagrams/activity/send-completion-message-activity.puml`

Short explanation: This activity diagram describes the explicit ready-notification flow started from the dashboard. It focuses on the server-side validation of the order and the delivery path for the customer-facing completion message.

#### 3.3.7 Send Proactive Notification Activity Diagram
Diagram source: `../docs/diagrams/activity/send-proactive-notification-activity.puml`

Short explanation: This activity diagram isolates the proactive-notification behaviour that occurs after a status update. It shows the decision point where unchanged statuses do not trigger a message and includes the failure branch for WhatsApp delivery.

#### 3.3.8 Request Quotation Activity Diagram
Diagram source: `../docs/diagrams/activity/request-quotation-activity.puml`

Short explanation: This activity diagram models the quotation path from product selection through price calculation and estimate generation. It reflects the implemented flow where the customer provides dimensions or quantity before the bot generates an estimate PDF.

#### 3.3.9 Check Order Status Activity Diagram
Diagram source: `../docs/diagrams/activity/check-order-status-activity.puml`

Short explanation: This activity diagram shows the customer path for retrieving order statuses linked to the active WhatsApp phone number. It includes the branch where no matching orders exist in storage.

#### 3.3.10 Retrieve Booking Activity Diagram
Diagram source: `../docs/diagrams/activity/retrieve-booking-activity.puml`

Short explanation: This activity diagram shows the order-management entry path where the system loads customer orders, filters active bookings, and presents a selectable list for follow-up actions.

#### 3.3.11 Cancel Booking Activity Diagram
Diagram source: `../docs/diagrams/activity/cancel-booking-activity.puml`

Short explanation: This activity diagram models the booking-cancellation flow, including the confirmation checkpoint before the record is deleted from the orders store.

## 4. Architectural Design

### 4.1 Package Diagram

#### Package Diagram
Diagram source: `../docs/diagrams/architecture/package-diagram.puml`

Short explanation: This package diagram groups the repository into coherent design units. The presentation assets live under `public/`, the HTTP and conversational logic live under `src/`, and the file-backed data sources remain at repository root. The diagram mirrors the repository structure rather than an abstract textbook layering.

### 4.2 Component Diagram

#### Component Diagram
Diagram source: `../docs/diagrams/architecture/component-diagram.puml`

Short explanation: This component diagram shows the runtime dependencies between the dashboard, API server, bot controller, pricing logic, order storage, reminder scheduler, and supporting services for PDF and email generation. It captures the interaction boundaries that matter operationally in this implementation.

### 4.3 Deployment Diagram

#### Deployment Diagram
Diagram source: `../docs/diagrams/architecture/deployment-diagram.puml`

Short explanation: This deployment diagram models the practical execution environment of the application. Customer traffic reaches the system through WhatsApp, administrative traffic reaches it through a browser, and the Node.js host coordinates both channels while persisting local JSON files on the same machine.

## 5. Detailed Design

### 5.1 Class Diagram

#### Logical Class Diagram
Diagram source: `../docs/diagrams/class/class-diagram.puml`

Short explanation: This class diagram uses logical service classes to describe the structure of the JavaScript modules. Although the repository is implemented with CommonJS modules and exported functions instead of ES6 classes, the diagram accurately reflects the responsibilities, data handled, and major operations of each module.

### 5.2 Sequence Diagrams

#### 5.2.1 Schedule Appointment Sequence Diagram

##### Schedule Appointment Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/01-schedule-appointment/schedule-appointment-sequence.puml`

Short explanation: This sequence diagram traces how an existing order is selected, validated, and rescheduled through the chatbot conversation flow. It emphasizes the fact that the operation updates an existing stored order rather than creating a separate appointment entity.

#### 5.2.2 Receive Reminders Sequence Diagram

##### Receive Reminders Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/02-receive-reminders/receive-reminders-sequence.puml`

Short explanation: This sequence diagram shows how the reminder scheduler checks due reminders, sends the WhatsApp message, and records both the order update and reminder log entry.

#### 5.2.3 View Dashboard Sequence Diagram

##### View Dashboard Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/03-view-dashboard/view-dashboard-sequence.puml`

Short explanation: This sequence diagram models the login and data-loading behaviour of the dashboard. It reflects the actual token-based API access implemented in the browser-side script and Express server.

#### 5.2.4 Update Pricing Sequence Diagram

##### Update Pricing Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/04-update-pricing/update-pricing-sequence.puml`

Short explanation: This sequence diagram documents the price-maintenance process that is currently supported by the codebase: editing the catalog file and restarting the application so the pricing service can reload it.

#### 5.2.5 Update Job Status Sequence Diagram

##### Update Job Status Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/05-update-job-status/update-job-status-sequence.puml`

Short explanation: This sequence diagram models the administrator's status change, the persisted order update, and the automatic customer notification that follows when the status value has changed.

> TODO: If the team adds a runtime pricing editor later, both this section and its diagrams should be replaced with the implemented dashboard-based flow.

#### 5.2.6 Send Completion Message Sequence Diagram

##### Send Completion Message Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/06-send-completion-message/send-completion-message-sequence.puml`

Short explanation: This sequence diagram follows the explicit ready-notification action triggered from the dashboard's bell icon and sent through the `/api/notify/:id` endpoint.

#### 5.2.7 Send Proactive Notification Sequence Diagram

##### Send Proactive Notification Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/07-send-proactive-notification/send-proactive-notification-sequence.puml`

Short explanation: This sequence diagram focuses on the push-notification aspect of a status change. Unlike the previous use case, the emphasis here is on the proactive communication path rather than the status persistence itself.

#### 5.2.8 Request Quotation Sequence Diagram

##### Request Quotation Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/08-request-quotation/request-quotation-sequence.puml`

Short explanation: This sequence diagram shows how the chatbot gathers quotation inputs, invokes pricing logic, calculates cart totals, and generates an estimate PDF for the customer.

#### 5.2.9 Check Order Status Sequence Diagram

##### Check Order Status Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/09-check-order-status/check-order-status-sequence.puml`

Short explanation: This sequence diagram shows the status-lookup path where the bot retrieves stored orders by phone number and returns the current statuses to the customer.

#### 5.2.10 Retrieve Booking Sequence Diagram

##### Retrieve Booking Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/10-retrieve-booking/retrieve-booking-sequence.puml`

Short explanation: This sequence diagram shows how the manage-orders flow retrieves active bookings and presents them as selectable options for self-service actions.

#### 5.2.11 Cancel Booking Sequence Diagram

##### Cancel Booking Sequence Diagram
Diagram source: `../docs/diagrams/use-cases/11-cancel-booking/cancel-booking-sequence.puml`

Short explanation: This sequence diagram shows the cancellation-confirmation flow in which the customer confirms removal of a booking and the orders store deletes it.

### 5.3 Object Diagrams

#### 5.3.1 Schedule Appointment Object Diagram

##### Schedule Appointment Object Diagram
Diagram source: `../docs/diagrams/use-cases/01-schedule-appointment/schedule-appointment-object.puml`

Short explanation: This object diagram presents a runtime snapshot of a customer, a selected order, and the chatbot session state while the reschedule flow is in progress.

#### 5.3.2 Receive Reminders Object Diagram

##### Receive Reminders Object Diagram
Diagram source: `../docs/diagrams/use-cases/02-receive-reminders/receive-reminders-object.puml`

Short explanation: This object diagram captures the state of a due order, the reminder logger, and the scheduler context at the point a reminder becomes eligible for delivery.

#### 5.3.3 View Dashboard Object Diagram

##### View Dashboard Object Diagram
Diagram source: `../docs/diagrams/use-cases/03-view-dashboard/view-dashboard-object.puml`

Short explanation: This object diagram presents the authenticated admin session, dashboard page, and current order collection that together form the dashboard view.

#### 5.3.4 Update Pricing Object Diagram

##### Update Pricing Object Diagram
Diagram source: `../docs/diagrams/use-cases/04-update-pricing/update-pricing-object.puml`

Short explanation: This object diagram shows a maintainer, the pricing catalog file, and a representative product entry at the moment catalog maintenance is performed.

#### 5.3.5 Update Job Status Object Diagram

##### Update Job Status Object Diagram
Diagram source: `../docs/diagrams/use-cases/05-update-job-status/update-job-status-object.puml`

Short explanation: This object diagram captures the order, current admin session, and selected status value involved in a dashboard-based status update.

#### 5.3.6 Send Completion Message Object Diagram

##### Send Completion Message Object Diagram
Diagram source: `../docs/diagrams/use-cases/06-send-completion-message/send-completion-message-object.puml`

Short explanation: This object diagram shows the order selected for completion notification together with the customer endpoint and the administrator action context.

#### 5.3.7 Send Proactive Notification Object Diagram

##### Send Proactive Notification Object Diagram
Diagram source: `../docs/diagrams/use-cases/07-send-proactive-notification/send-proactive-notification-object.puml`

Short explanation: This object diagram presents the updated order state and generated outbound message that together represent the proactive-notification event.

#### 5.3.8 Request Quotation Object Diagram

##### Request Quotation Object Diagram
Diagram source: `../docs/diagrams/use-cases/08-request-quotation/request-quotation-object.puml`

Short explanation: This object diagram captures the customer, the quote cart, and the generated estimate document at the point where a quotation has been produced.

#### 5.3.9 Check Order Status Object Diagram

##### Check Order Status Object Diagram
Diagram source: `../docs/diagrams/use-cases/09-check-order-status/check-order-status-object.puml`

Short explanation: This object diagram shows a customer linked to an order-status response that summarizes the status of matching stored orders.

#### 5.3.10 Retrieve Booking Object Diagram

##### Retrieve Booking Object Diagram
Diagram source: `../docs/diagrams/use-cases/10-retrieve-booking/retrieve-booking-object.puml`

Short explanation: This object diagram shows the customer, a representative booking, and the menu object used to present active bookings during the manage-orders flow.

#### 5.3.11 Cancel Booking Object Diagram

##### Cancel Booking Object Diagram
Diagram source: `../docs/diagrams/use-cases/11-cancel-booking/cancel-booking-object.puml`

Short explanation: This object diagram shows the customer, the selected booking, and the confirmation request used to complete the cancellation workflow.

### 5.4 State Diagrams

#### 5.4.1 Schedule Appointment State Diagram

##### Schedule Appointment State Diagram
Diagram source: `../docs/diagrams/use-cases/01-schedule-appointment/schedule-appointment-state.puml`

Short explanation: This state diagram summarizes the implemented scheduling lifecycle around an order, including unscheduled, scheduled, rescheduled, completed, and cancelled conditions.

#### 5.4.2 Reminder Lifecycle State Diagram

##### Reminder Lifecycle State Diagram
Diagram source: `../docs/diagrams/use-cases/02-receive-reminders/receive-reminders-state.puml`

Short explanation: This state diagram shows how reminder-related fields evolve from unscheduled to due, sent, failed, and rescheduled conditions.

#### 5.4.3 Order Status State Diagram

##### Order Status State Diagram
Diagram source: `../docs/diagrams/use-cases/05-update-job-status/update-job-status-state.puml`

Short explanation: This state diagram reflects the status values currently exposed in the dashboard interface and stored in the order records.

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
