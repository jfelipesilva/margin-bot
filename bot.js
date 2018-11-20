//IMPORTS
//--------------------------------------------

    const crypto = require('crypto-js');
    const request = require('request');
    const moment = require('moment');
    const bf_ws = require('ws');

    const env = require(__dirname + '/_configs');
    const utils = require(__dirname + '/utils');


//VARS
//--------------------------------------------
    let test_mode = true;
    let wss_auth = {};
    let CHAN_ID_auth = "";
    let CHAN_ID_candles = "";
    let CHAN_ID_ticker = "";
    let CHAN_ID_books = "";

    let pair = "tIOTUSD";
    let margin_wallet = {"currency":"USD", "balance":0, "balance_available":0};
    let position = 0; 
    let wallet_start_balance = "24.1291672";
    let bot_total_result = 0;

    let book_length = 1;
    let bid = 0;
    let ask = 0;
    let last_price = 0;

    let order_req = 0;
    let order_req_id = 0;
    let cancel_upon_req = 0;

    let ema1 = 37; //should be the lower value
    let ema2 = 81;
    let ema_val1 = 0;
    let ema_val2 = 0;
    let ema_calculated = 0;
    let last_calculated_candle = 0;
    let cross_direction = 0;

    let bot_data = {
        'price':last_price,
        'wallet':margin_wallet.balance,
        'wallet_before':wallet_start_balance,
        'wallet_partial':0,
        'bot_result':0,
        'position_base_price':0,
        'position_amount':0,
        'position_percent':0,
        'position_result':0
    }

    let authChanTimeout = 0;
    let ticketChanTimeout = 0;
    let candlesChanTimeout = 0;
    let defaut_timeout = 30; //SECONDS

    setInterval(function(){
        authChanTimeout++;
        ticketChanTimeout++;
        candlesChanTimeout++;

        if(authChanTimeout>defaut_timeout){
            teminateApplication('Auth Channel Timeout');
        }

        if(ticketChanTimeout>defaut_timeout){
            teminateApplication('Ticker Channel Timeout');
        }

        if(candlesChanTimeout>defaut_timeout){
            teminateApplication('Candles Channel Timeout');
        }

    },1000);



//INIT APLICATION
//--------------------------------------------
    
    console.log(" ");
    utils.log(":::: :::: :::: :::: :::: :::: ::::");
    utils.log(":::: MARGIN :BOT: HAS STARTED ::::");
    utils.log(":::: :::: :::: :::: :::: :::: ::::");
    console.log(" ");

    wss_auth = new bf_ws('wss://api.bitfinex.com/ws/2');
    
    wss_auth.onopen = () => {
        step1();
    };

    wss_auth.onmessage = (msg) => {
        //console.log(msg);
        let messages = JSON.parse(msg.data);
        //console.log(messages);
        if(messages.event == "auth"){
            if(messages.status == "FAILED"){
                utils.log("AUTHENTICATION FAILED => "+messages.msg);
                wss_auth.close();
            }else if(messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==0){
                utils.log("YOUT KEYS DOESN'T HAVE PERMISSION TO WRITE ORDERS");
                wss_auth.close();
            }else if(messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==1){

                //WE ARE NOW LOGGED IN
                CHAN_ID_auth = messages.chanId;
                step2();

            }
        }else if(messages.event == "auth"){
        }else if(messages.event == "subscribed"){
            if(messages.channel == "candles") CHAN_ID_candles = messages.chanId;
            else if(messages.channel == "ticker") CHAN_ID_ticker = messages.chanId;
            else if(messages.channel == "books") CHAN_ID_books = messages.chanId;
        }else if(messages[0] == CHAN_ID_auth){
            auth_channel_listener(messages);
        }else if(messages[0] == CHAN_ID_candles){
            candles_channel_listener(messages[1]);
        }else if(messages[0] == CHAN_ID_ticker){
            ticker_channel_listener(messages[1]);
        }else if(messages[0] == CHAN_ID_books){
            books_channel_listener(messages[1]);
        }else{
            //console.log(messages);
        }
    };


