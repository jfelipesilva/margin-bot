const crypto = require('crypto-js');
const request = require('request');
const moment = require('moment');
const bf_ws = require('ws');

const env = require(__dirname + '/_configs');
const utils = require(__dirname + '/utils');

let wss_auth = {};
let CHAN_ID = "";
let SUBSCRIB_CHAN_ID = "";

let ema1 = 68; //should be the lower value
let ema2 = 72;
let ema_val1 = 0;
let ema_val2 = 0;
let ema_calculated = 0;
let last_calculated_candle = 0;

let subscription = JSON.stringify({ 
    event: 'subscribe', 
    channel: 'candles', 
    key: 'trade:1h:tIOTUSD' 
});

wss_auth = new bf_ws('wss://api.bitfinex.com/ws/2');

wss_auth.onmessage = (msg) => {
    //console.log(msg);
    let messages = JSON.parse(msg.data);
    if(messages.event == "auth" && messages.status == "OK" && messages.caps.orders.read==1 && messages.caps.orders.write==1){
        
        //LOGGED IN
        
        //SEARCH FOR OPEN ORDERS
        CHAN_ID = messages.chanId;

        //wss_auth.close();
        console.log(messages);
        wss_auth.send(subscription);

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
        console.log(messages);
        SUBSCRIB_CHAN_ID = messages.chanId;
    }else if(messages[0] == SUBSCRIB_CHAN_ID){
        //console.log(messages);
        if(Array.isArray(messages[1][2])){
            var lastR = messages[1][(messages[1].length-1)];
            var firstR = messages[1][0];
            utils.log("BORA LÁ");
            utils.log("TEMOS "+messages[1].length+" RESULTADOS");
            utils.log("SENDO O ULTIMO RESULTADO ÀS "+moment.unix(lastR[0]/1000).format("YYYY-MM-DD HH:mm")+" AO PREÇO DE "+lastR[4]);
            utils.log("PRIMEIRO RESULTADO ÀS "+moment.unix(firstR[0]/1000).format("YYYY-MM-DD HH:mm")+" AO PREÇO DE "+firstR[4]);
            if(!ema_calculated && messages[1].length > ema2){
                calculate_ema_history(messages[1]);
            }
        }else if(Array.isArray(messages[1])){
            if(ema_calculated){                
                calculate_live_ema(messages[1]);
                utils.log('EMA '+ema1+" = "+ema_val1);
                utils.log('EMA '+ema2+" = "+ema_val2);
            }
        }
    }else{
        console.log(messages);
    }
};

wss_auth.onopen = () => {

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


calculate_ema_history = (candles) => {
    for(i=(candles.length-1);i>=0;i--){
        ema_calc(candles[i][2]);
    };
    last_calculated_candle = candles[0][0];
    ema_calculated = 1;
};

calculate_live_ema = (candle) => {
    console.log(moment.unix(candle[0]/1000).format("YYYY-MM-DD HH:mm")+" | open["+candle[1]+"] | close["+candle[2]+"]");
    if(last_calculated_candle < candle[0]){
        //warn: não está pegando valor do fechamento do candle. Está pegando somente a primeira trade depois que fechou o candle.
        last_calculated_candle = candle[0];
        ema_calc(candle[2]);
        utils.log("CALCULEI SAPORRA DENOVO!");
    }
}

ema_calc = (price) => {
    ema_val1 = (price - ema_val1) * (2 / (1+ema1)) + ema_val1;
    ema_val2 = (price - ema_val2) * (2 / (1+ema2)) + ema_val2;
};