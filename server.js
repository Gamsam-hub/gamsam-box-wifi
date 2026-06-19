const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

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

app.post('/pay', async (req, res) => {
    const { phone, amount, business, mac, ip } = req.body;
    const tenantId = business ? business.toLowerCase() : "gamsam_boss_router";
    const tx_ref = `GAMSAM-${tenantId.toUpperCase()}-${Date.now()}`;
    
    let network = "MTN";
    if (phone.startsWith("25670") || phone.startsWith("25675") || phone.startsWith("25673") || phone.startsWith("25674")) {
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

    try {
        const response = await axios.post(
            'https://flutterwave.com', 
            payload,
            { headers: { 'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' } }
        );

        sessionRegistry[tx_ref] = {
            status: 'pending',
            voucher: null,
            business: tenantId,
            phone: phone,
            amount: amount,
            mac: mac,
            ip: ip
        };

        console.log(`[STK PUSH] Ref: ${tx_ref} | Target: ${phone}`);
        return res.status(200).json({ status: 'success', tx_ref });
    } catch (error) {
        console.error(`[STK FAILURE]: ${error.message}`);
        return res.status(500).json({ status: 'error', message: "Gateway connection dropped." });
    }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Engine running locally on port ${PORT}`));

// CRASH AND POWER-LOSS PROTECTION SHIELDS
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection Caught cleanly:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception Caught cleanly:', error);
});
