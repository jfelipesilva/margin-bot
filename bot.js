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
    let wss_auth = {};
    let SUBSCRIB_CHAN_ID = "";
    let pair = "tIOTUSD";

    let ema1 = 68; //should be the lower value
    let ema2 = 72;
    let ema_val1 = 0;
    let ema_val2 = 0;
    let ema_calculated = 0;
    let last_calculated_candle = 0;



//INIT APLICATION
//--------------------------------------------

    wss_auth = new bf_ws('wss://api.bitfinex.com/ws/2');
    
    wss_auth.onopen = () => {
        step1();
    };

    wss_auth.onmessage = (msg) => {
        //console.log(msg);
        let messages = JSON.parse(msg.data);
        if(messages.event == "auth" && messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==1){
            
            //WE ARE NOW LOGGED IN
            //wss_auth.close();
            //console.log(messages);
            step2();

        }else if(messages.event == "auth" && messages.status == "FAILED"){
            utils.log("Falha de autenticação => "+messages.msg);
            wss_auth.close();
        }else if(messages.event == "auth" && messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==0){
            utils.log("sem permissão de escrita");
            wss_auth.close();
        }else if(Array.isArray(messages[2])){
            utils.log(messages);
            utils.log("ARRAY--");
            //echoNestedArray(messages[2]);
            utils.log("");
            utils.log("");
        }else if(messages.event == "subscribed"){
            //SUBSCRIPTION RETURNED == STEP2 CALLBACK
            //console.log(messages);
            SUBSCRIB_CHAN_ID = messages.chanId;
        }else if(messages[0] == SUBSCRIB_CHAN_ID){
            //console.log(messages);
            channel_listener(messages[1])
        }else{
            console.log(messages);
        }
    };


//STEPS
//--------------------------------------------

    step1 = () => {             //=> REQUEST AUTH TO BITFINEX API
        
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

    step2 = () => {             //=> REQUEST SUBSCRIPTION TO A PAIR CHANNELS

        const subscription = JSON.stringify({ 
            event: 'subscribe', 
            channel: 'candles', 
            key: 'trade:1h:'+pair
        });

        wss_auth.send(subscription);
    };

    step3 = (candles) => {      //=> CALCULATE THE EMA HISTORY

        for(i=(candles.length-1);i>=0;i--){
            ema_calc(candles[i][2]);
        };

        last_calculated_candle = candles[0][0];
        ema_calculated = 1;
    };



//FUNCTIONS
//--------------------------------------------


    calculate_live_ema = (candle) => { //CONTROL THE ADVANCE OF CANDLES AND CALCULATE EMA
        console.log("CANDLE["+moment.unix(candle[0]/1000).format("YYYY-MM-DD HH:mm")+"] | OPEN["+candle[1]+"] | CLOSE["+candle[2]+"]");
        if(last_calculated_candle < candle[0]){
            //warn: não está pegando valor do fechamento do candle. Está pegando somente a primeira trade depois que fechou o candle.
            last_calculated_candle = candle[0];
            ema_calc(candle[2]);
            utils.log("CANDLE CLOSED, EMA CALCULATED, NEW CANDLE IS OPEN!");
        }
    }

    ema_calc = (price) => { //CALC OF EMAs
        ema_val1 = (price - ema_val1) * (2 / (1+ema1)) + ema_val1;
        ema_val2 = (price - ema_val2) * (2 / (1+ema2)) + ema_val2;
    };



//LISTENNERS
//--------------------------------------------

    channel_listener = (data) => {

        if(Array.isArray(data[2])){ //USUALY THE FIRST DATA RECEIVED FROM CHANNEL IS AN ARRAY OF LAST 240 CANDLES
            if(!ema_calculated && data.length > ema2){
                var lastR = data[(data.length-1)];
                var firstR = data[0];
                utils.log("LETS DO THIS");
                utils.log("WE HAVE "+data.length+" CANDLES TO CALCULATE EMA IN HISTORY");
                utils.log("LAST CANDLE "+moment.unix(lastR[0]/1000).format("YYYY-MM-DD HH:mm")+" WITH CLOSED PRICE AT "+lastR[4]);
                utils.log("FIRST CANDLE "+moment.unix(firstR[0]/1000).format("YYYY-MM-DD HH:mm")+" WITH CLOSED PRICE AT "+firstR[4]);
                step3(data);
            }else{
                utils.log("INSUFICIENT DATA TO CALCULATE THE EMA. CHECK THE CODE AND TRY AGAIN");
                utils.log("LOGOFF");
                wss_auth.close();
            }
        }else if(Array.isArray(data)){//FREQUENT DATA. USUALY THE LAST CLOSED CANDLE AND THE ACTUAL CANDLE WHICH HASN'T CLOSED YET
            if(ema_calculated){                
                calculate_live_ema(data);
                utils.log('EMA '+ema1+" = "+ema_val1);
                utils.log('EMA '+ema2+" = "+ema_val2);
            }
        }

    };