//STEPS
//--------------------------------------------

    step1 = () => { //=> REQUEST AUTH TO BITFINEX API
        
        const apiKey = env.BITFINEX_APIKEY;
        const apiSecret = env.BITFINEX_APISECRET;

        const authNonce = Date.now() * 1000;
        const authPayload = 'AUTH' + authNonce;
        const authSig = crypto
            .HmacSHA384(authPayload, apiSecret)
            .toString(crypto.enc.Hex)

        const payload = {
            apiKey,
            authSig,
            authNonce,
            authPayload,
            //dms: 4, uncomment to enable dead-man-switch
            event: 'auth'
        };

        wss_auth.send(JSON.stringify(payload));
    };

    step2 = () => { //=> REQUEST SUBSCRIPTIONS

        const candles_subscription = { 
            event: 'subscribe', 
            channel: 'candles', 
            key: 'trade:1h:'+pair
        };

        const ticker_subscription = { 
            event: "subscribe", 
            channel: "ticker", 
            symbol: pair
        };

        const books_subscription = { 
            event: "subscribe", 
            channel: "book", 
            symbol: pair,
            len: book_length
        };

        //
        wss_auth.send(JSON.stringify(candles_subscription));
        wss_auth.send(JSON.stringify(ticker_subscription));
        //wss_auth.send(JSON.stringify(books_subscription));
        

    };

    step3 = (candles) => { //=> CALCULATE THE EMA HISTORY

        for(i=(candles.length-1);i>=0;i--){
            ema_calc(candles[i][2]);
        };

        last_calculated_candle = candles[0][0];
        ema_calculated = 1;
    };



