//IMPORTS
//--------------------------------------------

    const crypto = require('crypto-js');
    const request = require('request');
    const moment = require('moment');
    const bf_ws = require('ws');

    const env = require(__dirname + '/_configs');
    const utils = require(__dirname + '/utils');

//https://docs.bitfinex.com/v2/docs/abbreviations-glossary

//VARS
//--------------------------------------------
    let wss_auth = {};
    let CHAN_ID_auth = "";

    let setup = {
        //minimum which you want do extract from the market each month
        living_cost: 2000, 

        //if you dont have much money and want to simulate from this value what would be your results
        simulate_balance: 150 
    };

    let results = {
        simulated_balance: 0
    };

    let tradeControl = {'active':false };
    let openedPositions = [];


    let margin_wallet = {'currency':'USD', 'balance':0, 'balance_available':0};
    let wallet_start_balance = "150";


    let authChanTimeout = 0;
    let defaut_timeout = 30; //SECONDS

    setInterval(function(){
        authChanTimeout++;

        if(authChanTimeout>defaut_timeout){
            teminateApplication('Auth Channel Timeout');
        }

    },1000);



//INIT APLICATION
//--------------------------------------------
    
    console.log(" ");
    utils.log(":::: :::: :::: :::: :::: :::: :::: ::::");
    utils.log(":::: PERFORMANCE  BOT  HAS STARTED ::::");
    utils.log(":::: :::: :::: :::: :::: :::: :::: ::::");
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
            }else if(messages.status == "OK"){

                //WE ARE NOW LOGGED IN
                CHAN_ID_auth = messages.chanId;

            }
        }else if(messages[0] == CHAN_ID_auth){
            auth_channel_listener(messages);
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


//FUNCTIONS
//--------------------------------------------


    calcBotResults = () => {

        let bot_total_result = (margin_wallet.balance*100/wallet_start_balance)-100;
        bot_total_result = bot_total_result.toFixed(2);

        let postData = [{
            'balance':margin_wallet.balance,
            'datetime': moment().utc().format(),
            'percentage': bot_total_result
        }];

        request.post(
            {
                url: 'https://api.powerbi.com/beta/af3bb3b0-5631-41bb-8218-2fc84f588325/datasets/8704c14b-104e-4156-a6df-2b803cc985e0/rows?key=QWrbYqyV1mE9yKqqIZ696Z0CW6od95%2B9mHIcVi4UDyrqAndHKlButz%2Bf38FpafixvYaxBxk4entWnP%2Fi8PxqAg%3D%3D',
                body: postData,
                json: true
            },
            function (err, httpResponse, body) {
                //console.log(err, body);
            }
        );
    };

    positionsUpdatesPB = (position) => {

        let postData = [{
            'datetime': moment().utc().format(),
            'symbol':position[0],
            'status':position[1],
            'amount':position[2],
            'base_price':position[3],
            'margin_funding':position[4],
            'pl':position[6],
            'pl_perc':position[7],
            'leverage':position[8]
        }];

        request.post(
            {
                url: 'https://api.powerbi.com/beta/af3bb3b0-5631-41bb-8218-2fc84f588325/datasets/c7681031-b20a-4486-ae72-07b4d26032c0/rows?key=aEfR%2Ff3zzR4bfIdzdeo%2FnjaOGE5Iy4bLdP9z7mVqL9L2ah9q0fOWCnS6OvjhX0jtKhWxtjWBatGhj0ZkY%2F%2BH3g%3D%3D',
                body: postData,
                json: true
            },
            function (err, httpResponse, body) {
                //console.log(err, body);
            }
        );

    };

    tradeExecuted = (trade) => {
        openedPositions.forEach(function(position,i){
            if(position.closethis && position.symbol==trade.symbol){
                if(Math.abs(position.amount)==Math.abs(trade.amount)){

                    let postTrade = [{
                        'datetime': moment().utc().format(),
                        'symbol':position.symbol,
                        'amount':position.amount,
                        'price_in':position.base_price,
                        'price_out':trade.price,
                        'trade_result':(((trade.price/position.base_price)-1)*100)
                    }];

                    if(position.amount < 0){ //short
                        postTrade[0].trade_result = postTrade[0].trade_result*(-1);
                    }

                    //WALLET RESULT
                        let balance_out = Math.abs(position.amount*trade.price);
                        let gain_loss = balance_out * postTrade[0].trade_result / 100;
                        if(postTrade[0].trade_result < 0){ //loss
                            gain_loss = gain_loss*(-1);
                        }
                        postTrade[0].wallet_result = (margin_wallet.balance/(margin_wallet.balance+gain_loss))-1;

                    request.post(
                        {
                            url: 'https://api.powerbi.com/beta/af3bb3b0-5631-41bb-8218-2fc84f588325/datasets/9f185bae-9e78-47d1-b29f-4485feb58de7/rows?key=6UcfMYMHAHAqJDtZsMLD%2FTIYpxzcK%2FFfOaD%2Bk%2BxZV2Tb8y%2BWIP%2FJ3NqIReAwniv9L12iBDo0uDhfGAuQxP1mDw%3D%3D',
                            body: postTrade,
                            json: true
                        },
                        function (err, httpResponse, body) {
                            //console.log(err, body);
                        }
                    );

                    openedPositions.splice(i,1);
                }
            }
        });
    };

    positionClosed = (symbol) => {
        openedPositions.forEach(function(position,i){
            if(!position.closethis && position.symbol == symbol){
                openedPositions[i].closethis = true;
                //NOW WAIT FOR TRADE EXECUTION (TE) TO COMPLETE THIS TRANSACTION
            }
        });
    };
    
    walletUpdated = () => {};

    teminateApplication = (msg) => {
        utils.log('APPLICATION WAS TERMINATED :: '+msg, 'danger');
        process.exit(1);
    };

    function formatMoney(amount, decimalCount = 2, decimal = ".", thousands = ",") {
        try {
            decimalCount = Math.abs(decimalCount);
            decimalCount = isNaN(decimalCount) ? 2 : decimalCount;

            const negativeSign = amount < 0 ? "-" : "";

            let i = parseInt(amount = Math.abs(Number(amount) || 0).toFixed(decimalCount)).toString();
            let j = (i.length > 3) ? i.length % 3 : 0;

            return negativeSign + (j ? i.substr(0, j) + thousands : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + thousands) + (decimalCount ? decimal + Math.abs(amount - i).toFixed(decimalCount).slice(2) : "");
        } catch (e) {
            console.log(e)
        }
    };


//LISTENNERS
//--------------------------------------------

    auth_channel_listener = (data) => {
        authChanTimeout = 0;

        //in a trade execution, first triggers the position events (pn,pu,pc), then trades events (te,tu) and then wallet events (wu)

        if(data[1] != "hb"){ //HEARTBEAT

            if(data[1] == "ws"){ //WALLET SNAPSHOT
                utils.log("::ws::");
                data[2].forEach(function(res, i){
                    if(res[0]=="margin" && res[1] == margin_wallet.currency){
                        margin_wallet.balance = res[2];
                        margin_wallet.balance_available = res[4];
                        calcBotResults();
                    }
                });
                utils.log(JSON.stringify(margin_wallet));
            }

            if(data[1] == "wu"){ //WALLET UPDATE
                utils.log("::wu::");
                if(data[2][0]=="margin" && data[2][1] == margin_wallet.currency){
                    margin_wallet.balance = data[2][2];
                    margin_wallet.balance_available = data[2][4];
                    calcBotResults();

                }
                utils.log(JSON.stringify(margin_wallet));
            }


            if(data[1] == "ps"){//=> POSITIONS
                utils.log("::ps::");
                data[2].forEach(function(res,i){
                    if(res[1] == "ACTIVE"){
                        openedPositions.push({
                            "symbol":res[0],
                            "status":res[1],
                            "amount":res[2],
                            "base_price":res[3],
                            "closethis":false
                        });
                    }
                });
            }

            if(data[1] == "pc" || data[1] == "pu" || data[1] == "pn"){//=> POSITION
                positionsUpdatesPB(data[2]);
            }

            if(data[1] == "pn"){
                utils.log("::pn::");
                openedPositions.push({
                    "symbol":data[2][0],
                    "status":data[2][1],
                    "amount":data[2][2],
                    "base_price":data[2][3],
                    "closethis":false
                });
            }

            if(data[1] == "pu"){
                utils.log("::pu::");
                openedPositions.forEach(function(position,i){
                    if(openedPositions[i].symbol == data[2][0]){
                        openedPositions[i].amount = data[2][2];
                        openedPositions[i].base_price = data[2][3];
                    }
                });
            }

            if(data[1] == "pc"){
                utils.log("::pc::");
                positionClosed(data[2][0]);
            }

            if(data[1] == "te"){ //=> TRADE EXECUTED
                utils.log("::te::");
                tradeExecuted({
                    'symbol':data[2][1],
                    'amount':data[2][4],
                    'price':data[2][5]
                });
                
            }

        }  
    }

