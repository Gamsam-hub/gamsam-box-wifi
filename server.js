// 1. Move ALL your core package requires to the very top lines
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path'); // Path utility module
require('dotenv').config();

// 2. Initialize your App application instance immediately
const app = express();

// 3. Apply your core configuration middleware layers
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'verif-hash']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Tell the app to serve your static assets safely from the cloud repository
app.use(express.static(path.join(__dirname)));

// 5. Serve your untouched index.html template design layout on the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ... Leave your central tenant registry and remaining code exactly as it is below this line


// CENTRAL TENANT REGISTRY
const businessTenants = {
    "gamsam_boss_router": { 
        routerIp: "192.168.1.220", 
        apiUser: "gamsam_backend",
        apiPass: "BossSecurePass9944",
        apiPort: 80,
        isBoss: true 
    }
};

let sessionRegistry = {};
let activeVouchers = {}; 

app.get('/', (req, res) => {
    res.status(200).send("Gamsam System Online. 🚀");
});
// PAY ROUTE
// UPDATE ONLY THIS EXCLUSIVELY INSIDE YOUR SERVER.JS '/pay' BLOCK:
app.post('/pay', async (req, res) => {
    const { phone, amount, business, mac, ip } = req.body;
    const tenantId = business ? business.toLowerCase() : "gamsam_boss_router";
    const tx_ref = `GAMSAM-${tenantId.toUpperCase()}-${Date.now()}`;
    
    let network = "MTN";
    if (phone.startsWith("25670") || phone.startsWith("25675") || phone.startsWith("25674")) {
        network = "AIRTEL";
    }

    const payload = {
        "amount": amount,
        "currency": "UGX",
        "phone_number": phone,
        "network": network,
        "email": `${tenantId}@gamsam-wifi.com`,
        "tx_ref": tx_ref,
        "order_id": "WIFI-" + Date.now(),
        "fullname": "Premium Wi-Fi Subscriber"
    };

    sessionRegistry[tx_ref] = {
        status: 'pending',
        voucher: null,
        business: tenantId,
        phone: phone,
        amount: amount,
        mac: mac,
        ip: ip
    };

    // ⚡ FIX: Fire-and-forget the outbound network query instantly in the background!
    axios.post(
        'https://api.flutterwave.com/v3/charges?type=mobile_money_uganda', 
        payload,
        { headers: { 'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' } }
    ).then(response => {
        console.log(`[STK GATE SUCCESS] Handshaked with Uganda Carrier systems for ref: ${tx_ref}`);
    }).catch(error => {
        console.error(`[STK LIVE EXCEPTION]: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        if(sessionRegistry[tx_ref]) sessionRegistry[tx_ref].status = 'failed';
    });

    // 🏆 MULTI-TENANT FIX: Direct browser back to local router memory zone instantly 
        // This cuts the cloud connection early so the user's browser never experiences a timeout!
        const routerGateway = "192.168.88.1"; // Your hAP lite gateway IP
        
        return res.redirect(`http://${routerGateway}/login?tx_ref=${tx_ref}&phone=${phone}&amount=${amount}`);

    } catch (globalError) {
        console.error(`[PAY ROUTE CRITICAL FAILURE]:`, globalError);
        return res.status(500).send('Internal Gate Error');
    }
});
});


app.post('/webhook', async (req, res) => {
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== process.env.FLW_SECRET_HASH) return res.status(401).end();

    const payload = req.body;
    if (payload.status === 'successful' && payload.currency === 'UGX') {
        const referenceKey = payload.tx_ref;
        
        if (sessionRegistry[referenceKey] && sessionRegistry[referenceKey].status === 'pending') {
            const currentSession = sessionRegistry[referenceKey];
            const tenantId = currentSession.business;

            const grossAmount = Number(currentSession.amount);
            const numericToken = Math.floor(100000 + Math.random() * 900000); 
            const finalVoucherCode = `GSM-${numericToken}`;
            
            // FIX: Explicitly set UGX 1000 plan to give exactly 24 Hours duration
            let durationHours = 24; 
            if (grossAmount === 5000) durationHours = 168;   // 7 Days
            if (grossAmount === 20000) durationHours = 720;  // 30 Days
            
            const expiryTime = Date.now() + (durationHours * 60 * 60 * 1000);

            activeVouchers[finalVoucherCode] = {
                business: tenantId,
                expiry: expiryTime,
                amount: grossAmount
            };

            currentSession.status = 'paid';
            currentSession.voucher = finalVoucherCode;
            
            console.log(`[PAID SUCCEEDED] Voucher: ${finalVoucherCode} | Duration: ${durationHours} Hours`);
        }
    }
    res.status(200).end();
});

app.get('/check-status/:tx_ref', (req, res) => {
    const record = sessionRegistry[req.params.tx_ref];
    if (record) return res.json(record);
    return res.json({ status: 'not_found' });
});

app.get('/check-voucher/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const voucher = activeVouchers[code];
    if (!voucher) return res.json({ status: 'invalid' });
    
    const timeLeftMs = voucher.expiry - Date.now();
    if (timeLeftMs <= 0) {
        delete activeVouchers[code];
        return res.json({ status: 'expired' });
    }
    return res.json({ status: 'active' });
});

// DEV TESTING BACKDOOR: Simulate a payment match locally on your laptop browser
app.get('/simulate-success/:tx_ref', (req, res) => {
    const referenceKey = req.params.tx_ref;
    if (sessionRegistry[referenceKey] && sessionRegistry[referenceKey].status === 'pending') {
        const numericToken = Math.floor(100000 + Math.random() * 900000); 
        const finalVoucherCode = `GSM-${numericToken}`;
        
        sessionRegistry[referenceKey].status = 'paid';
        sessionRegistry[referenceKey].voucher = finalVoucherCode;
        
        activeVouchers[finalVoucherCode] = {
            business: sessionRegistry[referenceKey].business,
            expiry: Date.now() + (24 * 60 * 60 * 1000), // 24 Hours default mock simulation duration mapping
            amount: sessionRegistry[referenceKey].amount
        };
        return res.status(200).send(`Local Simulation Complete. Voucher Code: ${finalVoucherCode}`);
    }
    return res.status(404).send("Transaction reference context profile window expired.");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Engine running smoothly on port ${PORT}`);
});

// CRASH AND POWER-LOSS PROTECTION SHIELDS
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection Caught cleanly:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception Caught cleanly:', error);
});