//FUNCTIONS
//--------------------------------------------


    calculate_live_ema = (candle) => { //=> CONTROL THE ADVANCE OF CANDLES AND CALCULATE EMA
        //utils.log("CANDLE["+moment.unix(candle[0]/1000).format("YYYY-MM-DD HH:mm")+"] | OPEN["+candle[1]+"] | CLOSE["+candle[2]+"]");
        if(last_calculated_candle < candle[0]){
            //warn: não está pegando valor do fechamento do candle. Está pegando somente a primeira trade depois que fechou o candle.
            last_calculated_candle = candle[0];
            ema_calc(candle[2]);
            cross_control(candle);
            //utils.log("CANDLE CLOSED, EMA CALCULATED, NEW CANDLE IS OPEN!");
        }
    };

    ema_calc = (price) => { //=> CALC OF EMAs
        if(ema_val1== 0){
            ema_val1 = price;
            ema_val2 = price;
        }
        ema_val1 = (price - ema_val1) * (2 / (1+ema1)) + ema_val1;
        ema_val2 = (price - ema_val2) * (2 / (1+ema2)) + ema_val2;
    };

    cross_control = (candle) => { //=> CROSS CONTROL
        let price = candle[2];
        let time = moment.unix(candle[0]/1000).format("YYYY-MM-DD HH:mm");
        if(ema_val1 > ema_val2 && cross_direction != 'up'){
            if(cross_direction==0){
                utils.log("BOT STARTED IN MIDDLE OF LONG POSITION.  NEED TO WAIT FOR THE EMAs TO CROSS AGAIN TO START OUR POSITION");
            }else{
                utils.log("CROSSED UP ("+price+") ("+ema_val1+" "+ema_val2+")");
                openLongPosition();

            }
            cross_direction = "up";
        }else if(ema_val1 < ema_val2 && cross_direction != 'down'){
            if(cross_direction==0){
                utils.log("BOT STARTED IN MIDDLE OF SHORT POSITION.  NEED TO WAIT FOR THE EMAs TO CROSS AGAIN TO START OUR POSITION");
            }else{
                utils.log("CROSSED DOWN ("+price+") ("+ema_val1+" "+ema_val2+")");
                openShortPosition();

            }
            cross_direction = "down";
        }
    };

    cancelOrder = (id) => {
        wss_auth.send(JSON.stringify([
            0,
            "oc",
            null,
            {
                "id": id
            }
        ]));
    };

    openLongPosition = () => {
        if(order_req_id == 0){
            if(position != 0 && position.amount > 0){
                utils.log("ONE LONG POSITION ALREADY OPENED");
            }else{
                let price = ask;
                let amount = Math.floor(margin_wallet.balance/price);
                if(position != 0 && position.amount < 0) amount = amount+Math.abs(position.amount);

                order_req = {
                    cid: Date.now(),
                    type: "LIMIT",
                    symbol: pair,
                    amount: amount.toString(),
                    price: price.toString(),
                    hidden: 0
                }

                utils.log("OPENLONGPOSITION: "+JSON.stringify(order_req));

                setTimeout(function(){
                    order_req_timeout("long");
                }, 20000);

                order_req_id = 1;

                wss_auth.send(JSON.stringify([
                    0,
                    'on',
                    null,
                    order_req
                ]));
            }
        }
    };

    openShortPosition = () => {
        if(order_req_id == 0){
            if(position != 0 && position.amount < 0){
                utils.log("ONE SHORT POSITION ALREADY OPENED");
            }else{
                let price = bid;
                let amount = Math.floor(margin_wallet.balance/price);
                if(position != 0 && position.amount > 0) amount = amount+position.amount;

                order_req = {
                    cid: Date.now(),
                    type: "LIMIT",
                    symbol: pair,
                    amount: "-"+amount,
                    price: price.toString(),
                    hidden: 0
                }

                utils.log("OPENSHORTPOSITION: "+JSON.stringify(order_req));

                setTimeout(function(){
                    order_req_timeout("short");
                }, 20000);

                order_req_id = 1;

                wss_auth.send(JSON.stringify([
                    0,
                    'on',
                    null,
                    order_req
                ]));
            }
        }
    };

    order_req_timeout = (position) => {
        if(order_req!=0 && order_req_id==1){//SOME HOW THE ORDER DID NOT GO THROUGH
            if(position == "short") openShortPosition();
            else if(position == "long") openLongPosition();
        }else if(order_req_id>1){ //ORDER STILL OPEN
            cancel_upon_req = position;
            cancelOrder(order_req_id);
        }
    };

    order_req_again = () => {
        order_req_id = 0;
        if(cancel_upon_req == "short") openShortPosition();
        else if(cancel_upon_req == "long") openLongPosition();
        cancel_upon_req = 0;
    };

    pushGraphToPowerBI = () => {

        if(ema_val1>0){
            const loop = [['EMA1',ema_val1],['EMA2',ema_val2],['IOTA',last_price]];
            let postData = [];

            loop.forEach(function(res, i){

                postData = [{
                   'graphLabel':res[0],
                   'graphValue':res[1],
                   'time': moment().format()
                }];

                //console.log(postData);

                request.post(
                    {
                        url: 'https://api.powerbi.com/beta/bc41373d-f70e-4c65-8c3e-0f28c45a1d0e/datasets/cef5bc47-de13-4933-b12c-b7adb594c98f/rows?key=HdIO2PedZ0FwOKgxj1rZjZXasY6luM6LLSR5W3E%2BzPOMWcj0AArFShZ0fJ04ILtYLCBk89O73UBAeZ4y7OaBqA%3D%3D',
                        body: postData,
                        json: true
                    },
                    function (err, httpResponse, body) {
                        //console.log(err, body);
                    }
                );
            });
        }

    };

    pushDataToPowerBI = () => {

        let postData = [bot_data];

        //console.log(postData);

        request.post(
            {
                url: 'https://api.powerbi.com/beta/bc41373d-f70e-4c65-8c3e-0f28c45a1d0e/datasets/0afeb3a7-6ef3-4173-a487-ace5ec4edd2f/rows?key=EcOhAIs4K5RojM9DAotmbS%2BPhIrkgDl2q4bjof9LP6QByOIkQkd8zbXKzAdrxsY4kBJt2vyw4SBJytwYIhy7%2Bw%3D%3D',
                body: postData,
                json: true
            },
            function (err, httpResponse, body) {
                //console.log(err, body);
            }
        );

        setTimeout(pushDataToPowerBI,60000); //each minute
    };

    pushWalletToPowerBI = () => {

        let postData = [{
            'wallet':bot_data.wallet_partial,
            'time': moment().format()
        }];

        //console.log(postData);

        request.post(
            {
                url: 'https://api.powerbi.com/beta/bc41373d-f70e-4c65-8c3e-0f28c45a1d0e/datasets/4a83451a-3991-429e-9bb0-57822850ce6f/rows?key=N82xtyomrHsIu6UqkYfBWmVT75FIKuzkRiVSHMezCfulZC8rLOUL8T2tO0nv2BODfSZ6II6v0n009aGcoWP%2B%2BQ%3D%3D',
                body: postData,
                json: true
            },
            function (err, httpResponse, body) {
                //console.log(err, body);
            }
        );

        setTimeout(pushWalletToPowerBI,3600000); //hourly
    };

    calcBotResults = () => {
        bot_total_result = (margin_wallet.balance*100/wallet_start_balance)-100;
        bot_total_result = bot_total_result.toFixed(2);
    };

    updateBotData = () => {

        let position_percent = 0;
        if(position.amount > 0){
            position_percent = ((last_price/1.001)*100/(position.base_price*1.001))-100;
        }else{
            position_percent = (((last_price*1.001)*100/(position.base_price/1.001))-100)*(-1);
        }

        let wallet_partial = margin_wallet.balance*((position_percent/100)+1);

        bot_data.price=last_price;
        bot_data.wallet=margin_wallet.balance;
        bot_data.wallet_before=wallet_start_balance;
        bot_data.wallet_partial=wallet_partial;
        bot_data.bot_result=bot_total_result;
        bot_data.position_base_price=position.base_price;
        bot_data.position_amount=position.amount;
        bot_data.position_percent=position_percent;
        bot_data.position_result=wallet_partial-margin_wallet.balance;

        setTimeout(updateBotData,10000);
    };
    
    teminateApplication = (msg) => {
        utils.log('APPLICATION WAS TERMINATED :: '+msg, 'danger');
        process.exit(1);
    };


