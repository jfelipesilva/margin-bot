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

    let margin_wallet = {"currency":"USD", "balance":0, "balance_available":0};
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
            'datetime': moment().format(),
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

    positionsClosed = (position) => {

        let postData = [{
            'datetime': moment().format(),
            'symbol':position[0],
            'amount':position[2],
            'base_price':position[3],
            'margin_funding':position[4],
            'pl':position[6],
            'pl_perc':position[7]
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
        if(data[1] != "hb"){ //HEARTBEAT

            if(data[1] == "ws"){ //WALLET SNAPSHOT
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
                if(data[2][0]=="margin" && data[2][1] == margin_wallet.currency){
                    margin_wallet.balance = data[2][2];
                    margin_wallet.balance_available = data[2][4];
                    calcBotResults();

                }
                utils.log(JSON.stringify(margin_wallet));
            }

            if(data[1] == "pc"){//=> POSITION CLOSE
                if(data[2][1] == "CLOSED"){
                    positionsClosed(data[2]);
                }
            }

        }  
    }

