const { Client, LocalAuth, Poll, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const { generateInvoicePDF } = require('./invoice');
const { sendInvoiceEmail } = require('./email');
const path = require('path');
const fs = require('fs');
const { calculatePrice } = require('./pricing');
const { normalizeDate, isValidTime, buildCatalog, makeOrderHelpers } = require('./botHelpers');
const { toPhone, calculateCartTotals, buildOrderFromCart, createSupplyQuote } = require('./orderUtils');
const cleaningSupply = require('../cleaning_supply.json');

function createBot({ config, ordersStore }) {
    let readyTimeout = null;
    const client = new Client({
        authStrategy: new LocalAuth(),
        authTimeoutMs: 60000,
        qrMaxRetries: 5,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0,
        webVersionCache: {
            type: 'none'
        },
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });
    const userState = {};
    const userData = {};
    const processedEvents = new Map();
    let qrCodeDataUrl = null;
    let isClientReady = false;
    let connectionState = 'starting';
    let lastConnectionError = null;

    const catalog = buildCatalog(config);
    const { productOptions, blindCategoryLabels, getCategoryProducts } = catalog;
    const { sendOrderStatusList, buildManageOrderPoll } = makeOrderHelpers({ ordersStore, client });
    const supplyCategories = (cleaningSupply.categories || []).map(c => ({
        key: c.key,
        label: c.label,
        items: c.items || []
    }));
    const supplyItems = supplyCategories.flatMap(c => c.items.map(i => ({ ...i, categoryKey: c.key, categoryLabel: c.label })));
    const cleaningServiceOptions = ['Carpet Cleaning', 'Chair Cleaning', 'Rug Cleaning'];

    const withEmoji = (emoji, label) => `${emoji} ${label}`;
    const withEmojiList = (labels, emoji) => labels.map(label => withEmoji(emoji, label));
    const mainMenuOptions = [
        withEmoji('🛍️', 'Goods/Services'),
        withEmoji('📋', 'Manage Orders'),
        withEmoji('🔎', 'Get Order Status'),
        withEmoji('💬', 'Contact Support'),
        withEmoji('❓', 'FAQ')
    ];
    const goodsCategoryOptions = [
        withEmoji('🪟', 'Blinds'),
        withEmoji('🧼', 'Cleaning Services'),
        withEmoji('🧴', 'Cleaning Supplies')
    ];
    const manualSizeHelpOptions = [
        withEmoji('💬', 'Talk to support'),
        withEmoji('📏', 'Enter another size'),
        withEmoji('🔄', 'Start over')
    ];
    const addItemOptions = [
        withEmoji('🪟', 'Add another blind'),
        withEmoji('🧴', 'Add another supply'),
        withEmoji('📄', 'Finish & get PDF')
    ];
    const fulfillmentOptions = [
        withEmoji('🚚', 'Delivery (3-4 Days)'),
        withEmoji('📦', 'Pickup')
    ];
    const confirmPurchaseOptions = [
        withEmoji('✅', 'Confirm Purchase'),
        withEmoji('❌', 'Cancel'),
        withEmoji('⏭️', 'No')
    ];
    const confirmOrderOptions = [
        withEmoji('📧', 'Send email'),
        withEmoji('✅', 'Confirm Purchase'),
        withEmoji('❌', 'Cancel')
    ];
    const finalConfirmOrderOptions = [
        withEmoji('📧', 'Send email'),
        withEmoji('✅', 'Confirm Order'),
        withEmoji('❌', 'Cancel')
    ];
    const faqMenuOptions = [
        withEmoji('🕒', 'Hours & Location'),
        withEmoji('🚚', 'Delivery & Pickup'),
        withEmoji('💵', 'Quotes & Pricing'),
        withEmoji('🧾', 'Orders & Changes'),
        withEmoji('💳', 'Payments'),
        withEmoji('🔄', 'Returns & Warranty'),
        withEmoji('☎️', 'Contact'),
        withEmoji('✅', 'Done')
    ];
    const sendMainMenu = async (userId) => {
        const poll = new Poll('How can we help you today?', mainMenuOptions);
        await client.sendMessage(userId, poll);
    };
    const sendFulfillmentPoll = async (userId, prompt = 'Choose delivery method to place order:') => {
        const poll = new Poll(prompt, fulfillmentOptions);
        await client.sendMessage(userId, poll);
    };
    const markEventProcessed = (key, ttlMs = 30_000) => {
        const now = Date.now();
        for (const [existingKey, expiresAt] of processedEvents.entries()) {
            if (expiresAt <= now) processedEvents.delete(existingKey);
        }
        if (processedEvents.has(key)) return true;
        processedEvents.set(key, now + ttlMs);
        return false;
    };

    function createOrderId() {
        const existingIds = new Set((ordersStore.getAllOrders() || []).map(o => String(o.id)));
        for (let i = 0; i < 5; i++) {
            const id = (Date.now() % 1_000_0000).toString().padStart(7, '0'); // up to 7 digits
            if (!existingIds.has(id)) return id;
        }
        return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    }
    const ensureUserData = (userId) => {
        if (!userData[userId]) userData[userId] = {};
        return userData[userId];
    };
    const findSupplyCategoryByLabel = (label) => supplyCategories.find(c => c.label.toLowerCase() === label.toLowerCase());
    const findSupplyItem = (name, categoryKey) => {
        const items = categoryKey ? supplyItems.filter(i => i.categoryKey === categoryKey) : supplyItems;
        return items.find(i => i.name.toLowerCase() === name.toLowerCase());
    };
    const getProductLimits = (productKey) => {
        const p = config.products[productKey];
        if (!p || p.type !== 'grid') return null;
        const minWidth = p.widths[0];
        const maxWidth = p.widths[p.widths.length - 1];
        const minHeight = p.heights[0];
        const maxHeight = p.heights[p.heights.length - 1];
        return { minWidth, maxWidth, minHeight, maxHeight };
    };

    function resetUser(userId) {
        userState[userId] = null;
        userData[userId] = {};
    }

    function formatEstimateReceipt({ name, width, height, base, install, subtotal, gct, total }) {
        const lines = [
            '-----------------------------',
            '      OFFICIAL ESTIMATE',
            '-----------------------------',
            `Item   : ${name}`,
            `Size   : ${width}" x ${height}"`,
            `Base   : $${base.toLocaleString()}`,
            `Install: $${install.toLocaleString()}`,
            `Subtot.: $${subtotal.toLocaleString()}`,
            `GCT 15%: $${gct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            '-----------------------------',
            `TOTAL  : $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            '-----------------------------'
        ];
        return lines.join('\n');
    }

    async function placeOrder({ userId, user, displayName }) {
        const cart = user.cart || [];
        const fulfillment = user.lastQuote?.fulfillment || user.fulfillment;
        if (!cart.length) {
            await client.sendMessage(userId, 'No order to confirm. Please start over.');
            resetUser(userId);
            return;
        }
        if (!fulfillment) {
            userState[userId] = 'choose_fulfillment';
            await sendFulfillmentPoll(userId, 'Choose delivery method to place order:');
            return;
        }
        const existingIds = ordersStore.getAllOrders().map(o => o.id);
        const order = buildOrderFromCart({
            cart,
            email: user.lastQuote?.email,
            displayName,
            phone: toPhone(userId),
            fulfillment,
            existingIds
        });
        ordersStore.saveOrder(order);
        await client.sendMessage(userId, `Order #${order.id} placed!`);
        resetUser(userId);
    }

    client.on('qr', (qr) => {
        if (readyTimeout) clearTimeout(readyTimeout);
        qrcodeTerminal.generate(qr, { small: true });
        connectionState = 'qr';
        lastConnectionError = null;
        QRCode.toDataURL(qr, (err, url) => {
            if (!err) { qrCodeDataUrl = url; isClientReady = false; }
        });
    });

    client.on('authenticated', () => {
        connectionState = 'authenticated';
        lastConnectionError = null;
        qrCodeDataUrl = null;
        console.log('WhatsApp authenticated');
        if (readyTimeout) clearTimeout(readyTimeout);
        readyTimeout = setTimeout(() => {
            if (!isClientReady) {
                console.error('WhatsApp did not reach ready state within 45 seconds after authentication. This usually indicates a browser/runtime compatibility or stale session issue.');
            }
        }, 45_000);
    });

    client.on('ready', () => {
        if (readyTimeout) clearTimeout(readyTimeout);
        console.log('>>> SYSTEM ONLINE <<<');
        isClientReady = true;
        connectionState = 'ready';
        lastConnectionError = null;
        qrCodeDataUrl = null;
    });

    client.on('loading_screen', (percent, message) => {
        connectionState = 'loading';
        lastConnectionError = null;
        qrCodeDataUrl = null;
        console.log(`WhatsApp loading: ${percent}% ${message || ''}`.trim());
    });

    client.on('auth_failure', (message) => {
        if (readyTimeout) clearTimeout(readyTimeout);
        isClientReady = false;
        connectionState = 'auth_failure';
        lastConnectionError = message || 'Authentication failed';
        console.error('WhatsApp auth failure', message);
    });

    client.on('disconnected', (reason) => {
        if (readyTimeout) clearTimeout(readyTimeout);
        isClientReady = false;
        connectionState = 'disconnected';
        lastConnectionError = reason || 'Client disconnected';
        qrCodeDataUrl = null;
        console.error('WhatsApp disconnected', reason);
    });

    client.on('change_state', (state) => {
        connectionState = String(state || '').toLowerCase() || connectionState;
        if (connectionState !== 'qr') qrCodeDataUrl = null;
        console.log('WhatsApp state changed:', state);
    });

    client.on('error', (err) => {
        if (readyTimeout) clearTimeout(readyTimeout);
        isClientReady = false;
        connectionState = 'error';
        lastConnectionError = err?.message || String(err);
        console.error('WhatsApp client error', err);
    });

    client.on('message', async msg => {
        if (msg.from.includes('status')) return;
        const messageKey = msg.id?._serialized || `${msg.from}:${msg.timestamp}:${msg.body}`;
        if (markEventProcessed(`message:${messageKey}`)) return;

        const userId = msg.from;
        const text = msg.body.toLowerCase();
        const user = ensureUserData(userId);
        user.displayName = msg._data.notifyName || "Customer";

        const greetings = [
            'hi', 'hello', 'hey', 'heyy', 'good morning', 'good afternoon', 'good evening',
            "what's up", 'whats up', 'sup', 'yo', 'menu', 'hi there', 'hello there', 'hola', 'good night', 'greetings'
        ];
        if (text === 'cancel' || text === 'stop') {
            resetUser(userId);
            await client.sendMessage(userId, 'Cancelled. Type "Hi" to start over.');
            return;
        }
        if (greetings.some(g => text.startsWith(g))) {
            resetUser(userId);
            await client.sendMessage(userId, 'Welcome to White Rose Interiors!');
            await sendMainMenu(userId);
            return;
        }

        if (userState[userId] === 'awaiting_cleaning_service_message') {
            await client.sendMessage(userId, 'Thanks! We have noted your cleaning service request. A rep will follow up.');
            resetUser(userId);
            return;
        }

        if (userState[userId] === 'awaiting_cleaning_supply_message') {
            const cat = user.supplyCategory || 'Supplies';
            await client.sendMessage(userId, `Noted for ${cat}. A rep will confirm availability and pricing.`);
            resetUser(userId);
            return;
        }

        if (userState[userId] === 'waiting_for_width') {
            const width = parseFloat(text);
            if (!Number.isFinite(width) || width <= 0) {
                await client.sendMessage(userId, 'Please enter a positive number for width.');
                return;
            }
            const limits = getProductLimits(user.selectedProduct || 'illusion_cat3');
            if (limits && (width < limits.minWidth || width > limits.maxWidth)) {
                await client.sendMessage(userId, `Width must be between ${limits.minWidth}" and ${limits.maxWidth}". Please re-enter.`);
                return;
            }
            user.width = width;
            userState[userId] = 'waiting_for_height';
            const heightPrompt = limits
                ? `Enter Height (inches) between ${limits.minHeight}" and ${limits.maxHeight}":`
                : 'Enter Height (inches):';
            await client.sendMessage(userId, heightPrompt);
            return;
        }

        if (userState[userId] === 'waiting_for_height') {
            const height = parseFloat(text);
            if (!Number.isFinite(height) || height <= 0) {
                await client.sendMessage(userId, 'Please enter a positive number for height.');
                return;
            }

            const width = user.width;
            const productKey = user.selectedProduct || 'illusion_cat3';
            const result = calculatePrice(productKey, width, height);
            if (!result || result.error || result.price === undefined || result.price === null) {
                await client.sendMessage(userId, result?.error || 'That size needs a manual quote.');
                userState[userId] = 'manual_size_help';
                const poll = new Poll('What would you like to do?', manualSizeHelpOptions);
                await client.sendMessage(userId, poll);
                return;
            }

            const subtotal = result.price + config.installation_fee;
            const gct = +(subtotal * 0.15).toFixed(2);
            const finalPrice = subtotal + gct;

            if (!user.cart) user.cart = [];
            const quote = {
                width,
                height,
                price: finalPrice.toFixed(2),
                product: result.name,
                email: user.lastQuote?.email || null,
                fulfillment: user.lastQuote?.fulfillment || null,
                priceBreakdown: {
                    base: result.price,
                    install: config.installation_fee,
                    subtotal,
                    gct
                }
            };
            user.lastQuote = quote;
            user.cart.push(quote);

            const receipt = formatEstimateReceipt({
                name: result.name,
                width,
                height,
                base: result.price,
                install: config.installation_fee,
                subtotal,
                gct,
                total: finalPrice
            });
            await client.sendMessage(userId, 'Estimate generated.');
            await client.sendMessage(userId, '```' + receipt + '```');

            userState[userId] = 'quote_next_step';
            const poll = new Poll('Add another item or finish?', addItemOptions);
            await client.sendMessage(userId, poll);
            return;
        }

        if (userState[userId] === 'supply_quantity') {
            const qty = Number(text);
            const item = user.supplyItem;
            if (!item) {
                await client.sendMessage(userId, 'Please pick an item first.');
                resetUser(userId);
                return;
            }
            if (!Number.isFinite(qty) || qty <= 0) {
                await client.sendMessage(userId, 'Enter a valid quantity (number > 0).');
                return;
            }
            const quote = createSupplyQuote({
                item: { ...item, categoryLabel: user.supplyCategory },
                purchaseType: user.supplyPurchaseType || 'unit',
                quantity: qty,
                existingEmail: user.lastQuote?.email,
                existingFulfillment: user.lastQuote?.fulfillment
            });
            if (!quote) {
                await client.sendMessage(userId, 'Could not create an estimate for that item.');
                resetUser(userId);
                return;
            }
            if (!user.cart) user.cart = [];
            user.cart.push(quote);
            user.lastQuote = quote;
            const totals = calculateCartTotals(user.cart);
            await client.sendMessage(userId, `Added to cart: ${quote.product}. Current total (incl. GCT): $${totals.total.toFixed(2)}`);
            userState[userId] = 'quote_next_step';
            const poll = new Poll('Add another item or finish?', addItemOptions);
            await client.sendMessage(userId, poll);
            return;
        }

        if (userState[userId] === 'manage_resched_date') {
            const date = text.trim();
            user.reschedDate = date;
            userState[userId] = 'manage_resched_time';
            await client.sendMessage(userId, 'Enter new time (e.g., 2:30 PM):');
            return;
        }

        if (userState[userId] === 'manage_resched_time') {
            const time = text.trim();
            const id = user.manageOrderId;
            const date = user.reschedDate;
            if (!id || !date) {
                await client.sendMessage(userId, 'No order selected. Please start again with Manage Orders.');
                resetUser(userId);
                return;
            }
            const normalizedDate = normalizeDate(date);
            if (!normalizedDate) {
                await client.sendMessage(userId, 'Invalid date. Please enter as YYYY-MM-DD:');
                userState[userId] = 'manage_resched_date';
                return;
            }
            if (!isValidTime(time)) {
                await client.sendMessage(userId, 'Invalid time. Please use HH:MM or HH:MM AM/PM:');
                return;
            }
            ordersStore.updateOrder(id, { scheduledDate: normalizedDate, scheduleTime: time.trim() });
            await client.sendMessage(userId, `Order #${id} rescheduled to ${normalizedDate} at ${time}.`);
            resetUser(userId);
            return;
        }

        if (userState[userId] === 'typing_email') {
            if (text.includes('@')) {
                user.lastQuote = user.lastQuote || {};
                user.lastQuote.email = msg.body.trim();
                await client.sendMessage(userId, 'Email saved.');

                try {
                    const cart = user.cart || [];
                    const order = buildOrderFromCart({
                        cart,
                        email: user.lastQuote.email,
                        displayName: user.displayName,
                        phone: toPhone(userId),
                        fulfillment: user.lastQuote.fulfillment,
                        includeStatus: false
                    });
                    if (order && cart.length > 0) {
                        const invoicesDir = path.join(__dirname, '..', 'public', 'invoices');
                        if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
                        const fileName = `Estimate_${order.id}.pdf`;
                        const pdfPath = path.join(invoicesDir, fileName);
                        await generateInvoicePDF(order, fileName, "ESTIMATE");
                        const mailed = await sendInvoiceEmail(order.email, order, pdfPath);
                        if (mailed) {
                            await client.sendMessage(userId, 'Estimate emailed to you.');
                            userState[userId] = 'final_confirm';
                            const confirmPoll = new Poll('Confirm order now?', confirmPurchaseOptions);
                            await client.sendMessage(userId, confirmPoll);
                        } else {
                            await client.sendMessage(userId, 'Could not send email right now.');
                        }
                    }
                } catch (err) {
                    console.error('Immediate email send error', err);
                    await client.sendMessage(userId, 'Could not send email right now.');
                }
                if (userState[userId] !== 'final_confirm') {
                    userState[userId] = 'waiting_for_fulfillment';
                    await sendFulfillmentPoll(userId, 'How would you like to receive this?');
                }
            } else {
                await client.sendMessage(userId, 'Please enter a valid email address.');
            }
            return;
        }
    });

    client.on('vote_update', async (vote) => {
        if (vote.selectedOptions.length === 0) return;
        const voteKey = vote.parentMsgKey?._serialized
            ? `${vote.voter}:${vote.parentMsgKey._serialized}:${vote.selectedOptions.map(o => o.name).join('|')}`
            : `${vote.voter}:${vote.selectedOptions.map(o => o.name).join('|')}`;
        if (markEventProcessed(`vote:${voteKey}`)) return;
        const userId = vote.voter;
        const optionRaw = vote.selectedOptions[0].name;
        const option = optionRaw.replace(/^[^a-zA-Z0-9]+/, '').trim();
        const optLower = option.toLowerCase();
        const user = ensureUserData(userId);
        const displayName = user.displayName || "Customer";

        if (option === 'Goods/Services') {
            const subPoll = new Poll('Select a Category:', goodsCategoryOptions);
            await client.sendMessage(userId, subPoll);
        }
        else if (option === 'Contact Support') {
            const contactMsg = [
                'Support options:',
                '- Reply here for chat (we respond ASAP during business hours).',
                `- Call us: ${config.company_phone}`,
                '- Email: support@whiteroseinteriors.com (include your order # if you have one).'
            ].join('\n');
            await client.sendMessage(userId, contactMsg);
            const contextLines = [];
            if (user.cart && user.cart.length) contextLines.push(`Recent item: ${user.cart[user.cart.length - 1].product}`);
            if (user.lastQuote?.fulfillment) contextLines.push(`Fulfillment pref: ${user.lastQuote.fulfillment}`);
            if (contextLines.length) {
                await client.sendMessage(userId, 'We\'ll share this context with a rep:\n' + contextLines.join('\n'));
            }
        }
        else if (option === 'Get Order Status') {
            await sendOrderStatusList(userId);
        }
        else if (option === 'Manage Orders') {
            const pollData = buildManageOrderPoll(userId);
            if (!pollData) {
                await client.sendMessage(userId, 'No upcoming appointments found to manage.');
            } else {
                userState[userId] = 'manage_select_order';
                user.manageOrders = pollData.orders;
                const poll = new Poll('Select an order to manage:', pollData.options.map(opt => withEmoji('📋', opt)));
                await client.sendMessage(userId, poll);
            }
        }
        else if (option === 'FAQ') {
            userState[userId] = 'faq_menu';
            const faqPoll = new Poll('FAQ Topics:', faqMenuOptions);
            await client.sendMessage(userId, faqPoll);
        }

        else if (userState[userId] === 'faq_menu') {
            const faqs = {
                hours: 'Hours: Mon-Fri 8:30 AM - 4:30 PM\nLocation: 30-32 Red Hills Road',
                delivery: 'Delivery/Pickup: Typically 3-4 business days after confirmation. We will confirm scheduling with you.',
                quotes: 'Quotes: Blinds include install + 15% GCT. Supplies are priced per unit/case with GCT added.',
                orders: 'Orders: You can reschedule/cancel via Manage Orders or by replying here. PDFs are sent on request.',
                payments: 'Payments: Bank transfer details are on your invoice. Ask your rep if you prefer cash/card.',
                returns: 'Returns/Warranty: Contact support for defects or installation issues; we will assess and resolve.',
                contact: `Support: Call us at ${config.company_phone} or reply here for help.`
            };

            if (optLower.includes('done')) {
                resetUser(userId);
                await client.sendMessage(userId, 'FAQ closed. Type "Hi" to start over.');
                return;
            }

            if (optLower.includes('hours')) await client.sendMessage(userId, faqs.hours);
            else if (optLower.includes('delivery') || optLower.includes('pickup')) await client.sendMessage(userId, faqs.delivery);
            else if (optLower.includes('quote') || optLower.includes('pricing')) await client.sendMessage(userId, faqs.quotes);
            else if (optLower.includes('order') || optLower.includes('change')) await client.sendMessage(userId, faqs.orders);
            else if (optLower.includes('payment')) await client.sendMessage(userId, faqs.payments);
            else if (optLower.includes('return') || optLower.includes('warranty')) await client.sendMessage(userId, faqs.returns);
            else if (optLower.includes('contact')) await client.sendMessage(userId, faqs.contact);
            else await client.sendMessage(userId, 'Please choose a listed FAQ topic.');

            const faqPoll = new Poll('FAQ Topics:', faqMenuOptions);
            await client.sendMessage(userId, faqPoll);
            return;
        }

        else if (userState[userId] === 'manual_size_help') {
            if (optLower.includes('support')) {
                const contactMsg = [
                    'Support options:',
                    '- Reply here for chat (we respond ASAP during business hours).',
                    `- Call us: ${config.company_phone}`,
                    '- Email: support@whiteroseinteriors.com (include your order # if you have one).'
                ].join('\n');
                await client.sendMessage(userId, contactMsg);
                resetUser(userId);
            } else if (optLower.includes('enter another')) {
                userState[userId] = 'waiting_for_width';
                await client.sendMessage(userId, 'Enter Width (inches):');
            } else {
                resetUser(userId);
                await client.sendMessage(userId, 'Restarting. How can we help you today?');
                await sendMainMenu(userId);
            }
            return;
        }

        else if (option === 'Blinds') {
            const catPoll = new Poll('Choose a blinds family:', withEmojiList(blindCategoryLabels, '🪟'));
            await client.sendMessage(userId, catPoll);
        }
        else if (option === 'Cleaning Services') {
            userState[userId] = 'select_cleaning_service';
            const poll = new Poll('Select a cleaning service:', withEmojiList(cleaningServiceOptions, '🧼'));
            await client.sendMessage(userId, poll);
        }
        else if (option === 'Cleaning Supplies') {
            if (!supplyCategories.length) {
                userState[userId] = 'awaiting_cleaning_supply_message';
                await client.sendMessage(userId, 'Please leave a message describing what you need.');
            } else {
                userState[userId] = 'select_supply_category';
                const poll = new Poll('Select a supply category:', withEmojiList(supplyCategories.map(c => c.label), '📦'));
                await client.sendMessage(userId, poll);
            }
        }

        else if (blindCategoryLabels.map(l => l.toLowerCase()).includes(optLower)) {
            const prods = getCategoryProducts(option);
            const prodLabels = prods.map(p => p.label);
            const poll = new Poll('Select a product:', withEmojiList(prodLabels, '🪟'));
            await client.sendMessage(userId, poll);
        }
        else if (productOptions.find(p => p.label.toLowerCase() === optLower)) {
            const chosen = productOptions.find(p => p.label.toLowerCase() === optLower);
            const data = ensureUserData(userId);
            data.selectedProduct = chosen.key;
            data.displayName = displayName;
            userState[userId] = 'waiting_for_width';
            const limits = getProductLimits(chosen.key);
            const prompt = limits
                ? `Enter Width (inches) between ${limits.minWidth}" and ${limits.maxWidth}":`
                : 'Enter Width (inches):';
            await client.sendMessage(userId, prompt);
        }
        else if (Object.entries(config.products).find(([k, v]) => v.name.toLowerCase() === optLower)) {
            const found = Object.entries(config.products).find(([k, v]) => v.name.toLowerCase() === optLower);
            const data = ensureUserData(userId);
            data.selectedProduct = found[0];
            data.displayName = displayName;
            userState[userId] = 'waiting_for_width';
            const limits = getProductLimits(found[0]);
            const prompt = limits
                ? `Enter Width (inches) between ${limits.minWidth}" and ${limits.maxWidth}":`
                : 'Enter Width (inches):';
            await client.sendMessage(userId, prompt);
        }

        else if (userState[userId] === 'select_supply_category') {
            const category = findSupplyCategoryByLabel(option);
            if (!category) {
                await client.sendMessage(userId, 'Please pick a listed category.');
                return;
            }
            if (!category.items.length) {
                await client.sendMessage(userId, 'No items in that category. Please choose another.');
                return;
            }
            user.supplyCategory = category.label;
            user.supplyCategoryKey = category.key;
            user.supplyItems = category.items;
            userState[userId] = 'select_supply_item';
            const itemOptions = category.items.map(i => i.name);
            await client.sendMessage(userId, 'Pick a supply item:');
            const poll = new Poll(`Items in ${category.label}:`, withEmojiList(itemOptions, '🧴'));
            await client.sendMessage(userId, poll);
        }
        else if (userState[userId] === 'select_supply_item') {
            const list = user.supplyItems || [];
            const selected = list.find(i => i.name.toLowerCase() === option.toLowerCase());
            if (!selected) {
                await client.sendMessage(userId, 'Please select an item from the list.');
                return;
            }
            user.supplyItem = selected;
            if (selected.casePrice && selected.casePrice > 0) {
                userState[userId] = 'supply_pack_choice';
                const poll = new Poll('How would you like to purchase?', [
                    withEmoji('🧍', `Per Unit ($${selected.unitPrice})`),
                    withEmoji('📦', `Case ($${selected.casePrice})`)
                ]);
                await client.sendMessage(userId, poll);
            } else {
                user.supplyPurchaseType = 'unit';
                userState[userId] = 'supply_quantity';
                await client.sendMessage(userId, `Enter quantity for ${selected.name} (unit price $${selected.unitPrice}):`);
            }
        }
        else if (userState[userId] === 'select_cleaning_service') {
            if (!cleaningServiceOptions.map(s => s.toLowerCase()).includes(optLower)) {
                await client.sendMessage(userId, 'Please pick one of the listed cleaning services.');
                return;
            }
            await client.sendMessage(userId, 'Carpet, Chair, and Rug cleaning pricing is currently unavailable. A rep will follow up.');
            resetUser(userId);
        }
        else if (userState[userId] === 'supply_pack_choice') {
            const item = user.supplyItem;
            if (!item) {
                await client.sendMessage(userId, 'Please pick an item first.');
                resetUser(userId);
                return;
            }
            const lower = option.toLowerCase();
            if (lower.includes('case')) {
                if (!item.casePrice && item.casePrice !== 0) {
                    await client.sendMessage(userId, 'Case pricing not available. Please choose Per Unit.');
                    return;
                }
                user.supplyPurchaseType = 'case';
            } else {
                user.supplyPurchaseType = 'unit';
            }
            userState[userId] = 'supply_quantity';
            const price = user.supplyPurchaseType === 'case' ? item.casePrice : item.unitPrice;
            await client.sendMessage(userId, `Enter quantity for ${item.name} (${user.supplyPurchaseType === 'case' ? 'cases' : 'units'}, price $${price}):`);
        }

        else if (option === 'Yes, email me') {
            userState[userId] = 'typing_email';
            await client.sendMessage(userId, 'Please type your email address:');
        }
        else if (option === 'No, thanks') {
            userState[userId] = 'final_confirm';
            const confirmPoll = new Poll('Send email or confirm purchase?', confirmOrderOptions);
            await client.sendMessage(userId, confirmPoll);
        }

        else if (option === 'Add another blind') {
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (option === 'Add another supply') {
            if (!supplyCategories.length) {
                await client.sendMessage(userId, 'Supply catalog not available. Type your request and a rep will assist.');
                userState[userId] = 'awaiting_cleaning_supply_message';
            } else {
                userState[userId] = 'select_supply_category';
                const poll = new Poll('Select a supply category:', withEmojiList(supplyCategories.map(c => c.label), '📦'));
                await client.sendMessage(userId, poll);
            }
        }
        else if (option === 'Finish & get PDF') {
            const cart = user.cart || [];
            if (cart.length === 0) {
                await client.sendMessage(userId, 'No items found. Start by selecting a product.');
                userState[userId] = null;
                return;
            }

            const order = buildOrderFromCart({
                cart,
                email: user.lastQuote?.email,
                displayName,
                phone: toPhone(userId),
                fulfillment: user.lastQuote?.fulfillment,
                includeStatus: false
            });

            const totals = calculateCartTotals(cart);
            await client.sendMessage(userId, `Estimate complete. Total: $${totals.total.toFixed(2)}`);

            try {
                const fileName = `Estimate_${order.id}.pdf`;
                const pdfPath = await generateInvoicePDF(order, fileName, "ESTIMATE");
                const media = MessageMedia.fromFilePath(pdfPath);
                await client.sendMessage(userId, media);
            } catch (err) {
                console.error('PDF send error', err);
                await client.sendMessage(userId, 'Could not send PDF at this time.');
            }

            userState[userId] = 'final_confirm';
            const confirmPoll = new Poll('Send email or confirm order?', finalConfirmOrderOptions);
            await client.sendMessage(userId, confirmPoll);
        }

        else if (userState[userId] === 'final_confirm') {
            if (option === 'Send email') {
                userState[userId] = 'typing_email';
                await client.sendMessage(userId, 'Please type your email address:');
            } else if (option === 'Confirm Purchase' || option === 'Confirm Order') {
                userState[userId] = 'choose_fulfillment';
                await sendFulfillmentPoll(userId, 'Choose delivery method to place order:');
            } else if (option === 'Cancel' || option.toLowerCase() === 'no') {
                await client.sendMessage(userId, 'Cancelled. Type "Hi" to start over.');
                resetUser(userId);
            }
        }
        else if (userState[userId] === 'choose_fulfillment' && (option === 'Delivery (3-4 Days)' || option === 'Pickup')) {
            if (user.lastQuote) user.lastQuote.fulfillment = option;
            user.fulfillment = option;
            await placeOrder({ userId, user, displayName });
        }

        else if (option === 'Confirm Order') {
            const quote = user.lastQuote;
            if (!quote) {
                await client.sendMessage(userId, 'Please generate a quote first (select a product and enter size).');
                resetUser(userId);
                return;
            }
            userState[userId] = 'choose_fulfillment';
            await sendFulfillmentPoll(userId, 'Choose delivery method to place order:');
        }
        else if (option === 'Cancel') {
            await client.sendMessage(userId, 'Order cancelled. Type "Hi" to start over.');
            resetUser(userId);
        }

        else if (userState[userId] === 'manage_select_order') {
            const match = option.match(/#(\d+)/);
            if (!match) {
                await client.sendMessage(userId, 'Please select a valid order option.');
                return;
            }
            const id = match[1];
            const order = (user.manageOrders || []).find(o => String(o.id) === id);
            if (!order) {
                await client.sendMessage(userId, 'Could not find that order. Please pick again.');
                return;
            }
            user.manageOrderId = id;
            user.manageCurrentOrder = order;
            userState[userId] = 'manage_action';
            const details = [
                `Order #${order.id}`,
                `Status: ${order.status || 'Pending'}`,
                `Scheduled: ${order.scheduledDate || 'Not set'} ${order.scheduleTime || ''}`.trim(),
                `Fulfillment: ${order.fulfillment || 'N/A'}`,
                `Total: $${order.price || '0.00'}`
            ].join('\n');
            await client.sendMessage(userId, details);
            const poll = new Poll(`Order #${id}: choose an action`, [
                withEmoji('📅', 'Reschedule'),
                withEmoji('❌', 'Cancel'),
                withEmoji('📋', 'Back to orders')
            ]);
            await client.sendMessage(userId, poll);
        }
        else if (userState[userId] === 'manage_action') {
            const id = user.manageOrderId;
            if (!id) {
                await client.sendMessage(userId, 'No order selected. Please start with Manage Orders.');
                resetUser(userId);
                return;
            }
            if (option === 'Reschedule') {
                userState[userId] = 'manage_resched_date';
                await client.sendMessage(userId, 'Enter new date (YYYY-MM-DD):');
            } else if (option === 'Cancel') {
                userState[userId] = 'manage_cancel_confirm';
                const poll = new Poll(`Cancel order #${id}?`, [
                    withEmoji('✅', 'Yes, cancel'),
                    withEmoji('❌', 'No')
                ]);
                await client.sendMessage(userId, poll);
            } else if (option === 'Back to orders') {
                userState[userId] = 'manage_select_order';
                const pollData = buildManageOrderPoll(userId);
                if (!pollData) {
                    await client.sendMessage(userId, 'No upcoming appointments found to manage.');
                    resetUser(userId);
                } else {
                    user.manageOrders = pollData.orders;
                    const poll = new Poll('Select an order to manage:', pollData.options.map(opt => withEmoji('📋', opt)));
                    await client.sendMessage(userId, poll);
                }
            }
        }
        else if (userState[userId] === 'manage_cancel_confirm') {
            const id = user.manageOrderId;
            if (!id) {
                await client.sendMessage(userId, 'No order selected. Please start with Manage Orders.');
                resetUser(userId);
                return;
            }
            if (option === 'Yes, cancel') {
                const deleted = ordersStore.deleteOrder(id);
                if (deleted) {
                    await client.sendMessage(userId, `Order #${id} cancelled.`);
                } else {
                    await client.sendMessage(userId, `Could not cancel order #${id}.`);
                }
                resetUser(userId);
            } else if (option === 'No') {
                await client.sendMessage(userId, 'Cancelled action aborted.');
                resetUser(userId);
            }
        }
    });

    client.initialize();

    const getSystemStatus = () => ({
        ready: isClientReady,
        qr: qrCodeDataUrl,
        state: connectionState,
        error: lastConnectionError
    });

    return { client, getSystemStatus };
}

module.exports = { createBot };