//LISTENNERS
//--------------------------------------------

    candles_channel_listener = (data) => {
        candlesChanTimeout = 0;
        if(Array.isArray(data[2])){ //USUALY THE FIRST DATA RECEIVED FROM CHANNEL IS AN ARRAY OF LAST 240 CANDLES
            if(!ema_calculated && data.length > ema2){
                /*
                var lastR = data[(data.length-1)];
                var firstR = data[0];
                utils.log("LETS DO THIS");
                utils.log("WE HAVE "+data.length+" CANDLES TO CALCULATE EMA IN HISTORY");
                utils.log("LAST CANDLE "+moment.unix(lastR[0]/1000).format("YYYY-MM-DD HH:mm")+" WITH CLOSED PRICE AT "+lastR[4]);
                utils.log("FIRST CANDLE "+moment.unix(firstR[0]/1000).format("YYYY-MM-DD HH:mm")+" WITH CLOSED PRICE AT "+firstR[4]);
                */
                step3(data);
                updateBotData();
                pushDataToPowerBI();
                pushWalletToPowerBI();
            }else{
                utils.log("INSUFICIENT DATA TO CALCULATE THE EMA. CHECK THE CODE AND TRY AGAIN");
                utils.log("LOGOFF");
                wss_auth.close();
            }
        }else if(Array.isArray(data)){//FREQUENT DATA. USUALY THE LAST CLOSED CANDLE AND THE ACTUAL CANDLE WHICH HASN'T CLOSED YET
            if(ema_calculated){                
                calculate_live_ema(data);
                //utils.log(('EMA '+ema1+' = '+ema_val1).padEnd(35, ' ')+(' EMA '+ema2+' = '+ema_val2).padEnd(35, ' ')+ moment.unix(data[0]/1000).format("YYYY-MM-DD HH:mm"));
            }
        }

    };

    auth_channel_listener = (data) => {
        authChanTimeout = 0;
        if(data[1] != "hb"){ //HEARTBEAT

            if(data[1] == "ws"){ //WALLET SNAPSHOT
                data[2].forEach(function(res, i){
                    if(res[0]=="margin" && res[1] == margin_wallet.currency){
                        margin_wallet.balance = res[2];
                        margin_wallet.balance_available = res[4];
                        //wallet_start_balance = margin_wallet.balance;
                        calcBotResults();
                    }
                });
                utils.log(JSON.stringify(margin_wallet));
            }

            if(data[1] == "wu"){ //WALLET UPDATE
                if(data[2][0]=="margin" && data[2][1] == margin_wallet.currency){
                    margin_wallet.balance = data[2][2];
                    margin_wallet.balance_available = data[2][4];
                    console.log(" ");
                    calcBotResults();
                    utils.log("BOT RESULTS: "+bot_total_result+"%", "info");
                    console.log(" ");

                }
                utils.log(JSON.stringify(margin_wallet));
            }

            if(data[1] == "ps"){//=> POSITION
                data[2].forEach(function(res,i){
                    if(res[0]==pair && res[1] == "ACTIVE"){
                        position = {
                            "symbol":res[0],
                            "status":res[1],
                            "amount":res[2],
                            "base_price":res[3],
                            "pl":res[6],
                            "pl_perc":res[7]
                        };
                    }
                });
            }

            if(data[1] == "pc"){//=> POSITION CLOSE
                if(data[2][0]==pair && data[2][1] == "CLOSED"){
                    position = 0;
                }
            }

            if(data[1] == "pn"){//=> NEW POSITION
                if(data[2][0]==pair && data[2][1] == "ACTIVE"){
                    position = {
                        "symbol":data[2][0],
                        "status":data[2][1],
                        "amount":data[2][2],
                        "base_price":data[2][3],
                        "pl":data[2][6],
                        "pl_perc":data[2][7]
                    };
                }
            }

            if(data[1] == "os"){ //=> ORDER SNAPSHOT
                data[2].forEach(function(res,i){
                    if(res[3]==pair && res[8] == "LIMIT" && res[28]=="API>BFX"){ //TRY TO FIND ORDERS OPENED BY THIS BOT
                        cancelOrder(res[0]);
                    }
                });
            }

            if(data[1] == "n"){ //=> NEW ORDER
                if(order_req_id==1 && data[2][1] == "on-req" && data[2][4][3]==order_req.symbol && data[2][4][6]==order_req.amount && data[2][4][16]==order_req.price){

                    order_req_id = data[2][4][0]; //ORDER ID
                    order_req = 0;
                    utils.log("ORDER REQUESTED: "+order_req_id);
                }
            }

            if(data[1] == "te"){ //=> TRADE EXECUTED
                if(data[2][3]==order_req_id){
                    utils.log("ORDER EXECUTED "+order_req_id);
                    order_req_id = 0;
                }
            }

            if(data[1] == "oc"){ //=> ORDER CANCELED
                if(cancel_upon_req!=0 && data[2][0]==order_req_id){
                    utils.log("ORDER "+order_req_id+" CANCELED UPON TIMEOUT. REQUESTING NEW ONE AGAIN");
                    order_req_again();
                }
            }

        }  
    }

    ticker_channel_listener = (data) => {
        ticketChanTimeout = 0;
        if(data != "hb"){

            /* data = 
              [
                BID,
                BID_SIZE,
                ASK,
                ASK_SIZE,
                DAILY_CHANGE,
                DAILY_CHANGE_PERC,
                LAST_PRICE,
                VOLUME,
                HIGH,
                LOW
              ]
            */

            ask = data[0];
            bid = data[2];
            last_price = data[6];
            /*
            let sell = "SELL FOR: "+bid;
            let buy = "BUY FOR: "+ask;
            let spread = "SPREAD: "+(bid/ask);
            utils.log(buy.padEnd(25,' ')+" "+sell.padEnd(25, ' ')+" "+spread);
            */
            pushGraphToPowerBI();

        }
    };

    books_channel_listener = (data) => {
    };
